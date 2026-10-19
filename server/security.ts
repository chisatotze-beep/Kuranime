import crypto from "node:crypto";
import dns from "node:dns/promises";
import net from "node:net";
import type { Request, Response, NextFunction } from "express";

/* ---------------- Header keamanan ---------------- */
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://api.fontshare.com https://fonts.googleapis.com",
  "font-src 'self' data: https://cdn.fontshare.com https://fonts.gstatic.com",
  "img-src 'self' data: https:",
  "connect-src 'self' https://api.jikan.moe",
  "frame-ancestors 'self' https://www.perplexity.ai https://*.pplx.app",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  if (req.path.startsWith("/api/admin") || req.path.startsWith("/api/auth")) res.setHeader("Cache-Control", "no-store");
  next();
}

/* ---------------- Rate limit sederhana (memori) ---------------- */
const buckets = new Map<string, number[]>();
export function hit(key: string, windowMs: number, max: number): boolean {
  const now = Date.now();
  const arr = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  buckets.set(key, arr);
  return arr.length <= max;
}
export function count(key: string, windowMs: number): number {
  const now = Date.now();
  return (buckets.get(key) || []).filter((t) => now - t < windowMs).length;
}
export function clear(key: string) { buckets.delete(key); }
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (!v.length || now - v[v.length - 1] > 3600_000) buckets.delete(k);
}, 10 * 60_000).unref();

/** Batas umum: 300 request / menit per IP untuk /api */
export function apiLimiter(req: Request, res: Response, next: NextFunction) {
  if (!req.path.startsWith("/api")) return next();
  if (!hit(`api:${req.ip}`, 60_000, 300)) return res.status(429).json({ message: "Terlalu banyak permintaan, pelan-pelan ya." });
  next();
}

/* ---------------- Token sesi ---------------- */
export const newToken = () => crypto.randomBytes(32).toString("base64url");
export const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

/* ---------------- Proteksi SSRF untuk index Google Drive ---------------- */
function isPrivateIp(ip: string) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:127.") || v.startsWith("::ffff:10.") || v.startsWith("::ffff:192.168.");
}
export async function assertSafeIndexUrl(raw: string, allowedHosts: string[]) {
  let u: URL;
  try { u = new URL(raw); } catch { throw Object.assign(new Error("Link tidak valid"), { status: 400 }); }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw Object.assign(new Error("Hanya link http/https"), { status: 400 });
  if (u.username || u.password) throw Object.assign(new Error("Link tidak boleh berisi kredensial"), { status: 400 });
  const host = u.hostname.toLowerCase();
  if (!allowedHosts.map((h) => h.toLowerCase()).includes(host))
    throw Object.assign(new Error(`Domain ${host} belum diizinkan. Owner bisa menambahkannya di Pengaturan → Index.`), { status: 403 });
  const addrs = await dns.lookup(host, { all: true }).catch(() => []);
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw Object.assign(new Error("Alamat index tidak diizinkan"), { status: 403 });
  return u;
}

/* ---------------- Validasi password ---------------- */
const COMMON = new Set(["password", "password1", "12345678", "123456789", "1234567890", "qwerty123", "admin123", "iloveyou", "11111111", "00000000", "abcdefgh", "anime123", "rahasia123", "bismillah", "indonesia"]);
export function passwordProblem(pw: string, username?: string): string | null {
  if (pw.length < 8) return "Password minimal 8 karakter";
  if (pw.length > 128) return "Password terlalu panjang";
  if (COMMON.has(pw.toLowerCase())) return "Password terlalu umum, pilih yang lain";
  if (username && pw.toLowerCase().includes(username.toLowerCase())) return "Password jangan mengandung username";
  if (/^(.)\1+$/.test(pw)) return "Password terlalu mudah ditebak";
  return null;
}

/* ---------------- TOTP (Google Authenticator, dll.) ---------------- */
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32Encode(buf: Buffer) {
  let bits = 0, value = 0, out = "";
  for (const b of buf) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
function base32Decode(s: string) {
  const clean = s.replace(/=+$/, "").toUpperCase().replace(/\s/g, "");
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const c of clean) {
    const i = B32.indexOf(c);
    if (i < 0) continue;
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}
function hotp(secret: Buffer, counter: number) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac("sha1", secret).update(buf).digest();
  const o = h[h.length - 1] & 15;
  const code = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(code % 1_000_000).padStart(6, "0");
}
export const newTotpSecret = () => base32Encode(crypto.randomBytes(20));
const usedSteps = new Map<string, number>();
/** cek kode 6 digit (toleransi ±30 detik), tolak kode yang sudah dipakai */
export function verifyTotp(secret: string, code: string, userKey: string) {
  const c = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return false;
  const key = base32Decode(secret);
  const step = Math.floor(Date.now() / 30000);
  for (const d of [0, -1, 1]) {
    const s = step + d;
    const expect = hotp(key, s);
    if (crypto.timingSafeEqual(Buffer.from(expect), Buffer.from(c))) {
      if ((usedSteps.get(userKey) ?? -1) >= s) return false;
      usedSteps.set(userKey, s);
      return true;
    }
  }
  return false;
}
export const otpauthUrl = (secret: string, account: string, issuer: string) =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

/* ---------------- Label perangkat dari User-Agent ---------------- */
export function deviceLabel(ua = "") {
  const os = /Android/i.test(ua) ? "Android" : /iPhone|iPad|iPod/i.test(ua) ? "iOS" : /Windows/i.test(ua) ? "Windows" : /Mac OS/i.test(ua) ? "macOS" : /Linux/i.test(ua) ? "Linux" : "Perangkat lain";
  const br = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /curl|wget|python|node/i.test(ua) ? "Script" : "Browser";
  return `${br} · ${os}`;
}

/** URL aman untuk href (hanya http/https) */
export const isHttpUrl = (u: string) => {
  try { const x = new URL(u); return x.protocol === "https:" || x.protocol === "http:"; } catch { return false; }
};
