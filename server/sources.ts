/** error dari layanan luar: pesannya aman ditampilkan ke admin */
const extErr = (m: string) => Object.assign(new Error(m), { status: /tidak ditemukan/.test(m) ? 404 : 502, expose: true });
import { normalizeJikan, parseEpisodeFile, type MalAnime, type IndexEntry } from "@shared/schema";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, headers: { "User-Agent": UA, ...(init.headers || {}) } });
  } finally {
    clearTimeout(t);
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ================= MyAnimeList via Jikan ================= */
async function fromJikan(malId: number): Promise<MalAnime> {
  const r = await fetchWithTimeout(`https://api.jikan.moe/v4/anime/${malId}/full`, {}, 10000);
  if (r.status === 404) throw extErr("Anime tidak ditemukan di MyAnimeList");
  if (!r.ok) throw extErr(`Jikan ${r.status}`);
  const full = (await r.json()).data;
  const titles: Record<string, string> = {};
  try {
    for (let page = 1; page <= 5; page++) {
      await sleep(400);
      const er = await fetchWithTimeout(`https://api.jikan.moe/v4/anime/${malId}/episodes?page=${page}`, {}, 10000);
      if (!er.ok) break;
      const ej = await er.json();
      for (const e of ej.data || []) if (e.title) titles[String(e.mal_id)] = e.title;
      if (!ej.pagination?.has_next_page) break;
    }
  } catch {}
  return normalizeJikan(full, titles);
}

/* ================= Cadangan: baca halaman MAL langsung ================= */
const decode = (s: string) =>
  s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&hellip;/g, "…")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();

function field(h: string, label: string): string | null {
  const i = h.indexOf(`<span class="dark_text">${label}:</span>`);
  if (i < 0) return null;
  const end = h.indexOf("</div>", i);
  return h.slice(i + label.length + 32, end);
}
const fieldText = (h: string, label: string) => {
  const f = field(h, label);
  if (f == null) return null;
  const t = decode(f.replace(/<span itemprop="genre"[^>]*>[^<]*<\/span>/g, "").replace(/<sup>[\s\S]*?<\/sup>/g, "").replace(/<div class="statistics-info[\s\S]*$/, "")).replace(/\s+/g, " ").trim();
  return t && t !== "None found, add some" && t !== "Unknown" ? t : null;
};
const fieldLinks = (h: string, label: string) => {
  const f = field(h, label);
  if (!f) return [];
  return [...f.matchAll(/<a [^>]*title="([^"]+)"/g)].map((m) => decode(m[1]));
};
const num = (s: string | null | undefined) => {
  if (!s) return null;
  const n = Number(s.replace(/[#,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};

async function fromMalHtml(malId: number): Promise<MalAnime> {
  const r = await fetchWithTimeout(`https://myanimelist.net/anime/${malId}`);
  if (r.status === 404) throw extErr("Anime tidak ditemukan di MyAnimeList");
  if (!r.ok) throw extErr(`MyAnimeList ${r.status}`);
  const h = await r.text();
  const title = decode(h.match(/<h1 class="title-name[^"]*"><strong>([\s\S]*?)<\/strong>/)?.[1] || "");
  if (!title) throw extErr("Gagal membaca halaman MyAnimeList");
  const premiered = h.match(/anime\/season\/(\d{4})\/(winter|spring|summer|fall)/);
  const aired = fieldText(h, "Aired");
  let airedFrom: string | null = null;
  if (aired) {
    const d = new Date(aired.split(" to ")[0] + " UTC");
    if (!isNaN(+d)) airedFrom = d.toISOString();
  }
  const genres = [...fieldLinks(h, "Genres"), ...fieldLinks(h, "Genre"), ...fieldLinks(h, "Themes"), ...fieldLinks(h, "Theme"), ...fieldLinks(h, "Demographic")];
  const studios = fieldLinks(h, "Studios").filter((s) => !/add some/i.test(s));
  const producers = fieldLinks(h, "Producers").filter((s) => !/add some/i.test(s));
  const synopsis = h.match(/<p itemprop="description">([\s\S]*?)<\/p>/)?.[1];
  const img = h.match(/<meta property="og:image" content="([^"]+)"/)?.[1] || null;
  const type = fieldText(h, "Type");
  const yt = h.match(/youtube(?:-nocookie)?\.com\/embed\/([\w-]{11})/)?.[1] || null;

  const titles: Record<string, string> = {};
  try {
    await sleep(500);
    const er = await fetchWithTimeout(`https://myanimelist.net/anime/${malId}/_/episode`);
    if (er.ok) {
      const eh = await er.text();
      const rows = eh.split('<tr class="episode-list-data">').slice(1);
      for (const row of rows) {
        const n = row.match(/episode-number[^>]*data-raw="(\d+)"/)?.[1];
        const t = row.match(/class="fl-l fw-b ">([^<]+)</)?.[1];
        if (n && t) titles[n] = decode(t);
      }
    }
  } catch {}

  const yearFromAired = airedFrom ? new Date(airedFrom).getUTCFullYear() : null;
  return {
    malId,
    title,
    titleEnglish: decode(h.match(/<p class="title-english[^"]*">([\s\S]*?)<\/p>/)?.[1] || "") || fieldText(h, "English"),
    titleJapanese: fieldText(h, "Japanese"),
    synonyms: (fieldText(h, "Synonyms") || "").split(",").map((s) => s.trim()).filter(Boolean),
    type,
    source: fieldText(h, "Source"),
    episodes: num(fieldText(h, "Episodes")),
    status: fieldText(h, "Status"),
    airedFrom,
    airedString: aired,
    season: premiered?.[2] || null,
    year: premiered ? Number(premiered[1]) : yearFromAired,
    duration: fieldText(h, "Duration"),
    broadcast: fieldText(h, "Broadcast"),
    rating: fieldText(h, "Rating"),
    score: num(h.match(/itemprop="ratingValue"[^>]*>([\d.]+)</)?.[1]),
    scoredBy: num(h.match(/itemprop="ratingCount"[^>]*>(\d+)</)?.[1]),
    rank: num((fieldText(h, "Ranked") || "").match(/#?(\d[\d,]*)/)?.[1]),
    popularity: num(fieldText(h, "Popularity")),
    members: num(fieldText(h, "Members")),
    synopsis: synopsis ? decode(synopsis).replace(/\n{3,}/g, "\n\n") : null,
    imageUrl: img,
    trailerYoutubeId: yt,
    studios,
    producers,
    genres: [...new Set(genres)],
    episodeTitles: titles,
  };
}

const malCache = new Map<number, { at: number; data: MalAnime }>();
export async function fetchMal(malId: number): Promise<MalAnime & { via: string }> {
  const c = malCache.get(malId);
  if (c && Date.now() - c.at < 10 * 60 * 1000) return { ...c.data, via: "cache" };
  let data: MalAnime;
  let via = "jikan";
  try {
    data = await fromJikan(malId);
  } catch (e: any) {
    if (/tidak ditemukan/.test(e.message)) throw e;
    via = "myanimelist";
    data = await fromMalHtml(malId);
  }
  malCache.set(malId, { at: Date.now(), data });
  return { ...data, via };
}

/* ================= Index Google Drive (goindex) ================= */
export function normalizeFolderUrl(u: string) {
  const url = new URL(u.trim());
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export async function listIndexFolder(folderUrl: string): Promise<IndexEntry[]> {
  const base = normalizeFolderUrl(folderUrl);
  const out: IndexEntry[] = [];
  let token: string | null = null;
  let pageIndex = 0;
  do {
    const body = new URLSearchParams({ password: "", page_token: token || "", page_index: String(pageIndex) });
    const r = await fetchWithTimeout(base, { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" } }, 20000);
    const text = await r.text();
    let j: any;
    try { j = JSON.parse(text); } catch { throw extErr("Link bukan folder index yang valid (respons bukan JSON)"); }
    if (j.error) throw new Error(j.error.message || "Index menolak permintaan");
    for (const f of j.data?.files || []) {
      const isFolder = f.mimeType === "application/vnd.google-apps.folder";
      const url = base + encodeURIComponent(f.name) + (isFolder ? "/" : "");
      const isVideo = /^video\//.test(f.mimeType) || /\.(mkv|mp4|avi|webm|m4v|mov)$/i.test(f.name);
      out.push({
        name: f.name,
        url,
        isFolder,
        size: f.size ? Number(f.size) : null,
        mimeType: f.mimeType,
        parsed: !isFolder && isVideo ? parseEpisodeFile(f.name) : null,
      });
    }
    token = j.nextPageToken || null;
    pageIndex++;
  } while (token && pageIndex < 30);
  out.sort((a, b) => (a.isFolder === b.isFolder ? a.name.localeCompare(b.name, undefined, { numeric: true }) : a.isFolder ? -1 : 1));
  return out;
}

/** Nama folder yang rapi untuk label sumber */
export function prettyFolderName(folderUrl: string) {
  const parts = new URL(folderUrl).pathname.split("/").filter(Boolean);
  const last = decodeURIComponent(parts[parts.length - 1] || "");
  return last.replace(/\n/g, " ").replace(/^\[[^\]]+\]\s*/, "").trim() || "Download";
}

export type MalSearchItem = { malId: number; title: string; imageUrl: string | null; type: string | null; year: number | null; score: number | null };
export async function searchMal(q: string): Promise<MalSearchItem[]> {
  try {
    const r = await fetchWithTimeout(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(q)}&limit=10&sfw=false`, {}, 8000);
    if (!r.ok) throw new Error();
    const j = await r.json();
    return (j.data || []).map((d: any) => ({ malId: d.mal_id, title: d.title, imageUrl: d.images?.jpg?.image_url || null, type: d.type, year: d.year || d.aired?.prop?.from?.year || null, score: d.score }));
  } catch {
    const r = await fetchWithTimeout(`https://myanimelist.net/search/prefix.json?type=anime&keyword=${encodeURIComponent(q)}&v=1`);
    if (!r.ok) throw extErr("Pencarian MyAnimeList gagal");
    const j = await r.json();
    const items = j.categories?.[0]?.items || [];
    return items.map((d: any) => ({
      malId: d.id, title: d.name, imageUrl: (d.image_url || "").replace(/\/r\/\d+x\d+/, "") || null,
      type: d.payload?.media_type || null, year: Number(d.payload?.start_year) || null, score: Number(d.payload?.score) || null,
    }));
  }
}

/* Pencarian folder di seluruh index (root + 1 level grup), di-cache 30 menit */
const treeCache = new Map<string, { at: number; folders: IndexEntry[] }>();
export async function searchIndex(root: string, q: string): Promise<IndexEntry[]> {
  const base = normalizeFolderUrl(root);
  let c = treeCache.get(base);
  if (!c || Date.now() - c.at > 30 * 60 * 1000) {
    const top = await listIndexFolder(base);
    const groups = top.filter((e) => e.isFolder);
    const folders: IndexEntry[] = [...groups];
    // baca grup paralel (maks 4 sekaligus)
    for (let i = 0; i < groups.length; i += 4) {
      const chunk = await Promise.all(groups.slice(i, i + 4).map((g) => listIndexFolder(g.url).catch(() => [] as IndexEntry[])));
      chunk.flat().filter((e) => e.isFolder).forEach((e) => folders.push(e));
    }
    c = { at: Date.now(), folders };
    treeCache.set(base, c);
  }
  const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ");
  const words = norm(q).split(" ").filter((w) => w.length > 1);
  if (!words.length) return [];
  return c.folders.filter((f) => words.every((w) => norm(f.name).includes(w))).slice(0, 60);
}
