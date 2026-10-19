import { api } from "./queryClient";
import { normalizeJikan, parseMalId } from "@shared/utils";
import type { MalAnime } from "@shared/schema";

const JIKAN = "https://api.jikan.moe/v4";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function jfetch(url: string, ms = 9000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (r.status === 404) throw Object.assign(new Error("Anime tidak ditemukan di MyAnimeList"), { notFound: true });
    if (!r.ok) throw new Error(`Jikan ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

/** Ambil data anime: langsung dari Jikan di browser, cadangan lewat server */
export async function resolveMal(input: string): Promise<MalAnime & { via: string }> {
  const id = parseMalId(input);
  if (!id) throw new Error("Link MyAnimeList tidak valid. Contoh: https://myanimelist.net/anime/41457/86");
  try {
    const full = (await jfetch(`${JIKAN}/anime/${id}/full`)).data;
    const titles: Record<string, string> = {};
    try {
      for (let page = 1; page <= 5; page++) {
        await sleep(350);
        const ej = await jfetch(`${JIKAN}/anime/${id}/episodes?page=${page}`, 7000);
        for (const e of ej.data || []) if (e.title) titles[String(e.mal_id)] = e.title;
        if (!ej.pagination?.has_next_page) break;
      }
    } catch {}
    return { ...normalizeJikan(full, titles), via: "jikan" };
  } catch (e: any) {
    if (e.notFound) throw e;
    const r = await api<{ mal: MalAnime & { via: string } }>("POST", "/api/admin/mal/resolve", { url: String(id) });
    return r.mal;
  }
}

export type MalHit = { malId: number; title: string; imageUrl: string | null; type: string | null; year: number | null; score: number | null; inCatalog?: boolean };

export async function searchMal(q: string, catalog: Set<number>): Promise<MalHit[]> {
  try {
    const j = await jfetch(`${JIKAN}/anime?q=${encodeURIComponent(q)}&limit=10`, 7000);
    return (j.data || []).map((d: any) => ({
      malId: d.mal_id, title: d.title, imageUrl: d.images?.jpg?.image_url || null, type: d.type,
      year: d.year || d.aired?.prop?.from?.year || null, score: d.score, inCatalog: catalog.has(d.mal_id),
    }));
  } catch {
    return api<MalHit[]>("GET", `/api/admin/mal/search?q=${encodeURIComponent(q)}`);
  }
}
