import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, ChevronRight, Download, ExternalLink, FileVideo, Folder, FolderOpen, Home, Link2, Loader2, Plus, RefreshCw, Save, Search, Trash2, X, Check, ChevronUp, ChevronDown,
} from "lucide-react";
import { api, queryClient } from "@/lib/queryClient";
import { resolveMal, searchMal, type MalHit } from "@/lib/mal";
import { useApp } from "@/lib/store";
import { formatSize, seasonLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHead } from "./admin";
import { EmptyState, QualityBadge } from "@/components/site";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { parseEpisodeFile, detectQuality, QUALITIES, QUALITY_LABEL } from "@shared/utils";
import type { AnimeDetail, EpisodeInput, IndexEntry, MalAnime, SourceInput, SourceWithEpisodes } from "@shared/schema";

/* ===================== helpers ===================== */
function labelFromFolder(folderUrl: string) {
  let segs: string[] = [];
  try { segs = new URL(folderUrl).pathname.split("/").filter(Boolean).map((s) => decodeURIComponent(s)); } catch {}
  const all = segs.join(" ");
  const last = segs[segs.length - 1] || "";
  const part = last.match(/\(([^)]*(Season|Part|Movie|OVA|OAD|Special|Batch|Cour)[^)]*)\)/i)?.[1];
  const src = /\bBD\b|Blu-?ray/i.test(all) ? "BD" : /\bWEB/i.test(all) ? "WEB" : "";
  const res = all.match(/\b(2160|1080|720|480)p\b/i)?.[1];
  const codec = /HEVC|x265/i.test(all) ? "HEVC" : /x264|AVC/i.test(all) ? "x264" : "";
  const dual = /Dual Audio/i.test(all) ? "Dual Audio" : "";
  const q = [src, res ? `${res}p` : "", codec].filter(Boolean).join(" ");
  return [part, q, dual].filter(Boolean).join(" · ") || last.replace(/\n/g, " ").replace(/^\[[^\]]+\]\s*/, "") || "Download";
}
function entriesToEpisodes(entries: IndexEntry[]): EpisodeInput[] {
  return entries
    .filter((e) => !e.isFolder && e.parsed)
    .map((e) => ({ code: e.parsed!.code, number: e.parsed!.number, title: e.parsed!.title, fileName: e.name, url: e.url, size: e.size ?? null }))
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
}
const listFolder = (url: string) => api<{ folderUrl: string; label: string; entries: IndexEntry[] }>("POST", "/api/admin/index/list", { url });

/* ===================== Index browser ===================== */
export function IndexBrowser({ hint, onPick, compact }: { hint?: string; onPick: (drafts: SourceInput[]) => void; compact?: boolean }) {
  const { site } = useApp();
  const { toast } = useToast();
  const [url, setUrl] = useState(site.indexRoot);
  const [input, setInput] = useState(site.indexRoot);
  const [filter, setFilter] = useState(hint || "");
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { setUrl(site.indexRoot); setInput(site.indexRoot); }, [site.indexRoot]);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["index", url],
    queryFn: () => listFolder(url),
    staleTime: 5 * 60_000,
  });
  const [dfilter, setDfilter] = useState(filter);
  useEffect(() => { const t = setTimeout(() => setDfilter(filter), 300); return () => clearTimeout(t); }, [filter]);
  const atRoot = url.replace(/\/+$/, "") === site.indexRoot.replace(/\/+$/, "");
  const global = useQuery<IndexEntry[]>({
    queryKey: ["/api/admin/index/search", { q: dfilter.trim(), root: site.indexRoot }],
    enabled: atRoot && dfilter.trim().length >= 2,
    staleTime: 5 * 60_000,
  });
  const folders = data?.entries.filter((e) => e.isFolder) || [];
  const videos = data?.entries.filter((e) => !e.isFolder && e.parsed) || [];
  const others = data?.entries.filter((e) => !e.isFolder && !e.parsed) || [];
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ");
  const words = norm(filter).split(" ").filter((w) => w.length > 1);
  const local = words.length ? folders.filter((f) => words.every((w) => norm(f.name).includes(w))) : folders;
  const shown = atRoot && words.length ? (global.data || []) : local;

  const crumbs = useMemo(() => {
    try {
      const u = new URL(url);
      const root = new URL(site.indexRoot);
      const segs = u.pathname.split("/").filter(Boolean);
      const rootSegs = root.pathname.split("/").filter(Boolean).length;
      return segs.map((s, i) => ({ name: decodeURIComponent(s).replace(/\n/g, " "), url: `${u.origin}/${segs.slice(0, i + 1).join("/")}/`, isRoot: i < rootSegs }));
    } catch { return []; }
  }, [url, site.indexRoot]);

  const pickFolder = async (f: { url: string }, all = false) => {
    setBusy(f.url);
    try {
      const r = await listFolder(f.url);
      const subs = r.entries.filter((e) => e.isFolder);
      const eps = entriesToEpisodes(r.entries);
      const drafts: SourceInput[] = [];
      if (eps.length) drafts.push({ label: labelFromFolder(r.folderUrl), folderUrl: r.folderUrl, ...detectQuality(r.folderUrl, eps[0]?.fileName), episodes: eps });
      if (all || !eps.length) {
        for (const s of subs) {
          const rs = await listFolder(s.url);
          const se = entriesToEpisodes(rs.entries);
          if (se.length) drafts.push({ label: labelFromFolder(rs.folderUrl), folderUrl: rs.folderUrl, ...detectQuality(rs.folderUrl, se[0]?.fileName), episodes: se });
        }
      }
      if (!drafts.length) toast({ title: "Tidak ada file video", description: "Folder ini tidak berisi file video.", variant: "destructive" });
      else onPick(drafts);
    } catch (e: any) {
      toast({ title: "Gagal membaca folder", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <form className="flex gap-2 border-b border-border p-3" onSubmit={(e) => { e.preventDefault(); setUrl(input.trim()); }}>
        <div className="relative flex-1">
          <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Tempel link folder index…" className="pl-9 font-mono text-xs" data-testid="input-index-url" />
        </div>
        <Button type="submit" variant="secondary" data-testid="button-index-open">Buka</Button>
      </form>
      <div className="flex flex-wrap items-center gap-1 border-b border-border px-3 py-2 text-xs text-muted-foreground">
        <button onClick={() => { setUrl(site.indexRoot); setInput(site.indexRoot); }} className="hover:text-foreground" aria-label="Root"><Home className="h-3.5 w-3.5" /></button>
        {crumbs.filter((c) => !c.isRoot).map((c) => (
          <span key={c.url} className="flex min-w-0 items-center gap-1">
            <ChevronRight className="h-3 w-3 flex-none" />
            <button onClick={() => { setUrl(c.url); setInput(c.url); }} className="max-w-[16rem] truncate hover:text-foreground">{c.name}</button>
          </span>
        ))}
        <button onClick={() => refetch()} className="ml-auto hover:text-foreground" aria-label="Muat ulang"><RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} /></button>
      </div>
      {(folders.length > 0 || atRoot) && (
        <div className="border-b border-border p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={atRoot ? "Cari judul di seluruh index…" : `Saring ${folders.length} folder…`} className="h-9 w-full rounded-md bg-transparent pl-9 pr-3 text-sm outline-none" data-testid="input-index-filter" />
          </div>
        </div>
      )}
      <div className={cn("overflow-y-auto", compact ? "max-h-80" : "max-h-[26rem]")}>
        {(isLoading || (atRoot && words.length > 0 && global.isFetching)) && <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> {atRoot && words.length ? "Mencari di seluruh index (pertama kali agak lama)…" : "Membaca folder…"}</div>}
        {error && <div className="p-4 text-sm text-destructive">{(error as Error).message}</div>}
        {videos.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-primary/5 px-3 py-2.5">
            <span className="text-sm"><FileVideo className="mr-1.5 inline h-4 w-4 text-primary" />{videos.length} file video di folder ini</span>
            <Button size="sm" onClick={() => pickFolder({ url })} disabled={!!busy} data-testid="button-use-current-folder">
              {busy === url ? <Loader2 className="animate-spin" /> : <Check />} Pakai folder ini
            </Button>
          </div>
        )}
        {shown.map((f) => (
          <div key={f.url} className="group flex items-center gap-2 border-b border-border px-3 py-2 last:border-0 hover:bg-accent/40">
            <button onClick={() => { setUrl(f.url); setInput(f.url); setFilter(""); }} className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm" data-testid={`button-folder-${f.name.slice(0, 24)}`}>
              <Folder className="h-4 w-4 flex-none text-muted-foreground group-hover:text-primary" />
              <span className="min-w-0 [overflow-wrap:anywhere]">{f.name.replace(/\n/g, " ")}</span>
            </button>
            <Button size="sm" variant="ghost" className="flex-none" onClick={() => pickFolder(f, true)} disabled={!!busy} title="Pakai folder ini (termasuk subfolder)">
              {busy === f.url ? <Loader2 className="animate-spin" /> : "Pakai"}
            </Button>
          </div>
        ))}
        {data && !folders.length && !videos.length && <div className="p-4 text-sm text-muted-foreground">Folder kosong{others.length ? ` (${others.length} file non-video)` : ""}.</div>}
        {data && folders.length > 0 && !shown.length && !(atRoot && global.isFetching) && <div className="p-4 text-sm text-muted-foreground">Tidak ada folder yang cocok dengan “{filter}”.</div>}
      </div>
    </div>
  );
}

/* ===================== Episode editor ===================== */
export function SourceEditor({
  value, onChange, onRemove, episodeTitles, footer,
}: { value: SourceInput; onChange: (v: SourceInput) => void; onRemove?: () => void; episodeTitles?: Record<string, string>; footer?: React.ReactNode }) {
  const [open, setOpen] = useState(value.episodes.length <= 13);
  const [manual, setManual] = useState({ code: "", title: "", url: "" });
  const setEp = (i: number, p: Partial<EpisodeInput>) => onChange({ ...value, episodes: value.episodes.map((e, j) => (j === i ? { ...e, ...p } : e)) });
  const total = value.episodes.reduce((s, e) => s + (e.size || 0), 0);
  const addManual = () => {
    if (!manual.url) return;
    const parsed = parseEpisodeFile(decodeURIComponent(manual.url.split("/").pop() || ""));
    const code = manual.code || parsed?.code || `S01E${String(value.episodes.length + 1).padStart(2, "0")}`;
    onChange({ ...value, episodes: [...value.episodes, { code, number: Number(code.match(/E(\d+)/)?.[1]) || null, title: manual.title || parsed?.title || null, url: manual.url.trim(), fileName: null, size: null }] });
    setManual({ code: "", title: "", url: "" });
  };
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card" data-testid="card-source-editor">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <FolderOpen className="h-4 w-4 flex-none text-primary" />
        <Input value={value.label} onChange={(e) => onChange({ ...value, label: e.target.value })} className="h-8 min-w-0 flex-1 font-medium" aria-label="Label sumber" data-testid="input-source-label" />
        <span className="text-xs text-muted-foreground tabular">{value.episodes.length} file{total ? ` · ${formatSize(total)}` : ""}</span>
        <Button size="sm" variant="ghost" onClick={() => setOpen(!open)}>{open ? <ChevronUp /> : <ChevronDown />}{open ? "Tutup" : "Edit episode"}</Button>
        {onRemove && <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={onRemove} aria-label="Hapus sumber" data-testid="button-remove-source"><Trash2 /></Button>}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-xs text-muted-foreground">Label kualitas</span>
        <Select value={value.quality || "none"} onValueChange={(v) => onChange({ ...value, quality: v === "none" ? null : v })}>
          <SelectTrigger className="h-8 w-32 text-xs" data-testid="select-source-quality"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Tanpa label</SelectItem>
            {QUALITIES.map((q) => <SelectItem key={q} value={q}>{QUALITY_LABEL[q]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={value.resolution || "none"} onValueChange={(v) => onChange({ ...value, resolution: v === "none" ? null : v })}>
          <SelectTrigger className="h-8 w-28 text-xs" data-testid="select-source-resolution"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Resolusi —</SelectItem>
            {["2160p", "1080p", "720p", "480p"].map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
        <QualityBadge q={value.quality} res={value.resolution} />
        <span className="text-[11px] text-muted-foreground">terdeteksi otomatis dari nama folder/file</span>
      </div>
      {value.folderUrl && <div className="truncate border-b border-border px-3 py-1.5 font-mono text-[11px] text-muted-foreground" title={value.folderUrl}>{decodeURIComponent(value.folderUrl).replace(/\n/g, " ")}</div>}
      {open && (
        <div>
          <div className="max-h-[28rem] overflow-y-auto">
            {value.episodes.map((e, i) => (
              <div key={i} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-2 border-b border-border px-3 py-1.5" data-testid={`row-edit-episode-${i}`}>
                <Input value={e.code} onChange={(ev) => setEp(i, { code: ev.target.value })} className="h-8 font-mono text-xs" aria-label="Kode episode" />
                <Input
                  value={e.title || ""}
                  onChange={(ev) => setEp(i, { title: ev.target.value || null })}
                  placeholder={(e.number != null && episodeTitles?.[String(e.number)]) || "Judul episode"}
                  className="h-8 text-sm"
                  aria-label="Judul episode"
                />
                <div className="flex items-center">
                  <a href={e.url} target="_blank" rel="noopener noreferrer" className="grid h-8 w-8 place-items-center text-muted-foreground hover:text-foreground" title={e.fileName || e.url}><Download className="h-3.5 w-3.5" /></a>
                  <button onClick={() => onChange({ ...value, episodes: value.episodes.filter((_, j) => j !== i) })} className="grid h-8 w-8 place-items-center text-muted-foreground hover:text-destructive" aria-label="Hapus episode"><X className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
          <div className="grid gap-2 bg-muted/40 p-3 sm:grid-cols-[5.5rem_1fr_1.4fr_auto]">
            <Input value={manual.code} onChange={(e) => setManual({ ...manual, code: e.target.value })} placeholder="S01E13" className="h-8 font-mono text-xs" />
            <Input value={manual.title} onChange={(e) => setManual({ ...manual, title: e.target.value })} placeholder="Judul (opsional)" className="h-8 text-sm" />
            <Input value={manual.url} onChange={(e) => setManual({ ...manual, url: e.target.value })} placeholder="Link file langsung" className="h-8 font-mono text-xs" data-testid="input-manual-url" />
            <Button size="sm" variant="secondary" onClick={addManual} disabled={!manual.url} data-testid="button-add-manual"><Plus /> Tambah</Button>
          </div>
        </div>
      )}
      {footer && <div className="border-t border-border p-3">{footer}</div>}
    </div>
  );
}

/* ===================== MAL preview card ===================== */
function MalPreview({ m }: { m: MalAnime & { via?: string } }) {
  return (
    <div className="flex gap-4 rounded-xl border border-border bg-card p-4" data-testid="card-mal-preview">
      <img src={m.imageUrl || ""} alt="" className="aspect-[2/3] w-24 flex-none rounded-lg object-cover bg-muted sm:w-28" />
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold leading-snug">{m.title}</h3>
        {m.titleEnglish && <p className="text-sm text-muted-foreground">{m.titleEnglish}</p>}
        <p className="mt-2 text-sm text-muted-foreground">{[m.type, m.episodes ? `${m.episodes} eps` : null, seasonLabel(m.season, m.year), m.studios.join(", ")].filter(Boolean).join(" · ")}</p>
        <div className="mt-2 flex flex-wrap gap-1">{m.genres.map((g) => <span key={g} className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">{g}</span>)}</div>
        {m.synopsis && <p className="mt-3 line-clamp-3 text-sm text-foreground/80">{m.synopsis}</p>}
        <p className="mt-2 text-[11px] text-muted-foreground">
          MAL #{m.malId} · skor {m.score ?? "—"} · {Object.keys(m.episodeTitles || {}).length} judul episode · via {m.via === "jikan" ? "Jikan API" : m.via === "cache" ? "cache" : "MyAnimeList"}
        </p>
      </div>
    </div>
  );
}

/* ===================== Add anime ===================== */
export function AdminAdd() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [input, setInput] = useState("");
  const [mal, setMal] = useState<(MalAnime & { via?: string }) | null>(null);
  const [existing, setExisting] = useState(false);
  const [hits, setHits] = useState<MalHit[] | null>(null);
  const [published, setPublished] = useState(true);
  const [featured, setFeatured] = useState(false);
  const [drafts, setDrafts] = useState<SourceInput[]>([]);
  const { data: catalog } = useQuery<{ items: { malId: number }[] }>({ queryKey: ["/api/admin/anime", { limit: 200 }] });
  const have = useMemo(() => new Set(catalog?.items.map((a) => a.malId) || []), [catalog]);

  const resolve = useMutation({
    mutationFn: async (v: string) => {
      const looksLikeLink = /myanimelist\.net\/anime\/\d+|^\d+$/.test(v.trim());
      if (!looksLikeLink) {
        setMal(null);
        setHits(await searchMal(v.trim(), have));
        return null;
      }
      setHits(null);
      return resolveMal(v);
    },
    onSuccess: (m) => {
      if (!m) return;
      setMal(m);
      setExisting(have.has(m.malId));
    },
    onError: (e: any) => toast({ title: "Gagal mengambil data", description: e.message, variant: "destructive" }),
  });
  const save = useMutation({
    mutationFn: () => api("POST", "/api/admin/anime", { mal, published, featured, sources: drafts }),
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast({ title: existing ? "Data anime diperbarui" : "Anime ditambahkan", description: mal!.title });
      navigate(`/admin/anime/${mal!.malId}`);
    },
    onError: (e: any) => toast({ title: "Gagal menyimpan", description: e.message, variant: "destructive" }),
  });
  const hint = (mal?.titleEnglish && mal.title.length > 30 ? mal.title.split(/[:\s]/)[0] : mal?.title.split(/[:]/)[0]) || "";

  return (
    <>
      <PageHead title="Tambah anime" sub="Tempel link MyAnimeList (atau ketik judul), data akan terisi otomatis dari Jikan API." />
      <div className="max-w-3xl space-y-6">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (input.trim()) resolve.mutate(input); }}>
          <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="https://myanimelist.net/anime/41457/86  atau  judul anime" className="h-10 flex-1" autoFocus data-testid="input-mal-url" />
          <Button type="submit" className="h-10" disabled={resolve.isPending || !input.trim()} data-testid="button-mal-fetch">
            {resolve.isPending ? <Loader2 className="animate-spin" /> : <Search />} Ambil data
          </Button>
        </form>

        {hits && (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            {hits.length === 0 && <p className="p-4 text-sm text-muted-foreground">Tidak ada hasil di MyAnimeList.</p>}
            {hits.map((h) => (
              <button key={h.malId} onClick={() => { setInput(`https://myanimelist.net/anime/${h.malId}`); resolve.mutate(String(h.malId)); }}
                className="flex w-full items-center gap-3 border-b border-border px-3 py-2 text-left last:border-0 hover:bg-accent" data-testid={`button-mal-hit-${h.malId}`}>
                <img src={h.imageUrl || ""} alt="" className="h-14 w-10 flex-none rounded object-cover bg-muted" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{h.title}</div>
                  <div className="text-xs text-muted-foreground">{[h.type, h.year, h.score ? `★ ${h.score}` : null, `MAL #${h.malId}`].filter(Boolean).join(" · ")}</div>
                </div>
                {(h.inCatalog || have.has(h.malId)) && <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">Sudah ada</span>}
              </button>
            ))}
          </div>
        )}

        {mal && (
          <>
            {existing && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
                <span>Anime ini sudah ada di katalog. Menyimpan akan memperbarui datanya dan menambah sumber baru.</span>
                <Button asChild size="sm" variant="outline"><Link href={`/admin/anime/${mal.malId}`}>Buka editor</Link></Button>
              </div>
            )}
            <MalPreview m={mal} />
            <div className="flex flex-wrap gap-6 rounded-xl border border-border bg-card px-4 py-3">
              <label className="flex items-center gap-2 text-sm"><Switch checked={published} onCheckedChange={setPublished} data-testid="switch-new-published" /> Tampilkan di situs</label>
              <label className="flex items-center gap-2 text-sm"><Switch checked={featured} onCheckedChange={setFeatured} data-testid="switch-new-featured" /> Jadikan pilihan (hero beranda)</label>
            </div>

            <div>
              <h2 className="mb-1 text-sm font-semibold">Link download</h2>
              <p className="mb-3 text-xs text-muted-foreground">Pilih folder dari index Google Drive. Semua file video di dalamnya otomatis jadi daftar episode (S01E01, S01E02, …). Folder yang berisi beberapa season/part akan dibuat jadi beberapa sumber.</p>
              <IndexBrowser key={mal.malId} hint={hint} onPick={(d) => setDrafts((prev) => [...prev, ...d])} />
            </div>

            {drafts.map((d, i) => (
              <SourceEditor key={i} value={d} episodeTitles={mal.episodeTitles}
                onChange={(v) => setDrafts(drafts.map((x, j) => (j === i ? v : x)))}
                onRemove={() => setDrafts(drafts.filter((_, j) => j !== i))} />
            ))}

            <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-xl border border-border bg-popover/95 px-4 py-3 shadow-xl backdrop-blur">
              <span className="text-sm text-muted-foreground">{drafts.length ? `${drafts.length} sumber · ${drafts.reduce((s, d) => s + d.episodes.length, 0)} file` : "Belum ada link — bisa ditambah nanti."}</span>
              <Button onClick={() => save.mutate()} disabled={save.isPending} data-testid="button-save-anime">
                {save.isPending ? <Loader2 className="animate-spin" /> : <Save />} Simpan anime
              </Button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

/* ===================== Edit anime ===================== */
function ExistingSource({ s, anime }: { s: SourceWithEpisodes; anime: AnimeDetail }) {
  const { toast } = useToast();
  const toInput = (x: SourceWithEpisodes): SourceInput => ({
    label: x.label, folderUrl: x.folderUrl, quality: x.quality, resolution: x.resolution,
    episodes: x.episodes.map((e) => ({ code: e.code, number: e.number, title: e.title, fileName: e.fileName, url: e.url, size: e.size })),
  });
  const [v, setV] = useState<SourceInput>(toInput(s));
  useEffect(() => setV(toInput(s)), [s]);
  const dirty = JSON.stringify(v) !== JSON.stringify(toInput(s));
  const invalidate = () => { queryClient.invalidateQueries(); };
  const save = useMutation({
    mutationFn: () => api("PATCH", `/api/admin/sources/${s.id}`, v),
    onSuccess: () => { invalidate(); toast({ title: "Sumber disimpan" }); },
    onError: (e: any) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });
  const resync = useMutation({
    mutationFn: async () => {
      const r = await listFolder(s.folderUrl!);
      const eps = entriesToEpisodes(r.entries);
      // pertahankan judul yang sudah diedit manual
      const old = new Map(v.episodes.map((e) => [e.url, e]));
      const merged = eps.map((e) => ({ ...e, code: old.get(e.url)?.code || e.code, title: old.get(e.url)?.title ?? e.title }));
      await api("PATCH", `/api/admin/sources/${s.id}`, { episodes: merged });
      return { before: v.episodes.length, after: merged.length };
    },
    onSuccess: (r) => { invalidate(); toast({ title: "Sinkron selesai", description: `${r.before} → ${r.after} file` }); },
    onError: (e: any) => toast({ title: "Gagal sinkron", description: e.message, variant: "destructive" }),
  });
  const del = useMutation({
    mutationFn: () => api("DELETE", `/api/admin/sources/${s.id}`),
    onSuccess: () => { invalidate(); toast({ title: "Sumber dihapus" }); },
  });
  return (
    <SourceEditor
      value={v}
      onChange={setV}
      episodeTitles={anime.episodeTitles}
      footer={
        <div className="flex flex-wrap items-center gap-2">
          {s.folderUrl && (
            <Button size="sm" variant="outline" onClick={() => resync.mutate()} disabled={resync.isPending} title="Baca ulang folder index (misal ada episode baru)" data-testid={`button-resync-${s.id}`}>
              {resync.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Sinkron ulang folder
            </Button>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild><Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive"><Trash2 /> Hapus sumber</Button></AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader><AlertDialogTitle>Hapus sumber “{s.label}”?</AlertDialogTitle><AlertDialogDescription>{s.episodes.length} link episode akan dihapus dari situs.</AlertDialogDescription></AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><AlertDialogAction onClick={() => del.mutate()} className="bg-destructive text-destructive-foreground">Hapus</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <div className="ml-auto flex items-center gap-2">
            {dirty && <span className="text-xs text-amber-500">Belum disimpan</span>}
            <Button size="sm" onClick={() => save.mutate()} disabled={!dirty || save.isPending} data-testid={`button-save-source-${s.id}`}>{save.isPending ? <Loader2 className="animate-spin" /> : <Save />} Simpan</Button>
          </div>
        </div>
      }
    />
  );
}

export function AdminEdit({ params }: { params: { malId: string } }) {
  const malId = Number(params.malId);
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { data: a, isLoading } = useQuery<AnimeDetail>({ queryKey: ["/api/admin/anime", malId] });
  const [showBrowser, setShowBrowser] = useState(false);
  const [info, setInfo] = useState({ title: "", titleEnglish: "", synopsis: "", imageUrl: "" });
  useEffect(() => { if (a) setInfo({ title: a.title, titleEnglish: a.titleEnglish || "", synopsis: a.synopsis || "", imageUrl: a.imageUrl || "" }); }, [a?.id, a?.updatedAt]);
  const inv = () => queryClient.invalidateQueries();
  const patch = useMutation({
    mutationFn: (p: any) => api("PATCH", `/api/admin/anime/${a!.id}`, p),
    onSuccess: () => { inv(); toast({ title: "Tersimpan" }); },
    onError: (e: any) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });
  const refresh = useMutation({
    mutationFn: async () => {
      let mal: MalAnime | undefined;
      try { mal = await resolveMal(String(malId)); } catch {}
      return api("POST", `/api/admin/anime/${a!.id}/refresh`, mal ? { mal } : {});
    },
    onSuccess: () => { inv(); toast({ title: "Data MAL diperbarui", description: "Skor, peringkat, dan info lain sudah terbaru." }); },
    onError: (e: any) => toast({ title: "Gagal refresh", description: e.message, variant: "destructive" }),
  });
  const addSources = useMutation({
    mutationFn: async (drafts: SourceInput[]) => { for (const d of drafts) await api("POST", `/api/admin/anime/${a!.id}/sources`, d); return drafts.length; },
    onSuccess: (n) => { inv(); setShowBrowser(false); toast({ title: `${n} sumber ditambahkan` }); },
    onError: (e: any) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });
  const del = useMutation({
    mutationFn: () => api("DELETE", `/api/admin/anime/${a!.id}`),
    onSuccess: () => { inv(); navigate("/admin/anime"); toast({ title: "Anime dihapus" }); },
  });

  if (isLoading) return <div className="h-60 animate-pulse rounded-xl bg-card" />;
  if (!a) return <EmptyState title="Anime tidak ditemukan" action={<Button asChild variant="outline"><Link href="/admin/anime">Kembali</Link></Button>} />;
  const total = a.sources.reduce((s, x) => s + x.episodes.length, 0);

  return (
    <>
      <Link href="/admin/anime" className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> Semua anime</Link>
      <div className="mb-6 flex flex-wrap items-start gap-4">
        <img src={a.imageUrl || ""} alt="" className="aspect-[2/3] w-16 flex-none rounded-lg object-cover bg-muted" />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold leading-tight tracking-tight" data-testid="text-edit-title">{a.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{[a.type, seasonLabel(a.season, a.year), a.studios.join(", "), `${total} file`].filter(Boolean).join(" · ")}</p>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm"><Switch checked={a.published} onCheckedChange={(v) => patch.mutate({ published: v })} data-testid="switch-edit-published" /> Tampil</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={a.featured} onCheckedChange={(v) => patch.mutate({ featured: v })} data-testid="switch-edit-featured" /> Pilihan</label>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild><a href={`#/anime/${a.malId}`}><ExternalLink /> Lihat</a></Button>
          <Button variant="outline" onClick={() => refresh.mutate()} disabled={refresh.isPending} data-testid="button-refresh-mal">{refresh.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Refresh MAL</Button>
        </div>
      </div>

      <Tabs defaultValue="links">
        <TabsList>
          <TabsTrigger value="links" data-testid="tab-links">Link download ({a.sources.length})</TabsTrigger>
          <TabsTrigger value="info" data-testid="tab-info">Info</TabsTrigger>
        </TabsList>
        <TabsContent value="links" className="mt-5 max-w-4xl space-y-4">
          {a.sources.map((s) => <ExistingSource key={s.id} s={s} anime={a} />)}
          {!a.sources.length && !showBrowser && <EmptyState title="Belum ada link download" body="Tambahkan dari folder index Google Drive." />}
          {showBrowser ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Pilih folder</h2><Button size="sm" variant="ghost" onClick={() => setShowBrowser(false)}><X /> Tutup</Button></div>
              {addSources.isPending && <p className="text-sm text-muted-foreground"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Menyimpan…</p>}
              <IndexBrowser hint={a.title.split(/[:]/)[0]} onPick={(d) => addSources.mutate(d)} />
            </div>
          ) : (
            <Button variant="outline" onClick={() => setShowBrowser(true)} data-testid="button-add-source"><Plus /> Tambah sumber dari index</Button>
          )}
        </TabsContent>
        <TabsContent value="info" className="mt-5 max-w-2xl">
          <div className="space-y-4 rounded-xl border border-border bg-card p-5">
            <p className="text-xs text-muted-foreground">Data otomatis dari MyAnimeList. Ubah di sini kalau mau menimpa. Tombol “Refresh MAL” akan mengembalikan ke data MAL.</p>
            <div className="space-y-1.5"><Label>Judul</Label><Input value={info.title} onChange={(e) => setInfo({ ...info, title: e.target.value })} data-testid="input-edit-title" /></div>
            <div className="space-y-1.5"><Label>Judul Inggris</Label><Input value={info.titleEnglish} onChange={(e) => setInfo({ ...info, titleEnglish: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Link poster</Label><Input value={info.imageUrl} onChange={(e) => setInfo({ ...info, imageUrl: e.target.value })} className="font-mono text-xs" /></div>
            <div className="space-y-1.5"><Label>Sinopsis</Label><Textarea value={info.synopsis} onChange={(e) => setInfo({ ...info, synopsis: e.target.value })} rows={8} /></div>
            <div className="flex justify-between">
              <AlertDialog>
                <AlertDialogTrigger asChild><Button variant="ghost" className="text-muted-foreground hover:text-destructive" data-testid="button-delete-anime"><Trash2 /> Hapus anime</Button></AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader><AlertDialogTitle>Hapus “{a.title}”?</AlertDialogTitle><AlertDialogDescription>Semua data dan link download anime ini akan dihapus.</AlertDialogDescription></AlertDialogHeader>
                  <AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><AlertDialogAction onClick={() => del.mutate()} className="bg-destructive text-destructive-foreground">Hapus</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button onClick={() => patch.mutate({ title: info.title, titleEnglish: info.titleEnglish || null, synopsis: info.synopsis || null, imageUrl: info.imageUrl || null })} disabled={patch.isPending} data-testid="button-save-info"><Save /> Simpan info</Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
