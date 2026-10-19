import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "node:http";
import { z } from "zod";
import crypto from "node:crypto";
import { storage, verifyPassword, verifyDummy, memo } from "./storage";
import {
  hit, count, clear, passwordProblem, assertSafeIndexUrl, newTotpSecret, verifyTotp, otpauthUrl, hashToken,
} from "./security";
import { fetchMal, searchMal, searchIndex, listIndexFolder, normalizeFolderUrl, prettyFolderName } from "./sources";
import { createAnimeSchema, commentInputSchema, malAnimeSchema, sourceInputSchema, episodeInputSchema, parseMalId, httpUrl, type User, type SecurityOverview } from "@shared/schema";

declare global {
  namespace Express {
    interface Request { user?: User; token?: string }
  }
}

const wrap = (fn: (req: Request, res: Response) => any) => async (req: Request, res: Response) => {
  try {
    await fn(req, res);
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ message: e.issues[0]?.message || "Data tidak valid", issues: e.issues.map((i) => ({ path: i.path, message: i.message })) });
    const status = e.status || 500;
    if (status >= 500) {
      console.error(`[${req.method} ${req.path}]`, e);
      // pesan dari layanan luar (MAL/index) tetap ditampilkan; error internal disamarkan
      return res.status(status).json({ message: e.expose ? e.message : "Terjadi kesalahan di server. Coba lagi sebentar." });
    }
    res.status(status).json({ message: e.message || "Terjadi kesalahan" });
  }
};
const httpErr = (status: number, message: string) => Object.assign(new Error(message), { status });

function auth(req: Request, res: Response, next: NextFunction) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  const user = token ? storage.getSessionUser(token, req.ip) : undefined;
  if (!user) return res.status(401).json({ message: "Sesi berakhir, silakan login lagi", code: "SESSION_EXPIRED" });
  req.user = user;
  req.token = token;
  next();
}
function ownerOnly(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "owner") return res.status(403).json({ message: "Khusus owner" });
  next();
}

// rate limit login: per IP (10 gagal / 15 menit) & per username (5 gagal / 15 menit)
const LOGIN_WIN = 15 * 60_000;
function loginGuard(ip: string, username: string) {
  if (count(`lf:ip:${ip}`, LOGIN_WIN) >= 10 || count(`lf:u:${username}`, LOGIN_WIN) >= 5)
    throw httpErr(429, "Terlalu banyak percobaan gagal. Coba lagi 15 menit lagi.");
}
function loginFail(ip: string, username: string) {
  hit(`lf:ip:${ip}`, LOGIN_WIN, 1e9);
  hit(`lf:u:${username}`, LOGIN_WIN, 1e9);
}
const ipOf = (req: Request) => req.ip || "unknown";
const uaOf = (req: Request) => String(req.headers["user-agent"] || "").slice(0, 300);
const log = (req: Request, action: string, detail?: string | null, who?: { id: number; username: string } | null) =>
  storage.audit({ userId: who?.id ?? req.user?.id ?? null, username: who?.username ?? req.user?.username ?? null, action, detail: detail ?? null, ip: ipOf(req) });

const credSchema = z.object({
  username: z.string().trim().min(3, "Username minimal 3 karakter").max(32).regex(/^[a-zA-Z0-9_.-]+$/, "Hanya huruf, angka, _ . -"),
  password: z.string().min(8, "Password minimal 8 karakter").max(128),
});
function checkPassword(pw: string, username: string) {
  const p = passwordProblem(pw, username);
  if (p) throw httpErr(400, p);
}

const listQuery = (q: any) => ({
  q: q.q ? String(q.q) : undefined,
  genres: q.genres ? String(q.genres).split(",").filter(Boolean) : undefined,
  excludeGenres: q.exclude ? String(q.exclude).split(",").filter(Boolean) : undefined,
  studio: q.studio ? String(q.studio) : undefined,
  season: q.season ? String(q.season) : undefined,
  year: q.year ? Number(q.year) : undefined,
  type: q.type ? String(q.type) : undefined,
  status: q.status ? String(q.status) : undefined,
  rating: q.rating ? String(q.rating) : undefined,
  source: q.source ? String(q.source) : undefined,
  minScore: q.minScore ? Number(q.minScore) : undefined,
  sort: q.sort ? String(q.sort) : undefined,
  page: q.page ? Number(q.page) : 1,
  limit: q.limit ? Number(q.limit) : 24,
  featured: q.featured === "1",
  quality: q.quality ? String(q.quality) : undefined,
});

// anti-spam komentar: per IP
const commentHits = new Map<string, number[]>();
function commentGuard(ip: string) {
  const now = Date.now();
  const hits = (commentHits.get(ip) || []).filter((t) => now - t < 60 * 60 * 1000);
  if (hits.length && now - hits[hits.length - 1] < 15_000) throw httpErr(429, "Tunggu sebentar sebelum berkomentar lagi");
  if (hits.length >= 20) throw httpErr(429, "Terlalu banyak komentar, coba lagi nanti");
  hits.push(now);
  commentHits.set(ip, hits);
}
// karakter kontrol & zero-width (sering dipakai untuk spam / menyamarkan teks)
const cleanText = (t: string) => t.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, "");

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  const allowedIndexHosts = () => {
    const st = storage.getSettings();
    const hosts = new Set((st.indexHosts || []).map((h) => h.toLowerCase()));
    try { hosts.add(new URL(st.indexRoot).hostname.toLowerCase()); } catch {}
    return [...hosts];
  };
  /* ===================== PUBLIC ===================== */
  app.get("/api/site", wrap((_req, res) => res.json(storage.getSettings())));

  app.get("/api/anime", wrap((req, res) => res.json(storage.queryAnime(listQuery(req.query)))));
  app.get("/api/facets", wrap((_req, res) => res.json(storage.facets())));

  app.get("/api/home", wrap((_req, res) => res.json(memo("home", () => {
    const featured = storage.queryAnime({ featured: true, sort: "added", limit: 6 }).items;
    const latest = storage.queryAnime({ sort: "added", limit: 12 }).items;
    const top = storage.queryAnime({ sort: "score", limit: 12 }).items;
    const all = storage.allAnime(false);
    // musim terbaru yang ada di katalog
    const order = ["winter", "spring", "summer", "fall"];
    const seasonal = all.filter((a) => a.year && a.season).sort((a, b) => (b.year! - a.year!) || order.indexOf(b.season!) - order.indexOf(a.season!));
    const cur = seasonal[0] ? { season: seasonal[0].season!, year: seasonal[0].year! } : null;
    const season = cur ? storage.queryAnime({ season: cur.season, year: cur.year, sort: "score", limit: 12 }).items : [];
    const ongoing = storage.queryAnime({ status: "Currently Airing", sort: "popularity", limit: 12 }).items;
    return { featured: featured.length ? featured : top.slice(0, 5), latest, top, season, ongoing, currentSeason: cur, total: all.length };
  }))));

  app.get("/api/anime/:malId", wrap((req, res) => {
    const d = storage.getDetail(Number(req.params.malId));
    if (!d) throw httpErr(404, "Anime tidak ditemukan");
    res.json(d);
  }));

  /* ===================== SINKRON OTOMATIS (anime ongoing) ===================== */
  let syncing = false;
  async function syncAiring(olderThanMs: number) {
    if (syncing) return { updated: 0, failed: 0, finished: 0, running: true };
    syncing = true;
    let updated = 0, failed = 0, finished = 0;
    try {
      for (const a of storage.listAiring(olderThanMs)) {
        try {
          const m = await fetchMal(a.malId);
          storage.upsertAnime(m, {});
          updated++;
          if (m.status === "Finished Airing") finished++;
        } catch { failed++; }
        await new Promise((r) => setTimeout(r, 2500));
      }
    } finally { syncing = false; }
    return { updated, failed, finished, running: false };
  }
  // tiap 3 jam: perbarui anime ongoing / belum tayang yang datanya lebih tua dari 12 jam
  setTimeout(() => syncAiring(12 * 3600_000).catch(() => {}), 60_000);
  setInterval(() => syncAiring(12 * 3600_000).catch(() => {}), 3 * 3600_000);

  /* ===================== KOMENTAR ===================== */
  app.get("/api/anime/:malId/comments", wrap((req, res) => {
    const a = storage.getAnimeByMal(Number(req.params.malId));
    if (!a || !a.published) throw httpErr(404, "Anime tidak ditemukan");
    res.json(storage.listComments(a.id, Number(req.query.page) || 1, 10));
  }));

  app.post("/api/anime/:malId/comments", wrap((req, res) => {
    const a = storage.getAnimeByMal(Number(req.params.malId));
    if (!a || !a.published) throw httpErr(404, "Anime tidak ditemukan");
    const body = commentInputSchema.parse(req.body);
    if (body.website) return res.json({ ok: true }); // bot
    const h = req.headers.authorization || "";
    const staff = h.startsWith("Bearer ") ? storage.getSessionUser(h.slice(7), req.ip) : undefined;
    const ip = ipOf(req);
    const text = cleanText(body.body).trim();
    if (text.length < 2) throw httpErr(400, "Komentar terlalu pendek");
    if (!staff) {
      if ((text.match(/https?:\/\/|www\./gi) || []).length > 2) throw httpErr(400, "Maksimal 2 link per komentar");
      commentGuard(ip);
    }
    let parentId: number | null = null;
    if (body.parentId) {
      const p = storage.getComment(body.parentId);
      if (!p || p.animeId !== a.id) throw httpErr(400, "Komentar yang dibalas tidak ditemukan");
      parentId = p.parentId ?? p.id; // balasan cuma 1 tingkat
    }
    const name = staff ? staff.username : cleanText(body.name || "").replace(/\s+/g, " ").trim() || "Anonim";
    // cegah pengunjung menyamar jadi admin
    if (!staff && /\b(admin|owner|moderator|mod)\b/i.test(name)) throw httpErr(400, "Nama itu khusus tim situs, pakai nama lain ya");
    const c = storage.addComment({ animeId: a.id, parentId, name, body: text.replace(/\n{3,}/g, "\n\n"), isAdmin: !!staff, ip });
    const { ip: _ip, ...pub } = c;
    res.json(pub);
  }));

  app.get("/api/admin/comments", auth, wrap((req, res) => res.json(storage.recentComments(Number(req.query.page) || 1, 30))));
  app.delete("/api/admin/comments/:id", auth, wrap((req, res) => {
    const c = storage.getComment(Number(req.params.id));
    storage.deleteComment(Number(req.params.id));
    if (c) log(req, "comment.delete", `${c.name}: ${c.body.slice(0, 80)}`);
    res.json({ ok: true });
  }));

  /* ===================== AUTH ===================== */
  app.get("/api/auth/status", wrap((_req, res) => res.json({ needsSetup: storage.countUsers() === 0, setupKey: !!process.env.SETUP_KEY })));

  app.post("/api/auth/setup", wrap((req, res) => {
    if (storage.countUsers() > 0) throw httpErr(403, "Owner sudah dibuat");
    if (!hit(`setup:${ipOf(req)}`, 60_000, 5)) throw httpErr(429, "Terlalu banyak percobaan");
    const { username, password } = credSchema.parse(req.body);
    // SETUP_KEY (env) mencegah orang lain mengklaim owner sebelum kamu
    const key = process.env.SETUP_KEY;
    if (key) {
      const given = String(req.body?.setupKey || "");
      const a = Buffer.from(given), b = Buffer.from(key);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw httpErr(403, "Kode setup salah");
    }
    checkPassword(password, username);
    const user = storage.createUser(username, password, "owner");
    log(req, "account.setup", null, user);
    log(req, "login.success", null, user);
    res.json({ token: storage.createSession(user.id, ipOf(req), uaOf(req)), user });
  }));

  app.post("/api/auth/login", wrap((req, res) => {
    const { username, password, code } = z.object({ username: z.string().max(64), password: z.string().max(200), code: z.string().max(10).optional() }).parse(req.body);
    const uname = username.trim().toLowerCase();
    const ip = ipOf(req);
    loginGuard(ip, uname);
    const u = storage.getUserByUsername(uname);
    const ok = u ? verifyPassword(password, u.password) : verifyDummy(password);
    if (!u || !ok) {
      loginFail(ip, uname);
      storage.audit({ userId: u?.id ?? null, username: uname.slice(0, 32), action: "login.fail", detail: u ? "Password salah" : "Username tidak dikenal", ip });
      throw httpErr(401, "Username atau password salah");
    }
    if (u.totpEnabled && u.totpSecret) {
      if (!code) return res.status(401).json({ message: "Masukkan kode 2FA dari aplikasi authenticator", need2fa: true });
      if (!verifyTotp(u.totpSecret, code, `u${u.id}`)) {
        loginFail(ip, uname);
        storage.audit({ userId: u.id, username: u.username, action: "login.fail", detail: "Kode 2FA salah", ip });
        return res.status(401).json({ message: "Kode 2FA salah atau kedaluwarsa", need2fa: true });
      }
    }
    clear(`lf:u:${uname}`);
    log(req, "login.success", u.totpEnabled ? "dengan 2FA" : null, u);
    res.json({ token: storage.createSession(u.id, ip, uaOf(req)), user: storage.publicUser(u) });
  }));

  app.get("/api/auth/me", auth, wrap((req, res) => res.json(storage.publicUser(req.user!))));
  app.post("/api/auth/logout", auth, wrap((req, res) => {
    storage.deleteSession(req.token!);
    log(req, "logout");
    res.json({ ok: true });
  }));
  app.post("/api/auth/password", auth, wrap((req, res) => {
    const { current, next } = z.object({ current: z.string().max(200), next: credSchema.shape.password }).parse(req.body);
    if (!verifyPassword(current, req.user!.password)) throw httpErr(400, "Password lama salah");
    if (current === next) throw httpErr(400, "Password baru harus beda dari yang lama");
    checkPassword(next, req.user!.username);
    storage.updateUser(req.user!.id, { password: next }, req.token);
    log(req, "password.change", "Sesi di perangkat lain dikeluarkan");
    res.json({ ok: true });
  }));

  /* ---------- 2FA (TOTP) ---------- */
  app.post("/api/auth/2fa/setup", auth, wrap((req, res) => {
    if (req.user!.totpEnabled) throw httpErr(400, "2FA sudah aktif");
    const secret = newTotpSecret();
    storage.setTotp(req.user!.id, secret, false);
    const site = storage.getSettings().siteName || "Kura";
    res.json({ secret, url: otpauthUrl(secret, req.user!.username, site) });
  }));
  app.post("/api/auth/2fa/enable", auth, wrap((req, res) => {
    const { code } = z.object({ code: z.string().max(10) }).parse(req.body);
    const u = storage.getUser(req.user!.id)!;
    if (!u.totpSecret) throw httpErr(400, "Mulai pengaturan 2FA dulu");
    if (!verifyTotp(u.totpSecret, code, `u${u.id}`)) throw httpErr(400, "Kode salah. Cek jam di HP kamu sudah otomatis.");
    storage.setTotp(u.id, u.totpSecret, true);
    log(req, "2fa.enable");
    res.json({ ok: true });
  }));
  app.post("/api/auth/2fa/disable", auth, wrap((req, res) => {
    const { password, code } = z.object({ password: z.string().max(200), code: z.string().max(10) }).parse(req.body);
    const u = storage.getUser(req.user!.id)!;
    if (!verifyPassword(password, u.password)) throw httpErr(400, "Password salah");
    if (!u.totpSecret || !verifyTotp(u.totpSecret, code, `u${u.id}`)) throw httpErr(400, "Kode 2FA salah");
    storage.setTotp(u.id, null, false);
    log(req, "2fa.disable");
    res.json({ ok: true });
  }));

  /* ---------- Keamanan: ringkasan, sesi, log ---------- */
  app.get("/api/admin/security", auth, wrap((req, res) => {
    const me = req.user!;
    const isOwner = me.role === "owner";
    const myHash = hashToken(req.token!);
    const sessions = storage.listSessions(isOwner ? undefined : me.id).map((s) => ({
      id: s.hash.slice(0, 16), userId: s.userId, username: s.username, device: s.device, ip: s.ip, createdAt: s.createdAt, lastSeen: s.lastSeen, current: s.hash === myHash,
    }));
    const users = isOwner ? storage.listUsers() : null;
    const admins = users?.map((u) => ({ id: u.id, username: u.username, role: u.role, totpEnabled: u.totpEnabled, lastLogin: storage.lastLogin(u.id)?.at ?? null })) ?? null;
    const failed24h = storage.countAudit("login.fail", 24 * 3600_000, isOwner ? undefined : me.id);
    const pwAge = me.passwordChangedAt ? Date.now() - me.passwordChangedAt : null;
    const settings = storage.getSettings();
    const checks: SecurityOverview["checks"] = [
      { key: "2fa", ok: !!me.totpEnabled, label: "Verifikasi 2 langkah (2FA)", hint: me.totpEnabled ? "Aktif di akunmu" : "Aktifkan di halaman Akun supaya password saja tidak cukup untuk masuk" },
      { key: "pw", ok: pwAge !== null && pwAge < 180 * 24 * 3600_000, label: "Password masih baru", hint: pwAge === null ? "Belum pernah diganti sejak fitur ini ada" : (Math.floor(pwAge / 86400_000) === 0 ? "Diganti hari ini" : `Diganti ${Math.floor(pwAge / 86400_000)} hari lalu`) },
      { key: "sess", ok: sessions.filter((s) => s.userId === me.id).length <= 3, label: "Sesi aktif wajar", hint: `${sessions.filter((s) => s.userId === me.id).length} perangkat sedang login dengan akunmu` },
      { key: "fail", ok: failed24h < 10, label: "Tidak ada serangan login", hint: failed24h ? `${failed24h} percobaan login gagal dalam 24 jam` : "Tidak ada login gagal dalam 24 jam" },
    ];
    if (isOwner && admins && admins.length > 1) {
      const no2fa = admins.filter((a) => !a.totpEnabled).length;
      checks.push({ key: "team", ok: no2fa === 0, label: "Semua admin pakai 2FA", hint: no2fa ? `${no2fa} dari ${admins.length} akun belum mengaktifkan 2FA` : "Semua akun sudah aman" });
      checks.push({ key: "index", ok: settings.indexHosts.length <= 5, label: "Domain index dibatasi", hint: `Penjelajah index hanya boleh membuka: ${settings.indexHosts.join(", ")}` });
    }
    const out: SecurityOverview = {
      me: { totpEnabled: !!me.totpEnabled, passwordChangedAt: me.passwordChangedAt ?? null, lastLogin: storage.lastLogin(me.id, 1) },
      sessions,
      failed24h,
      blockedNow: 0,
      admins,
      audit: storage.listAudit({ limit: Number(req.query.limit) || 40, userId: isOwner ? undefined : me.id, action: req.query.action ? String(req.query.action) : undefined }),
      checks,
    };
    res.json(out);
  }));
  app.delete("/api/admin/security/sessions/:id", auth, wrap((req, res) => {
    const id = String(req.params.id);
    const isOwner = req.user!.role === "owner";
    const target = storage.listSessions(isOwner ? undefined : req.user!.id).find((s) => s.hash.startsWith(id) && id.length === 16);
    if (!target) throw httpErr(404, "Sesi tidak ditemukan");
    storage.revokeSessionHash(target.hash);
    log(req, "session.revoke", `${target.username} · ${target.device}`);
    res.json({ ok: true, self: target.hash === hashToken(req.token!) });
  }));
  app.post("/api/admin/security/logout-others", auth, wrap((req, res) => {
    storage.revokeAllForUser(req.user!.id, req.token);
    log(req, "session.revoke", "Keluar dari semua perangkat lain");
    res.json({ ok: true });
  }));

  /* ===================== ADMIN ===================== */
  app.get("/api/admin/stats", auth, wrap((_req, res) => {
    const recent = storage.queryAnime({ includeUnpublished: true, sort: "added", limit: 6 }).items;
    const all = storage.queryAnime({ includeUnpublished: true, limit: 200 }).items;
    const noLinks = all.filter((a) => a.episodeCount === 0).slice(0, 8);
    res.json({ ...storage.stats(), recent, noLinks });
  }));

  app.get("/api/admin/anime", auth, wrap((req, res) =>
    res.json(storage.queryAnime({ ...listQuery(req.query), includeUnpublished: true, limit: Number(req.query.limit) || 50 })),
  ));

  app.get("/api/admin/anime/:malId", auth, wrap((req, res) => {
    const d = storage.getDetail(Number(req.params.malId), true);
    if (!d) throw httpErr(404, "Anime tidak ditemukan");
    res.json(d);
  }));

  // Server-side ambil data MAL (Jikan, cadangan: halaman MAL)
  app.post("/api/admin/mal/resolve", auth, wrap(async (req, res) => {
    const { url } = z.object({ url: z.string() }).parse(req.body);
    const id = parseMalId(url);
    if (!id) throw httpErr(400, "Link MyAnimeList tidak valid. Contoh: https://myanimelist.net/anime/41457/86");
    const data = await fetchMal(id);
    const existing = storage.getAnimeByMal(id);
    res.json({ mal: data, existing: existing ? { id: existing.id, malId: existing.malId } : null });
  }));

  app.get("/api/admin/mal/search", auth, wrap(async (req, res) => {
    const q = String(req.query.q || "").trim();
    if (q.length < 3) return res.json([]);
    const items = await searchMal(q);
    const have = new Set(storage.allAnime(true).map((a) => a.malId));
    res.json(items.map((i) => ({ ...i, inCatalog: have.has(i.malId) })));
  }));

  app.post("/api/admin/anime", auth, wrap((req, res) => {
    const body = createAnimeSchema.parse(req.body);
    const a = storage.upsertAnime(body.mal, { published: body.published, featured: body.featured });
    for (const s of body.sources) storage.addSource(a.id, s);
    log(req, "anime.create", a.title);
    res.json(a);
  }));

  app.patch("/api/admin/anime/:id", auth, wrap((req, res) => {
    const patch = z.object({
      published: z.boolean().optional(),
      featured: z.boolean().optional(),
      title: z.string().min(1).optional(),
      titleEnglish: z.string().nullable().optional(),
      synopsis: z.string().max(10000).nullable().optional(),
      imageUrl: httpUrl.nullable().optional(),
    }).parse(req.body);
    const a = storage.patchAnime(Number(req.params.id), patch);
    if (!a) throw httpErr(404, "Anime tidak ditemukan");
    log(req, "anime.update", `${a.title} (${Object.keys(patch).join(", ")})`);
    res.json(a);
  }));

  app.post("/api/admin/anime/:id/refresh", auth, wrap(async (req, res) => {
    const a = storage.getAnime(Number(req.params.id));
    if (!a) throw httpErr(404, "Anime tidak ditemukan");
    const fromClient = req.body?.mal ? malAnimeSchema.parse(req.body.mal) : null;
    const mal = fromClient || (await fetchMal(a.malId));
    res.json(storage.upsertAnime(mal, {}));
  }));

  app.delete("/api/admin/anime/:id", auth, wrap((req, res) => {
    const a = storage.getAnime(Number(req.params.id));
    storage.deleteAnime(Number(req.params.id));
    if (a) log(req, "anime.delete", a.title);
    res.json({ ok: true });
  }));

  app.post("/api/admin/sync-airing", auth, wrap(async (req, res) => {
    const r = await syncAiring(0);
    if (!r.running) log(req, "sync.airing", `${r.updated} diperbarui, ${r.finished} tamat`);
    res.json(r);
  }));

  // Index Google Drive
  app.post("/api/admin/index/list", auth, wrap(async (req, res) => {
    const { url } = z.object({ url: httpUrl }).parse(req.body);
    const folderUrl = normalizeFolderUrl(url);
    await assertSafeIndexUrl(folderUrl, allowedIndexHosts());
    const entries = await listIndexFolder(folderUrl);
    res.json({ folderUrl, label: prettyFolderName(folderUrl), entries });
  }));

  app.get("/api/admin/index/search", auth, wrap(async (req, res) => {
    const q = String(req.query.q || "").slice(0, 100);
    const root = String(req.query.root || storage.getSettings().indexRoot);
    await assertSafeIndexUrl(root, allowedIndexHosts());
    res.json(await searchIndex(root, q));
  }));

  app.post("/api/admin/anime/:id/sources", auth, wrap((req, res) => {
    const a = storage.getAnime(Number(req.params.id));
    if (!a) throw httpErr(404, "Anime tidak ditemukan");
    const src = storage.addSource(a.id, sourceInputSchema.parse(req.body));
    log(req, "source.add", `${a.title} · ${(src as any)?.label ?? ""}`);
    res.json(src);
  }));

  app.patch("/api/admin/sources/:id", auth, wrap((req, res) => {
    const patch = z.object({
      label: z.string().trim().min(1).max(120).optional(),
      folderUrl: httpUrl.nullable().optional().or(z.literal("")),
      quality: z.enum(["BD", "WEB", "DVD", "HDTV"]).nullable().optional(),
      resolution: z.string().max(10).nullable().optional(),
      sortOrder: z.number().int().optional(),
      episodes: z.array(episodeInputSchema).optional(),
    }).parse(req.body);
    const s = storage.updateSource(Number(req.params.id), patch);
    if (!s) throw httpErr(404, "Sumber tidak ditemukan");
    log(req, "source.update", `${(s as any).label ?? "#" + req.params.id}${patch.episodes ? ` · ${patch.episodes.length} episode` : ""}`);
    res.json(s);
  }));

  app.delete("/api/admin/sources/:id", auth, wrap((req, res) => {
    storage.deleteSource(Number(req.params.id));
    log(req, "source.delete", `#${req.params.id}`);
    res.json({ ok: true });
  }));

  // Settings
  app.get("/api/admin/settings", auth, wrap((_req, res) => res.json(storage.getSettings())));
  app.patch("/api/admin/settings", auth, wrap((req, res) => {
    const patch = z.object({
      siteName: z.string().min(1).max(40).optional(),
      tagline: z.string().max(160).optional(),
      announcement: z.string().max(300).optional(),
      perPage: z.number().int().min(6).max(50).optional(),
      players: z.array(z.string().max(20)).max(30).optional(),
      indexRoot: httpUrl.optional(),
      indexHosts: z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "Domain tidak valid")).max(10).optional(),
    }).parse(req.body);
    // pengaturan index menentukan ke mana server boleh terhubung -> khusus owner
    const curSt = storage.getSettings();
    const changesIndex = (patch.indexRoot !== undefined && patch.indexRoot !== curSt.indexRoot) || (patch.indexHosts !== undefined && JSON.stringify(patch.indexHosts) !== JSON.stringify(curSt.indexHosts));
    if (req.user!.role !== "owner") {
      if (changesIndex) throw httpErr(403, "Pengaturan index khusus owner");
      delete patch.indexRoot; delete patch.indexHosts;
    }
    if (patch.indexRoot) {
      const host = new URL(patch.indexRoot).hostname.toLowerCase();
      const hosts = new Set(patch.indexHosts ?? storage.getSettings().indexHosts);
      hosts.add(host);
      patch.indexHosts = [...hosts];
    }
    const out = storage.updateSettings(patch);
    log(req, "settings.update", Object.keys(patch).join(", "));
    res.json(out);
  }));

  // Users (owner only)
  app.get("/api/admin/users", auth, ownerOnly, wrap((_req, res) => res.json(storage.listUsers())));
  app.post("/api/admin/users", auth, ownerOnly, wrap((req, res) => {
    const { username, password } = credSchema.parse(req.body);
    if (storage.getUserByUsername(username)) throw httpErr(400, "Username sudah dipakai");
    checkPassword(password, username);
    const u = storage.createUser(username, password, "admin");
    log(req, "user.create", u.username);
    res.json(u);
  }));
  app.patch("/api/admin/users/:id", auth, ownerOnly, wrap((req, res) => {
    const { password } = z.object({ password: credSchema.shape.password }).parse(req.body);
    const u = storage.getUser(Number(req.params.id));
    if (!u) throw httpErr(404, "User tidak ditemukan");
    checkPassword(password, u.username);
    storage.updateUser(u.id, { password });
    log(req, "user.reset", `${u.username} (semua sesinya dikeluarkan)`);
    res.json({ ok: true });
  }));
  app.delete("/api/admin/users/:id", auth, ownerOnly, wrap((req, res) => {
    const u = storage.getUser(Number(req.params.id));
    if (!u) throw httpErr(404, "User tidak ditemukan");
    if (u.role === "owner") throw httpErr(400, "Owner tidak bisa dihapus");
    storage.deleteUser(u.id);
    log(req, "user.delete", u.username);
    res.json({ ok: true });
  }));

  return httpServer;
}
