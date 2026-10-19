// Helper & konstanta tanpa dependensi berat (aman dipakai di browser).
import type { MalAnime, SiteSettings } from "./schema";

export const DEFAULT_SETTINGS: SiteSettings = {
  siteName: "Kura",
  tagline: "Unduh anime favoritmu, rapi dan cepat.",
  announcement: "",
  perPage: 12,
  players: ["mx", "mxpro", "vlc", "mpv", "just", "nplayer", "vlcios", "infuse", "outplayer", "potplayer", "iina"],
  indexRoot: "https://adb.gabutinz.workers.dev/0:/",
  indexHosts: ["adb.gabutinz.workers.dev"],
};


/* ---------- Status tayang (dari MAL) ---------- */
export type AiringKey = "ongoing" | "finished" | "upcoming";
export function airingKey(status?: string | null): AiringKey | null {
  if (!status) return null;
  if (/currently airing/i.test(status)) return "ongoing";
  if (/finished/i.test(status)) return "finished";
  if (/not yet/i.test(status)) return "upcoming";
  return null;
}
export const AIRING_LABEL: Record<AiringKey, string> = { ongoing: "Ongoing", finished: "Tamat", upcoming: "Segera" };
export const AIRING_STATUS: Record<AiringKey, string> = { ongoing: "Currently Airing", finished: "Finished Airing", upcoming: "Not yet aired" };

/** "Saturdays at 23:00 (JST)" -> "Sabtu 21:00 WIB" */
export function broadcastLocal(b?: string | null): string | null {
  if (!b) return null;
  const days = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
  const id = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const m = b.match(/(\w+days?)\s+at\s+(\d{1,2}):(\d{2})\s*\(JST\)/i);
  if (!m) return b;
  let d = days.findIndex((x) => x.toLowerCase().startsWith(m[1].toLowerCase().replace(/s$/, "")));
  if (d < 0) return b;
  let h = Number(m[2]) - 2; // JST (UTC+9) -> WIB (UTC+7)
  if (h < 0) { h += 24; d = (d + 6) % 7; }
  return `${id[d]} ${String(h).padStart(2, "0")}:${m[3]} WIB`;
}

export const QUALITY_LABEL: Record<string, string> = { BD: "Blu-ray", WEB: "WEB", DVD: "DVD", HDTV: "HDTV" };
export const QUALITIES = ["BD", "WEB", "DVD", "HDTV"] as const;

/** Deteksi kualitas & resolusi dari nama folder/file */
export function detectQuality(...texts: (string | null | undefined)[]): { quality: string | null; resolution: string | null } {
  const t = texts.filter(Boolean).map((x) => { try { return decodeURIComponent(x!); } catch { return x!; } }).join(" ");
  let quality: string | null = null;
  if (/\b(BD|BDRip|BDMV|Blu-?ray|BluRay|BDRemux)\b/i.test(t)) quality = "BD";
  else if (/\bWEB(-?DL|-?Rip)?\b|\b(CR|NF|AMZN|DSNP|HIDIVE|B-Global|Baha)\b/i.test(t)) quality = "WEB";
  else if (/\bDVD(Rip)?\b/i.test(t)) quality = "DVD";
  else if (/\bHDTV\b|\bTVRip\b/i.test(t)) quality = "HDTV";
  const r = t.match(/\b(2160|1440|1080|720|576|480)p\b/i) || t.match(/\b\d{3,4}x(2160|1080|720|480)\b/i);
  return { quality, resolution: r ? `${r[1]}p` : /\b4K\b/i.test(t) ? "2160p" : null };
}

export const SEASONS = ["winter", "spring", "summer", "fall"] as const;
export const SEASON_LABEL: Record<string, string> = { winter: "Winter", spring: "Spring", summer: "Summer", fall: "Fall" };

/** Ambil MAL ID dari URL MyAnimeList (atau angka langsung) */
export function parseMalId(input: string): number | null {
  const s = input.trim();
  if (/^\d+$/.test(s)) return Number(s);
  const m = s.match(/myanimelist\.net\/anime\/(\d+)/i) || s.match(/\/anime\/(\d+)/i);
  return m ? Number(m[1]) : null;
}

/** Ubah respons Jikan v4 /anime/{id}/full menjadi MalAnime */
export function normalizeJikan(d: any, episodeTitles: Record<string, string> = {}): MalAnime {
  const names = (arr: any[] | undefined) => (arr || []).map((x) => x.name).filter(Boolean);
  return {
    malId: d.mal_id,
    title: d.title,
    titleEnglish: d.title_english ?? null,
    titleJapanese: d.title_japanese ?? null,
    synonyms: d.title_synonyms || [],
    type: d.type ?? null,
    source: d.source ?? null,
    episodes: d.episodes ?? null,
    status: d.status ?? null,
    airedFrom: d.aired?.from ?? null,
    airedString: d.aired?.string ?? null,
    season: d.season ?? null,
    year: d.year ?? (d.aired?.prop?.from?.year || null),
    duration: d.duration ?? null,
    broadcast: d.broadcast?.string && d.broadcast.string !== "Unknown" ? d.broadcast.string : null,
    rating: d.rating ?? null,
    score: d.score ?? null,
    scoredBy: d.scored_by ?? null,
    rank: d.rank ?? null,
    popularity: d.popularity ?? null,
    members: d.members ?? null,
    synopsis: d.synopsis ?? null,
    imageUrl: d.images?.webp?.large_image_url || d.images?.jpg?.large_image_url || d.images?.jpg?.image_url || null,
    trailerYoutubeId: d.trailer?.youtube_id ?? null,
    studios: names(d.studios),
    producers: names(d.producers),
    genres: [...names(d.genres), ...names(d.themes), ...names(d.demographics)],
    episodeTitles,
  };
}

/** Parse nama file episode, contoh: "S01E01-Undertaker [2F703024].mkv" */
export function parseEpisodeFile(name: string): { code: string; number: number | null; title: string | null } | null {
  const base = name.replace(/\.(mkv|mp4|avi|webm|m4v|mov|ts)$/i, "");
  const clean = (t: string) =>
    t
      .replace(/\[[^\]]*\]/g, "")
      .replace(/\([^)]*(1080|720|480|HEVC|x26|BD|WEB)[^)]*\)/gi, "")
      .replace(/^[\s\-_.:]+|[\s\-_.:]+$/g, "")
      .replace(/_/g, " ")
      .trim() || null;
  let m = base.match(/S(\d{1,2})\s?E(\d{1,4})(?:v\d)?(.*)$/i);
  if (m) {
    const s = Number(m[1]);
    const e = Number(m[2]);
    return { code: `S${String(s).padStart(2, "0")}E${String(e).padStart(2, "0")}`, number: e, title: clean(m[3]) };
  }
  m = base.match(/(?:^|[\s\-_\]])(?:EP?|Episode|Eps)\s?\.?(\d{1,4})(?:v\d)?(.*)$/i) || base.match(/\s-\s(\d{1,4})(?:v\d)?(\s.*)?$/);
  if (m) {
    const e = Number(m[1]);
    return { code: `S01E${String(e).padStart(2, "0")}`, number: e, title: clean(m[2] || "") };
  }
  if (/movie|film/i.test(base)) return { code: "MOVIE", number: 1, title: clean(base) };
  return { code: "FILE", number: null, title: clean(base) };
}

/** hanya izinkan http/https untuk href (cegah javascript: dsb.) */
export function safeHref(u?: string | null): string {
  if (!u) return "#";
  return /^https?:\/\//i.test(u.trim()) ? u : "#";
}
