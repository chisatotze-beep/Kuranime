import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/* ---------- Users & sessions ---------- */
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  password: text("password").notNull(), // scrypt hash "salt:hash"
  role: text("role").notNull().default("admin"), // 'owner' | 'admin'
  totpSecret: text("totp_secret"),
  totpEnabled: integer("totp_enabled", { mode: "boolean" }).notNull().default(false),
  passwordChangedAt: integer("password_changed_at"),
});
export type User = typeof users.$inferSelect;
export type PublicUser = Pick<User, "id" | "username" | "role"> & { totpEnabled: boolean; passwordChangedAt: number | null };

/** token disimpan sebagai hash sha256, bukan token aslinya */
export const sessions = sqliteTable("sessions", {
  token: text("token").primaryKey(),
  userId: integer("user_id").notNull(),
  createdAt: integer("created_at").notNull(),
  lastSeen: integer("last_seen").notNull(),
  expiresAt: integer("expires_at").notNull(),
  ip: text("ip"),
  ua: text("ua"),
});

export const audit = sqliteTable("audit", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id"),
  username: text("username"),
  action: text("action").notNull(),
  detail: text("detail"),
  ip: text("ip"),
  at: integer("at").notNull(),
});
export type AuditRow = typeof audit.$inferSelect;
export type SessionInfo = { id: string; userId: number; username: string; device: string; ip: string | null; createdAt: number; lastSeen: number; current: boolean };
export type SecurityOverview = {
  me: { totpEnabled: boolean; passwordChangedAt: number | null; lastLogin: AuditRow | null };
  sessions: SessionInfo[];
  failed24h: number;
  blockedNow: number;
  admins: { id: number; username: string; role: string; totpEnabled: boolean; lastLogin: number | null }[] | null;
  audit: AuditRow[];
  checks: { key: string; ok: boolean; label: string; hint: string }[];
};

/* ---------- Anime (data dari MyAnimeList / Jikan) ---------- */
export const anime = sqliteTable("anime", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  malId: integer("mal_id").notNull().unique(),
  title: text("title").notNull(),
  titleEnglish: text("title_english"),
  titleJapanese: text("title_japanese"),
  synonyms: text("synonyms").notNull().default("[]"), // json string[]
  type: text("type"),
  source: text("source"),
  episodes: integer("episodes"),
  status: text("status"),
  airedFrom: text("aired_from"),
  airedString: text("aired_string"),
  season: text("season"), // winter | spring | summer | fall
  year: integer("year"),
  duration: text("duration"),
  broadcast: text("broadcast"),
  rating: text("rating"),
  score: real("score"),
  scoredBy: integer("scored_by"),
  rank: integer("rank"),
  popularity: integer("popularity"),
  members: integer("members"),
  synopsis: text("synopsis"),
  imageUrl: text("image_url"),
  trailerYoutubeId: text("trailer_youtube_id"),
  studios: text("studios").notNull().default("[]"), // json string[]
  producers: text("producers").notNull().default("[]"),
  genres: text("genres").notNull().default("[]"), // genres + themes + demographics
  episodeTitles: text("episode_titles").notNull().default("{}"), // json {num: title}
  published: integer("published", { mode: "boolean" }).notNull().default(true),
  featured: integer("featured", { mode: "boolean" }).notNull().default(false),
  addedAt: integer("added_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
export type AnimeRow = typeof anime.$inferSelect;

/* ---------- Sumber download (1 folder index = 1 sumber) ---------- */
export const sources = sqliteTable("sources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  animeId: integer("anime_id").notNull(),
  label: text("label").notNull(),
  folderUrl: text("folder_url"),
  quality: text("quality"), // BD | WEB | DVD | HDTV
  resolution: text("resolution"), // 1080p, 720p, ...
  sortOrder: integer("sort_order").notNull().default(0),
});
export type Source = typeof sources.$inferSelect;

export const episodes = sqliteTable("episodes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sourceId: integer("source_id").notNull(),
  animeId: integer("anime_id").notNull(),
  code: text("code").notNull(), // S01E01
  number: integer("number"),
  title: text("title"),
  fileName: text("file_name"),
  url: text("url").notNull(),
  size: integer("size"),
  sortOrder: integer("sort_order").notNull().default(0),
});
export type Episode = typeof episodes.$inferSelect;

export const comments = sqliteTable("comments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  animeId: integer("anime_id").notNull(),
  parentId: integer("parent_id"),
  name: text("name").notNull(),
  body: text("body").notNull(),
  isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  ip: text("ip"),
  createdAt: integer("created_at").notNull(),
});
export type CommentRow = typeof comments.$inferSelect;
export type CommentDTO = Omit<CommentRow, "ip"> & { replies: CommentDTO[] };
export type AdminComment = Omit<CommentRow, "ip"> & { animeTitle: string; malId: number; ip: string | null };

export const commentInputSchema = z.object({
  name: z.string().trim().max(32).optional().default(""),
  body: z.string().trim().min(2, "Komentar terlalu pendek").max(1500, "Maksimal 1500 karakter"),
  parentId: z.number().int().nullable().optional(),
  website: z.string().optional(), // honeypot
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/* ---------- Shared DTOs ---------- */
const httpUrl = z.string().trim().max(2048).refine((u) => {
  try { const x = new URL(u); return x.protocol === "https:" || x.protocol === "http:"; } catch { return false; }
}, "Link harus diawali http:// atau https://");


export const malAnimeSchema = z.object({
  malId: z.number().int(),
  title: z.string(),
  titleEnglish: z.string().nullable().optional(),
  titleJapanese: z.string().nullable().optional(),
  synonyms: z.array(z.string()).default([]),
  type: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  episodes: z.number().nullable().optional(),
  status: z.string().nullable().optional(),
  airedFrom: z.string().nullable().optional(),
  airedString: z.string().nullable().optional(),
  season: z.string().nullable().optional(),
  year: z.number().nullable().optional(),
  duration: z.string().nullable().optional(),
  broadcast: z.string().nullable().optional(),
  rating: z.string().nullable().optional(),
  score: z.number().nullable().optional(),
  scoredBy: z.number().nullable().optional(),
  rank: z.number().nullable().optional(),
  popularity: z.number().nullable().optional(),
  members: z.number().nullable().optional(),
  synopsis: z.string().nullable().optional(),
  imageUrl: httpUrl.nullable().optional(),
  trailerYoutubeId: z.string().regex(/^[\w-]{6,20}$/).nullable().optional(),
  studios: z.array(z.string()).default([]),
  producers: z.array(z.string()).default([]),
  genres: z.array(z.string()).default([]),
  episodeTitles: z.record(z.string(), z.string()).default({}),
});
export type MalAnime = z.infer<typeof malAnimeSchema>;

export const episodeInputSchema = z.object({
  code: z.string().min(1),
  number: z.number().int().nullable().optional(),
  title: z.string().nullable().optional(),
  fileName: z.string().nullable().optional(),
  url: httpUrl,
  size: z.number().nullable().optional(),
});
export type EpisodeInput = z.infer<typeof episodeInputSchema>;

export const sourceInputSchema = z.object({
  label: z.string().trim().min(1).max(120),
  folderUrl: httpUrl.nullable().optional().or(z.literal("")),
  quality: z.string().nullable().optional(),
  resolution: z.string().nullable().optional(),
  episodes: z.array(episodeInputSchema).default([]),
});
export type SourceInput = z.infer<typeof sourceInputSchema>;

export const createAnimeSchema = z.object({
  mal: malAnimeSchema,
  published: z.boolean().default(true),
  featured: z.boolean().default(false),
  sources: z.array(sourceInputSchema).default([]),
});

export { httpUrl };
export const insertUserSchema = createInsertSchema(users).pick({ username: true, password: true });

/** Anime yang dikirim ke klien: kolom json sudah di-parse */
export type AnimeDTO = Omit<AnimeRow, "synonyms" | "studios" | "producers" | "genres" | "episodeTitles"> & {
  synonyms: string[];
  studios: string[];
  producers: string[];
  genres: string[];
  episodeTitles: Record<string, string>;
  episodeCount?: number;
};
export type AnimeCard = Pick<
  AnimeDTO,
  "id" | "malId" | "title" | "titleEnglish" | "type" | "year" | "season" | "score" | "imageUrl" | "episodes" | "status" | "genres" | "studios" | "published" | "featured" | "addedAt"
> & { episodeCount: number; qualities: string[] };
export type SourceWithEpisodes = Source & { episodes: Episode[] };
export type AnimeDetail = AnimeDTO & { sources: SourceWithEpisodes[] };

export type SiteSettings = {
  siteName: string;
  tagline: string;
  announcement: string;
  perPage: number;
  players: string[]; // id pemutar yang aktif
  indexRoot: string; // root index Google Drive untuk penjelajah folder
  indexHosts: string[]; // domain index yang diizinkan (anti-SSRF)
};
export type Facets = {
  genres: { name: string; count: number }[];
  studios: { name: string; count: number }[];
  years: number[];
  types: string[];
  statuses: string[];
  ratings: string[];
  sources: string[];
  qualities: string[];
};

export type IndexEntry = {
  name: string;
  url: string;
  isFolder: boolean;
  size?: number | null;
  mimeType?: string;
  parsed?: { code: string; number: number | null; title: string | null } | null;
};

export * from "./utils";
