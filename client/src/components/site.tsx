import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Search, Moon, Sun, Star, X, Menu, ChevronLeft, ChevronRight } from "lucide-react";
import { useApp } from "@/lib/store";
import { seasonLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { QUALITY_LABEL, AIRING_LABEL, airingKey } from "@shared/utils";
import type { AnimeCard as Card } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";

/* ---------------- Wordmark ---------------- */
export function Wordmark({ className }: { className?: string }) {
  const { site } = useApp();
  return (
    <span className={cn("inline-flex items-baseline gap-[3px] font-semibold tracking-tight", className)} data-testid="text-sitename">
      {site.siteName}
      <span className="inline-block h-[6px] w-[6px] rounded-full bg-primary" aria-hidden />
    </span>
  );
}

/* ---------------- Quick search ---------------- */
function useDebounced<T>(v: T, ms = 220) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

export function QuickSearch({ autoFocus, onDone }: { autoFocus?: boolean; onDone?: () => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const dq = useDebounced(q.trim());
  const [, navigate] = useLocation();
  const { resetFilters } = useApp();
  const ref = useRef<HTMLDivElement>(null);
  const { data, isFetching } = useQuery<{ items: Card[]; total: number }>({
    queryKey: ["/api/anime", { q: dq, limit: 6, sort: "popularity" }],
    enabled: dq.length >= 2,
  });
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const submit = () => {
    resetFilters({ q: q.trim() });
    setOpen(false);
    onDone?.();
    navigate("/browse");
  };
  return (
    <div ref={ref} className="relative w-full">
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          placeholder="Cari judul anime…"
          aria-label="Cari anime"
          className="h-9 w-full rounded-full border border-border bg-card pl-9 pr-8 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/60"
          data-testid="input-quick-search"
        />
        {q && (
          <button type="button" onClick={() => setQ("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Hapus">
            <X className="h-4 w-4" />
          </button>
        )}
      </form>
      {open && dq.length >= 2 && (
        <div className="fade-in absolute left-0 right-0 top-11 z-50 overflow-hidden rounded-xl border border-popover-border bg-popover shadow-xl">
          {data?.items.length ? (
            <>
              {data.items.map((a) => (
                <Link
                  key={a.id}
                  href={`/anime/${a.malId}`}
                  onClick={() => { setOpen(false); setQ(""); onDone?.(); }}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-accent"
                  data-testid={`link-search-result-${a.malId}`}
                >
                  <img src={a.imageUrl || ""} alt="" className="h-12 w-8 flex-none rounded object-cover bg-muted" loading="lazy" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{a.title}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {[a.type, seasonLabel(a.season, a.year), a.episodeCount ? `${a.episodeCount} file` : null].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                </Link>
              ))}
              <button onClick={submit} className="w-full border-t border-border px-3 py-2 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
                Lihat semua hasil untuk “{q.trim()}” ({data.total})
              </button>
            </>
          ) : (
            <div className="px-3 py-4 text-sm text-muted-foreground">{isFetching ? "Mencari…" : "Tidak ada judul yang cocok."}</div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------- Header ---------------- */
const NAV = [
  { href: "/", label: "Beranda" },
  { href: "/browse", label: "Jelajah" },
  { href: "/season", label: "Season" },
  { href: "/genres", label: "Genre & Studio" },
];

export function SiteHeader() {
  const [loc] = useLocation();
  const { theme, toggleTheme, resetFilters } = useApp();
  const [menu, setMenu] = useState(false);
  const isActive = (h: string) => (h === "/" ? loc === "/" : loc.startsWith(h));
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="text-lg" data-testid="link-home">
          <Wordmark />
        </Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Utama">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => n.href === "/browse" && resetFilters()}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm transition-colors",
                isActive(n.href) ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
              data-testid={`link-nav-${n.label.toLowerCase().split(" ")[0]}`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto hidden w-full max-w-xs sm:block">
          <QuickSearch />
        </div>
        <div className="ml-auto flex items-center gap-1 sm:ml-0">
          <button onClick={toggleTheme} className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Ganti tema" data-testid="button-theme">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <Sheet open={menu} onOpenChange={setMenu}>
            <SheetTrigger asChild>
              <button className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground md:hidden" aria-label="Menu" data-testid="button-menu">
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[85vw] max-w-sm">
              <SheetTitle className="text-lg"><Wordmark /></SheetTitle>
              <div className="mt-5"><QuickSearch onDone={() => setMenu(false)} /></div>
              <nav className="mt-5 flex flex-col">
                {NAV.map((n) => (
                  <Link key={n.href} href={n.href} onClick={() => { if (n.href === "/browse") resetFilters(); setMenu(false); }}
                    className={cn("rounded-lg px-3 py-2.5 text-sm", isActive(n.href) ? "bg-accent font-medium" : "text-muted-foreground")}>
                    {n.label}
                  </Link>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

export function Announcement() {
  const { site } = useApp();
  const [hide, setHide] = useState(false);
  if (!site.announcement || hide) return null;
  return (
    <div className="border-b border-border bg-primary/10 text-sm" data-testid="text-announcement">
      <div className="mx-auto flex max-w-6xl items-start gap-3 px-4 py-2 sm:px-6">
        <p className="flex-1 text-foreground/90">{site.announcement}</p>
        <button onClick={() => setHide(true)} aria-label="Tutup" className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

export function SiteFooter() {
  const { site } = useApp();
  return (
    <footer className="mt-20 border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-3"><Wordmark className="text-sm text-foreground" /> <span>{site.tagline}</span></div>
        <div>
          Data anime dari{" "}
          <a href="https://myanimelist.net" target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">MyAnimeList</a>{" "}
          via{" "}
          <a href="https://jikan.moe" target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">Jikan API</a>
        </div>
      </div>
    </footer>
  );
}

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <Announcement />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}

/* ---------------- Cards & grid ---------------- */
export function ScoreBadge({ score, className }: { score?: number | null; className?: string }) {
  if (!score) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white backdrop-blur tabular", className)}>
      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
      {score.toFixed(2)}
    </span>
  );
}

const Q_TONE: Record<string, string> = {
  BD: "bg-sky-500/12 text-sky-700 ring-sky-500/30 dark:text-sky-300",
  WEB: "bg-violet-500/12 text-violet-700 ring-violet-500/30 dark:text-violet-300",
  DVD: "bg-amber-500/12 text-amber-700 ring-amber-500/30 dark:text-amber-300",
  HDTV: "bg-zinc-500/12 text-zinc-700 ring-zinc-500/30 dark:text-zinc-300",
};
const Q_DOT: Record<string, string> = { BD: "bg-sky-400", WEB: "bg-violet-400", DVD: "bg-amber-400", HDTV: "bg-zinc-400" };

/** Label kualitas: Blu-ray / WEB (+ resolusi) */
export function QualityBadge({ q, res, overlay, className }: { q?: string | null; res?: string | null; overlay?: boolean; className?: string }) {
  if (!q && !res) return null;
  const text = [q ? QUALITY_LABEL[q] || q : null, res].filter(Boolean).join(" ");
  if (overlay)
    return (
      <span className={cn("inline-flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur", className)}>
        <span className={cn("h-1.5 w-1.5 rounded-full", Q_DOT[q || ""] || "bg-white/70")} />{text}
      </span>
    );
  return (
    <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset", Q_TONE[q || ""] || "bg-muted text-muted-foreground ring-border", className)} data-testid={`badge-quality-${q || res}`}>
      {text}
    </span>
  );
}

/** Label status tayang dari MAL: Ongoing / Tamat / Segera */
export function AiringBadge({ status, overlay, className }: { status?: string | null; overlay?: boolean; className?: string }) {
  const k = airingKey(status);
  if (!k) return null;
  const dot = k === "ongoing" ? "bg-emerald-400" : k === "upcoming" ? "bg-amber-400" : "bg-zinc-400";
  if (overlay)
    return (
      <span className={cn("inline-flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur", className)} data-testid={`badge-airing-${k}`}>
        <span className={cn("relative h-1.5 w-1.5 rounded-full", dot)}>
          {k === "ongoing" && <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/70 motion-reduce:hidden" />}
        </span>
        {AIRING_LABEL[k]}
      </span>
    );
  const tone =
    k === "ongoing" ? "bg-emerald-500/12 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300"
    : k === "upcoming" ? "bg-amber-500/12 text-amber-700 ring-amber-500/30 dark:text-amber-300"
    : "bg-muted text-muted-foreground ring-border";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset", tone, className)} data-testid={`badge-airing-${k}`}>
      <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />{AIRING_LABEL[k]}
    </span>
  );
}

/** Poster versi kecil MAL untuk kartu (…/117507l.jpg -> …/117507.jpg) */
export const thumb = (u?: string | null) => (u ? u.replace(/(\/\d+)l\.(jpg|webp)(\?.*)?$/, "$1.$2") : "");

const prefetched = new Set<number>();
function prefetchAnime(malId: number) {
  if (prefetched.has(malId)) return;
  prefetched.add(malId);
  queryClient.prefetchQuery({ queryKey: ["/api/anime", malId], staleTime: 60_000 });
}

export function AnimeCard({ a }: { a: Card }) {
  return (
    <Link href={`/anime/${a.malId}`} onMouseEnter={() => prefetchAnime(a.malId)} onTouchStart={() => prefetchAnime(a.malId)} onFocus={() => prefetchAnime(a.malId)} className="group block min-w-0" data-testid={`card-anime-${a.malId}`}>
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-muted">
        {a.imageUrl && (
          <img
            src={thumb(a.imageUrl)}
            alt={a.title}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        )}
        <ScoreBadge score={a.score} className="absolute left-2 top-2" />
        <div className="absolute inset-x-2 bottom-2 flex flex-wrap items-end justify-between gap-1">
          <div className="flex gap-1">{a.qualities?.map((q) => <QualityBadge key={q} q={q} overlay />)}</div>
          <AiringBadge status={a.status} overlay />
        </div>
        {a.type && (
          <span className="absolute right-2 top-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-white/90 backdrop-blur">
            {a.type}
          </span>
        )}
      </div>
      <div className="mt-2 px-0.5">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug group-hover:text-primary">{a.title}</h3>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {[seasonLabel(a.season, a.year), a.episodeCount ? (airingKey(a.status) === "ongoing" ? `${a.episodeCount}/${a.episodes ?? "?"} eps` : `${a.episodeCount} file`) : null].filter(Boolean).join(" · ")}
        </p>
      </div>
    </Link>
  );
}

export function CardGrid({ items, loading, count = 12, narrow }: { items?: Card[]; loading?: boolean; count?: number; narrow?: boolean }) {
  const cols = narrow ? "grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5" : "grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6";
  if (loading)
    return (
      <div className={cols}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i}>
            <div className="aspect-[2/3] animate-pulse rounded-lg bg-muted" />
            <div className="mt-2 h-3.5 w-4/5 animate-pulse rounded bg-muted" />
            <div className="mt-1.5 h-3 w-1/2 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    );
  return (
    <div className={cols}>
      {items?.map((a) => <AnimeCard key={a.id} a={a} />)}
    </div>
  );
}

/** Mobile: geser horizontal (tidak memanjang ke bawah). Desktop: grid 6 kolom. */
export function Rail({ items, loading }: { items?: Card[]; loading?: boolean }) {
  const list = loading ? Array.from({ length: 6 }).map(() => null) : items || [];
  return (
    <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 scrollbar-none sm:-mx-6 sm:px-6 md:mx-0 md:grid md:grid-cols-4 md:gap-x-4 md:gap-y-6 md:overflow-visible md:px-0 lg:grid-cols-6">
      {list.map((a, i) => (
        <div key={a?.id ?? i} className={cn("w-[38vw] max-w-[170px] flex-none snap-start md:w-auto md:max-w-none", i >= 6 && "md:hidden")}>
          {a ? <AnimeCard a={a} /> : <div className="aspect-[2/3] animate-pulse rounded-lg bg-muted" />}
        </div>
      ))}
    </div>
  );
}

export function Row({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-12">
      <div className="mb-4 flex items-end justify-between gap-4">
        <h2 className="text-base font-semibold tracking-tight sm:text-lg">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/* ---------------- Pager (« 1 2 3 … 47 ») ---------------- */
export function pageWindow(page: number, pages: number, width = 7): (number | "…")[] {
  if (pages <= width + 2) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: (number | "…")[] = [];
  const half = Math.floor((width - 2) / 2);
  let start = Math.max(2, page - half);
  let end = Math.min(pages - 1, page + half);
  if (page <= half + 2) { start = 2; end = width - 1; }
  if (page >= pages - half - 1) { start = pages - width + 2; end = pages - 1; }
  out.push(1);
  if (start > 2) out.push("…");
  for (let i = start; i <= end; i++) out.push(i);
  if (end < pages - 1) out.push("…");
  out.push(pages);
  return out;
}

export function Pager({ page, pages, onChange, testid = "pager" }: { page: number; pages: number; onChange: (p: number) => void; testid?: string }) {
  const items = useMemo(() => pageWindow(page, pages, typeof window !== "undefined" && window.innerWidth < 420 ? 5 : 7), [page, pages]);
  if (pages <= 1) return null;
  const btn = "grid h-9 min-w-9 place-items-center rounded-md border border-border bg-card px-2 text-sm tabular transition-colors";
  return (
    <nav className="flex flex-wrap items-center justify-center gap-1.5" aria-label="Halaman" data-testid={testid}>
      <button className={cn(btn, "text-muted-foreground hover:text-foreground disabled:opacity-40")} disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Sebelumnya" data-testid={`${testid}-prev`}>
        <ChevronLeft className="h-4 w-4" />
      </button>
      {items.map((it, i) =>
        it === "…" ? (
          <span key={`e${i}`} className="grid h-9 min-w-9 place-items-center text-sm text-muted-foreground">…</span>
        ) : (
          <button
            key={it}
            onClick={() => onChange(it)}
            aria-current={it === page ? "page" : undefined}
            className={cn(btn, it === page ? "border-primary bg-primary font-medium text-primary-foreground" : "hover:border-foreground/30")}
            data-testid={`${testid}-page-${it}`}
          >
            {it}
          </button>
        ),
      )}
      <button className={cn(btn, "text-muted-foreground hover:text-foreground disabled:opacity-40")} disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Berikutnya" data-testid={`${testid}-next`}>
        <ChevronRight className="h-4 w-4" />
      </button>
    </nav>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border px-6 py-14 text-center">
      <p className="font-medium">{title}</p>
      {body && <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Chip({ active, children, onClick, testid }: { active?: boolean; children: ReactNode; onClick?: () => void; testid?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs transition-colors",
        active ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
      )}
      data-testid={testid}
    >
      {children}
    </button>
  );
}
