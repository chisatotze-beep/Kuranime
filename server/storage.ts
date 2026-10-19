import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, asc, desc, and, inArray, gt, sql } from "drizzle-orm";
import crypto from "node:crypto";
import {
  users, sessions, anime, sources, episodes, settings, comments, audit,
  DEFAULT_SETTINGS, detectQuality, AIRING_STATUS,
  type User, type PublicUser, type AnimeRow, type AnimeDTO, type AnimeCard, type AnimeDetail,
  type MalAnime, type SourceInput, type EpisodeInput, type SiteSettings, type Facets,
  type CommentDTO, type AdminComment, type AuditRow,
} from "@shared/schema";
import { newToken, hashToken, deviceLabel } from "./security";

import fs from "node:fs";
import path from "node:path";
const DB_FILE = process.env.DB_FILE || "data.db";
// pertama kali jalan: pakai katalog contoh (17 anime) jika tersedia
if (!fs.existsSync(DB_FILE)) {
  const seed = path.resolve(process.cwd(), "seed", "kura-seed.db");
  fs.mkdirSync(path.dirname(path.resolve(DB_FILE)), { recursive: true });
  if (fs.existsSync(seed) && process.env.NO_SEED !== "1") fs.copyFileSync(seed, DB_FILE);
}
const sqlite = new Database(DB_FILE);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

sqlite.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin'
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS anime (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mal_id INTEGER NOT NULL UNIQUE,
  title TEXT NOT NULL,
  title_english TEXT, title_japanese TEXT,
  synonyms TEXT NOT NULL DEFAULT '[]',
  type TEXT, source TEXT, episodes INTEGER, status TEXT,
  aired_from TEXT, aired_string TEXT, season TEXT, year INTEGER,
  duration TEXT, rating TEXT, score REAL, scored_by INTEGER, rank INTEGER,
  popularity INTEGER, members INTEGER, synopsis TEXT, image_url TEXT,
  trailer_youtube_id TEXT,
  studios TEXT NOT NULL DEFAULT '[]', producers TEXT NOT NULL DEFAULT '[]',
  genres TEXT NOT NULL DEFAULT '[]', episode_titles TEXT NOT NULL DEFAULT '{}',
  published INTEGER NOT NULL DEFAULT 1, featured INTEGER NOT NULL DEFAULT 0,
  added_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  anime_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  folder_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS episodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL,
  anime_id INTEGER NOT NULL,
  code TEXT NOT NULL, number INTEGER, title TEXT, file_name TEXT,
  url TEXT NOT NULL, size INTEGER, sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_ep_source ON episodes(source_id);
CREATE INDEX IF NOT EXISTS idx_src_anime ON sources(anime_id);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  anime_id INTEGER NOT NULL,
  parent_id INTEGER,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  ip TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_anime ON comments(anime_id, created_at);
`);

// migrasi: keamanan (2FA, sesi ber-hash, log aktivitas)
{
  const ucols = (sqlite.prepare("PRAGMA table_info(users)").all() as { name: string }[]).map((c) => c.name);
  if (!ucols.includes("totp_secret")) sqlite.exec("ALTER TABLE users ADD COLUMN totp_secret TEXT");
  if (!ucols.includes("totp_enabled")) sqlite.exec("ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0");
  if (!ucols.includes("password_changed_at")) sqlite.exec("ALTER TABLE users ADD COLUMN password_changed_at INTEGER");
  const scols = (sqlite.prepare("PRAGMA table_info(sessions)").all() as { name: string }[]).map((c) => c.name);
  if (!scols.includes("ua")) {
    // sesi lama menyimpan token mentah -> dibuang, semua perlu login ulang
    sqlite.exec(`DROP TABLE IF EXISTS sessions;
      CREATE TABLE sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL, expires_at INTEGER NOT NULL, ip TEXT, ua TEXT);`);
  }
  sqlite.exec(`CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, username TEXT, action TEXT NOT NULL, detail TEXT, ip TEXT, at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_audit_at ON audit(at);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);`);
}
// migrasi: kolom broadcast di anime
{
  const cols = (sqlite.prepare("PRAGMA table_info(anime)").all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes("broadcast")) sqlite.exec("ALTER TABLE anime ADD COLUMN broadcast TEXT");
}
// migrasi: kolom kualitas di sources
{
  const cols = (sqlite.prepare("PRAGMA table_info(sources)").all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes("quality")) sqlite.exec("ALTER TABLE sources ADD COLUMN quality TEXT");
  if (!cols.includes("resolution")) sqlite.exec("ALTER TABLE sources ADD COLUMN resolution TEXT");
  const todo = sqlite.prepare("SELECT id, folder_url, label FROM sources WHERE quality IS NULL").all() as { id: number; folder_url: string | null; label: string }[];
  const upd = sqlite.prepare("UPDATE sources SET quality = ?, resolution = COALESCE(resolution, ?) WHERE id = ?");
  for (const r of todo) {
    const f = sqlite.prepare("SELECT file_name FROM episodes WHERE source_id = ? LIMIT 1").get(r.id) as { file_name: string | null } | undefined;
    const q = detectQuality(r.folder_url, r.label, f?.file_name);
    if (q.quality || q.resolution) upd.run(q.quality, q.resolution, r.id);
  }
}

export const db = drizzle(sqlite);

/* ---------- password ---------- */
export function hashPassword(pw: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(pw, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}
export function verifyPassword(pw: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(pw, salt, 64);
  const buf = Buffer.from(hash, "hex");
  return buf.length === test.length && crypto.timingSafeEqual(buf, test);
}
// hash dummy: dipakai saat username tidak ada, supaya waktu respons tetap sama (anti user-enumeration)
const DUMMY_HASH = hashPassword(crypto.randomBytes(12).toString("hex"));
export function verifyDummy(pw: string) { verifyPassword(pw, DUMMY_HASH); return false; }

const publicUser = (u: User): PublicUser => ({ id: u.id, username: u.username, role: u.role, totpEnabled: !!u.totpEnabled, passwordChangedAt: u.passwordChangedAt ?? null });

const IDLE_MS = 7 * 24 * 3600_000; // sesi habis jika 7 hari tidak dipakai
const ABS_MS = 30 * 24 * 3600_000; // maksimal 30 hari sejak login

/* ---------- helpers ---------- */
const j = <T>(s: string | null | undefined, fb: T): T => {
  try { return s ? JSON.parse(s) : fb; } catch { return fb; }
};
export function toDTO(r: AnimeRow): AnimeDTO {
  return {
    ...r,
    synonyms: j(r.synonyms, []),
    studios: j(r.studios, []),
    producers: j(r.producers, []),
    genres: j(r.genres, []),
    episodeTitles: j(r.episodeTitles, {}),
  };
}
function malToRow(m: MalAnime) {
  return {
    malId: m.malId,
    title: m.title,
    titleEnglish: m.titleEnglish ?? null,
    titleJapanese: m.titleJapanese ?? null,
    synonyms: JSON.stringify(m.synonyms || []),
    type: m.type ?? null,
    source: m.source ?? null,
    episodes: m.episodes ?? null,
    status: m.status ?? null,
    airedFrom: m.airedFrom ?? null,
    airedString: m.airedString ?? null,
    season: m.season ? m.season.toLowerCase() : null,
    year: m.year ?? null,
    duration: m.duration ?? null,
    broadcast: m.broadcast ?? null,
    rating: m.rating ?? null,
    score: m.score ?? null,
    scoredBy: m.scoredBy ?? null,
    rank: m.rank ?? null,
    popularity: m.popularity ?? null,
    members: m.members ?? null,
    synopsis: m.synopsis ?? null,
    imageUrl: m.imageUrl ?? null,
    trailerYoutubeId: m.trailerYoutubeId ?? null,
    studios: JSON.stringify(m.studios || []),
    producers: JSON.stringify(m.producers || []),
    genres: JSON.stringify(m.genres || []),
    episodeTitles: JSON.stringify(m.episodeTitles || {}),
  };
}

export type AnimeQuery = {
  q?: string; genres?: string[]; excludeGenres?: string[]; studio?: string; season?: string; year?: number;
  type?: string; status?: string; rating?: string; source?: string; minScore?: number;
  sort?: string; page?: number; limit?: number; includeUnpublished?: boolean; featured?: boolean; quality?: string;
};

/* ---------- cache memori (dibuang setiap ada perubahan data) ---------- */
let cache: { all?: AnimeDTO[]; counts?: Map<number, number>; qmap?: Map<number, string[]>; facets?: Facets; home?: any } = {};
export function bump() { cache = {}; }
export function memo<K extends keyof typeof cache>(k: K, fn: () => NonNullable<(typeof cache)[K]>): NonNullable<(typeof cache)[K]> {
  if (!cache[k]) cache[k] = fn() as any;
  return cache[k] as any;
}

function epCounts(): Map<number, number> {
  return memo("counts", () => epCountsRaw());
}
function epCountsRaw(): Map<number, number> {
  const rows = sqlite.prepare("SELECT anime_id as a, COUNT(*) as c FROM episodes GROUP BY anime_id").all() as { a: number; c: number }[];
  return new Map(rows.map((r) => [r.a, r.c]));
}

function qualityMap(): Map<number, string[]> {
  return memo("qmap", () => qualityMapRaw());
}
function qualityMapRaw(): Map<number, string[]> {
  const rows = sqlite.prepare("SELECT DISTINCT anime_id as a, quality as q FROM sources WHERE quality IS NOT NULL ORDER BY quality").all() as { a: number; q: string }[];
  const m = new Map<number, string[]>();
  rows.forEach((r) => m.set(r.a, [...(m.get(r.a) || []), r.q]));
  return m;
}

export function toCard(d: AnimeDTO, count: number, qualities: string[] = []): AnimeCard {
  return {
    id: d.id, malId: d.malId, title: d.title, titleEnglish: d.titleEnglish, type: d.type, year: d.year,
    season: d.season, score: d.score, imageUrl: d.imageUrl, episodes: d.episodes, status: d.status,
    genres: d.genres, studios: d.studios, published: d.published, featured: d.featured, addedAt: d.addedAt,
    episodeCount: count,
    qualities,
  };
}

/* ---------- storage ---------- */
export const storage = {
  /* users */
  countUsers(): number {
    return (sqlite.prepare("SELECT COUNT(*) as c FROM users").get() as any).c;
  },
  listUsers(): PublicUser[] {
    return db.select().from(users).orderBy(asc(users.id)).all().map(publicUser);
  },
  getUser(id: number) { return db.select().from(users).where(eq(users.id, id)).get(); },
  getUserByUsername(username: string) {
    return db.select().from(users).where(eq(users.username, username.toLowerCase())).get();
  },
  createUser(username: string, password: string, role: "owner" | "admin"): PublicUser {
    const u = db.insert(users).values({ username: username.toLowerCase(), password: hashPassword(password), role, passwordChangedAt: Date.now() }).returning().get();
    return publicUser(u);
  },
  /** ganti password: semua sesi user ini dicabut kecuali `keepToken` (sesi yang sedang dipakai) */
  updateUser(id: number, patch: { password?: string; role?: string }, keepToken?: string) {
    const v: any = {};
    if (patch.password) { v.password = hashPassword(patch.password); v.passwordChangedAt = Date.now(); }
    if (patch.role) v.role = patch.role;
    if (Object.keys(v).length) db.update(users).set(v).where(eq(users.id, id)).run();
    if (patch.password) this.revokeAllForUser(id, keepToken);
  },
  setTotp(id: number, secret: string | null, enabled: boolean) {
    db.update(users).set({ totpSecret: secret, totpEnabled: enabled }).where(eq(users.id, id)).run();
  },
  deleteUser(id: number) {
    db.delete(sessions).where(eq(sessions.userId, id)).run();
    db.delete(users).where(eq(users.id, id)).run();
  },
  publicUser,

  /* sessions — DB hanya menyimpan hash sha256 dari token */
  createSession(userId: number, ip: string | null, ua: string | null): string {
    const token = newToken();
    const now = Date.now();
    db.insert(sessions).values({ token: hashToken(token), userId, createdAt: now, lastSeen: now, expiresAt: now + ABS_MS, ip, ua: ua?.slice(0, 300) ?? null }).run();
    // bersihkan sesi kedaluwarsa
    sqlite.prepare("DELETE FROM sessions WHERE expires_at < ? OR last_seen < ?").run(now, now - IDLE_MS);
    return token;
  },
  getSessionUser(token: string, ip?: string | null): User | undefined {
    if (!token || token.length > 100) return undefined;
    const h = hashToken(token);
    const now = Date.now();
    const s = db.select().from(sessions).where(and(eq(sessions.token, h), gt(sessions.expiresAt, now))).get();
    if (!s) return undefined;
    if (now - s.lastSeen > IDLE_MS) { this.deleteSession(token); return undefined; }
    if (now - s.lastSeen > 60_000) db.update(sessions).set({ lastSeen: now, ip: ip ?? s.ip }).where(eq(sessions.token, h)).run();
    return this.getUser(s.userId);
  },
  deleteSession(token: string) { db.delete(sessions).where(eq(sessions.token, hashToken(token))).run(); },
  listSessions(userId?: number) {
    const rows = sqlite.prepare(
      `SELECT s.token, s.user_id, s.created_at, s.last_seen, s.ip, s.ua, u.username FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.expires_at > ? AND s.last_seen > ? ${userId ? "AND s.user_id = ?" : ""} ORDER BY s.last_seen DESC`,
    ).all(...[Date.now(), Date.now() - IDLE_MS, ...(userId ? [userId] : [])]) as any[];
    return rows.map((r) => ({ hash: r.token as string, userId: r.user_id as number, username: r.username as string, device: deviceLabel(r.ua || ""), ip: r.ip as string | null, createdAt: r.created_at as number, lastSeen: r.last_seen as number }));
  },
  getSessionByHash(hash: string) { return db.select().from(sessions).where(eq(sessions.token, hash)).get(); },
  revokeSessionHash(hash: string) { db.delete(sessions).where(eq(sessions.token, hash)).run(); },
  revokeAllForUser(userId: number, keepToken?: string) {
    if (keepToken) sqlite.prepare("DELETE FROM sessions WHERE user_id = ? AND token != ?").run(userId, hashToken(keepToken));
    else db.delete(sessions).where(eq(sessions.userId, userId)).run();
  },

  /* log aktivitas */
  audit(e: { userId?: number | null; username?: string | null; action: string; detail?: string | null; ip?: string | null }) {
    db.insert(audit).values({ userId: e.userId ?? null, username: e.username ?? null, action: e.action, detail: e.detail?.slice(0, 300) ?? null, ip: e.ip ?? null, at: Date.now() }).run();
    if (Math.random() < 0.02) sqlite.prepare("DELETE FROM audit WHERE at < ?").run(Date.now() - 90 * 24 * 3600_000); // simpan 90 hari
  },
  listAudit(o: { limit?: number; userId?: number; action?: string } = {}): AuditRow[] {
    const where: string[] = []; const args: any[] = [];
    if (o.userId) { where.push("user_id = ?"); args.push(o.userId); }
    if (o.action) { where.push("action LIKE ?"); args.push(o.action + "%"); }
    return sqlite.prepare(`SELECT id, user_id as userId, username, action, detail, ip, at FROM audit ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY at DESC LIMIT ?`).all(...args, Math.min(o.limit ?? 50, 200)) as AuditRow[];
  },
  countAudit(action: string, sinceMs: number, userId?: number): number {
    return (sqlite.prepare(`SELECT COUNT(*) c FROM audit WHERE action = ? AND at > ? ${userId ? "AND user_id = ?" : ""}`).get(action, Date.now() - sinceMs, ...(userId ? [userId] : [])) as any).c;
  },
  lastLogin(userId: number, skip = 0): AuditRow | null {
    return (sqlite.prepare("SELECT id, user_id as userId, username, action, detail, ip, at FROM audit WHERE user_id = ? AND action = 'login.success' ORDER BY at DESC LIMIT 1 OFFSET ?").get(userId, skip) as AuditRow) || null;
  },

  /* settings */
  getSettings(): SiteSettings {
    const rows = db.select().from(settings).all();
    const out: any = { ...DEFAULT_SETTINGS };
    for (const r of rows) out[r.key] = j(r.value, (DEFAULT_SETTINGS as any)[r.key]);
    return out;
  },
  updateSettings(patch: Partial<SiteSettings>) {
    for (const [k, v] of Object.entries(patch)) {
      if (!(k in DEFAULT_SETTINGS) || v === undefined) continue;
      sqlite.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(k, JSON.stringify(v));
    }
    return this.getSettings();
  },

  /* anime */
  allAnime(includeUnpublished = false): AnimeDTO[] {
    const all = memo("all", () => db.select().from(anime).all().map(toDTO));
    return includeUnpublished ? all.slice() : all.filter((a) => a.published);
  },
  getAnimeByMal(malId: number) {
    const r = db.select().from(anime).where(eq(anime.malId, malId)).get();
    return r ? toDTO(r) : undefined;
  },
  getAnime(id: number) {
    const r = db.select().from(anime).where(eq(anime.id, id)).get();
    return r ? toDTO(r) : undefined;
  },
  queryAnime(o: AnimeQuery) {
    const counts = epCounts();
    const qmap = qualityMap();
    let list = this.allAnime(!!o.includeUnpublished);
    const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (o.q) {
      const q = norm(o.q);
      list = list.filter((a) =>
        [a.title, a.titleEnglish, a.titleJapanese, ...a.synonyms].some((t) => t && norm(t).includes(q)),
      );
    }
    if (o.genres?.length) list = list.filter((a) => o.genres!.every((g) => a.genres.includes(g)));
    if (o.excludeGenres?.length) list = list.filter((a) => !o.excludeGenres!.some((g) => a.genres.includes(g)));
    if (o.studio) list = list.filter((a) => a.studios.includes(o.studio!));
    if (o.season) list = list.filter((a) => a.season === o.season);
    if (o.year) list = list.filter((a) => a.year === o.year);
    if (o.type) list = list.filter((a) => a.type === o.type);
    if (o.status) {
      const st = (AIRING_STATUS as Record<string, string>)[o.status] || o.status;
      list = list.filter((a) => a.status === st);
    }
    if (o.rating) list = list.filter((a) => a.rating === o.rating);
    if (o.source) list = list.filter((a) => a.source === o.source);
    if (o.minScore) list = list.filter((a) => (a.score ?? 0) >= o.minScore!);
    if (o.featured) list = list.filter((a) => a.featured);
    if (o.quality) list = list.filter((a) => (qmap.get(a.id) || []).includes(o.quality!));
    const sorters: Record<string, (a: AnimeDTO, b: AnimeDTO) => number> = {
      added: (a, b) => b.addedAt - a.addedAt,
      score: (a, b) => (b.score ?? 0) - (a.score ?? 0),
      popularity: (a, b) => (a.popularity || 1e9) - (b.popularity || 1e9),
      title: (a, b) => a.title.localeCompare(b.title),
      newest: (a, b) => (b.airedFrom || "").localeCompare(a.airedFrom || ""),
      oldest: (a, b) => (a.airedFrom || "9").localeCompare(b.airedFrom || "9"),
    };
    list.sort(sorters[o.sort || "added"] || sorters.added);
    const total = list.length;
    const limit = Math.min(Math.max(o.limit || 24, 1), 200);
    const pages = Math.max(1, Math.ceil(total / limit));
    const page = Math.min(Math.max(o.page || 1, 1), pages);
    const items = list.slice((page - 1) * limit, page * limit).map((a) => toCard(a, counts.get(a.id) || 0, qmap.get(a.id) || []));
    return { items, total, page, pages };
  },
  facets(): Facets {
    return memo("facets", () => this.facetsRaw());
  },
  facetsRaw(): Facets {
    const list = this.allAnime(false);
    const tally = (arrs: string[][]) => {
      const m = new Map<string, number>();
      arrs.flat().forEach((x) => m.set(x, (m.get(x) || 0) + 1));
      return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
    };
    const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter(Boolean) as string[])].sort();
    return {
      genres: tally(list.map((a) => a.genres)),
      studios: tally(list.map((a) => a.studios)),
      years: [...new Set(list.map((a) => a.year).filter(Boolean) as number[])].sort((a, b) => b - a),
      types: uniq(list.map((a) => a.type)),
      statuses: uniq(list.map((a) => a.status)),
      ratings: uniq(list.map((a) => a.rating)),
      sources: uniq(list.map((a) => a.source)),
      qualities: [...new Set([...qualityMap().entries()].filter(([id]) => list.some((a) => a.id === id)).flatMap(([, q]) => q))].sort(),
    };
  },
  getDetail(malId: number, includeUnpublished = false): AnimeDetail | undefined {
    const a = this.getAnimeByMal(malId);
    if (!a || (!a.published && !includeUnpublished)) return undefined;
    return { ...a, sources: this.sourcesFor(a.id) };
  },
  sourcesFor(animeId: number) {
    const srcs = db.select().from(sources).where(eq(sources.animeId, animeId)).orderBy(asc(sources.sortOrder), asc(sources.id)).all();
    if (!srcs.length) return [];
    const eps = db.select().from(episodes).where(inArray(episodes.sourceId, srcs.map((s) => s.id))).orderBy(asc(episodes.sortOrder), asc(episodes.id)).all();
    return srcs.map((s) => ({ ...s, episodes: eps.filter((e) => e.sourceId === s.id) }));
  },
  upsertAnime(m: MalAnime, flags: { published?: boolean; featured?: boolean } = {}): AnimeDTO {
    const now = Date.now();
    const existing = db.select().from(anime).where(eq(anime.malId, m.malId)).get();
    const row = malToRow(m);
    if (existing) {
      // pertahankan judul episode lama jika data baru kosong
      if (!Object.keys(m.episodeTitles || {}).length) row.episodeTitles = existing.episodeTitles;
      db.update(anime).set({ ...row, ...flags, updatedAt: now }).where(eq(anime.id, existing.id)).run();
      return this.getAnime(existing.id)!;
    }
    const r = db.insert(anime).values({ ...row, published: flags.published ?? true, featured: flags.featured ?? false, addedAt: now, updatedAt: now }).returning().get();
    return toDTO(r);
  },
  patchAnime(id: number, patch: Partial<{ published: boolean; featured: boolean; title: string; titleEnglish: string | null; synopsis: string | null; imageUrl: string | null }>) {
    db.update(anime).set({ ...patch, updatedAt: Date.now() }).where(eq(anime.id, id)).run();
    return this.getAnime(id);
  },
  deleteAnime(id: number) {
    db.delete(comments).where(eq(comments.animeId, id)).run();
    db.delete(episodes).where(eq(episodes.animeId, id)).run();
    db.delete(sources).where(eq(sources.animeId, id)).run();
    db.delete(anime).where(eq(anime.id, id)).run();
  },

  /* sources & episodes */
  addSource(animeId: number, s: SourceInput) {
    const max = (sqlite.prepare("SELECT COALESCE(MAX(sort_order),-1) m FROM sources WHERE anime_id=?").get(animeId) as any).m;
    const det = detectQuality(s.folderUrl, s.label, s.episodes[0]?.fileName);
    const src = db.insert(sources).values({
      animeId, label: s.label, folderUrl: s.folderUrl ?? null,
      quality: s.quality !== undefined ? s.quality : det.quality,
      resolution: s.resolution !== undefined ? s.resolution : det.resolution,
      sortOrder: max + 1,
    }).returning().get();
    this.replaceEpisodes(src.id, animeId, s.episodes);
    return src;
  },
  getSource(id: number) { return db.select().from(sources).where(eq(sources.id, id)).get(); },
  updateSource(id: number, patch: { label?: string; folderUrl?: string | null; quality?: string | null; resolution?: string | null; sortOrder?: number; episodes?: EpisodeInput[] }) {
    const src = this.getSource(id);
    if (!src) return undefined;
    const v: any = {};
    if (patch.label !== undefined) v.label = patch.label;
    if (patch.folderUrl !== undefined) v.folderUrl = patch.folderUrl;
    if (patch.sortOrder !== undefined) v.sortOrder = patch.sortOrder;
    if (patch.quality !== undefined) v.quality = patch.quality;
    if (patch.resolution !== undefined) v.resolution = patch.resolution;
    if (Object.keys(v).length) db.update(sources).set(v).where(eq(sources.id, id)).run();
    if (patch.episodes) this.replaceEpisodes(id, src.animeId, patch.episodes);
    db.update(anime).set({ updatedAt: Date.now() }).where(eq(anime.id, src.animeId)).run();
    return this.getSource(id);
  },
  replaceEpisodes(sourceId: number, animeId: number, eps: EpisodeInput[]) {
    const tx = sqlite.transaction(() => {
      db.delete(episodes).where(eq(episodes.sourceId, sourceId)).run();
      eps.forEach((e, i) =>
        db.insert(episodes).values({
          sourceId, animeId, code: e.code, number: e.number ?? null, title: e.title ?? null,
          fileName: e.fileName ?? null, url: e.url, size: e.size ?? null, sortOrder: i,
        }).run(),
      );
    });
    tx();
  },
  deleteSource(id: number) {
    db.delete(episodes).where(eq(episodes.sourceId, id)).run();
    db.delete(sources).where(eq(sources.id, id)).run();
  },

  /* comments */
  listComments(animeId: number, page = 1, per = 10) {
    const total = (sqlite.prepare("SELECT COUNT(*) c FROM comments WHERE anime_id=? AND parent_id IS NULL").get(animeId) as any).c as number;
    const all = (sqlite.prepare("SELECT COUNT(*) c FROM comments WHERE anime_id=?").get(animeId) as any).c as number;
    const pages = Math.max(1, Math.ceil(total / per));
    page = Math.min(Math.max(page, 1), pages);
    const tops = db.select().from(comments)
      .where(and(eq(comments.animeId, animeId), sql`${comments.parentId} IS NULL`))
      .orderBy(desc(comments.createdAt)).limit(per).offset((page - 1) * per).all();
    const replies = tops.length
      ? db.select().from(comments).where(inArray(comments.parentId, tops.map((t) => t.id))).orderBy(asc(comments.createdAt)).all()
      : [];
    const strip = ({ ip, ...c }: any): CommentDTO => ({ ...c, replies: [] });
    const items = tops.map((t) => ({ ...strip(t), replies: replies.filter((r) => r.parentId === t.id).map(strip) }));
    return { items, total, all, page, pages };
  },
  getComment(id: number) { return db.select().from(comments).where(eq(comments.id, id)).get(); },
  addComment(c: { animeId: number; parentId: number | null; name: string; body: string; isAdmin: boolean; ip: string | null }) {
    return db.insert(comments).values({ ...c, createdAt: Date.now() }).returning().get();
  },
  deleteComment(id: number) {
    db.delete(comments).where(eq(comments.parentId, id)).run();
    db.delete(comments).where(eq(comments.id, id)).run();
  },
  recentComments(page = 1, per = 30): { items: AdminComment[]; total: number; page: number; pages: number } {
    const total = (sqlite.prepare("SELECT COUNT(*) c FROM comments").get() as any).c as number;
    const pages = Math.max(1, Math.ceil(total / per));
    page = Math.min(Math.max(page, 1), pages);
    const items = sqlite.prepare(`SELECT c.id, c.anime_id as animeId, c.parent_id as parentId, c.name, c.body, c.is_admin as isAdmin, c.ip, c.created_at as createdAt, a.title as animeTitle, a.mal_id as malId
      FROM comments c JOIN anime a ON a.id = c.anime_id ORDER BY c.created_at DESC LIMIT ? OFFSET ?`).all(per, (page - 1) * per) as any[];
    return { items: items.map((i) => ({ ...i, isAdmin: !!i.isAdmin })), total, page, pages };
  },

  listAiring(olderThanMs: number) {
    const cut = Date.now() - olderThanMs;
    return this.allAnime(true).filter((a) => (a.status === "Currently Airing" || a.status === "Not yet aired") && a.updatedAt < cut);
  },

  stats() {
    const one = (q: string) => (sqlite.prepare(q).get() as any).c as number;
    return {
      anime: one("SELECT COUNT(*) c FROM anime"),
      published: one("SELECT COUNT(*) c FROM anime WHERE published=1"),
      featured: one("SELECT COUNT(*) c FROM anime WHERE featured=1"),
      sources: one("SELECT COUNT(*) c FROM sources"),
      episodes: one("SELECT COUNT(*) c FROM episodes"),
      totalSize: one("SELECT COALESCE(SUM(size),0) c FROM episodes"),
      users: one("SELECT COUNT(*) c FROM users"),
      comments: one("SELECT COUNT(*) c FROM comments"),
      withoutLinks: one("SELECT COUNT(*) c FROM anime WHERE id NOT IN (SELECT DISTINCT anime_id FROM episodes)"),
    };
  },
};

// buang cache setiap method yang mengubah data dipanggil
for (const k of ["upsertAnime", "patchAnime", "deleteAnime", "addSource", "updateSource", "replaceEpisodes", "deleteSource"] as const) {
  const orig = (storage as any)[k];
  (storage as any)[k] = function (...args: any[]) { bump(); const r = orig.apply(this, args); bump(); return r; };
}
