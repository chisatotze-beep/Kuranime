import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Check, ChevronLeft, ChevronRight, ChevronsUpDown, Minus, Search, SlidersHorizontal, X } from "lucide-react";
import { CardGrid, Chip, EmptyState, Pager, PublicShell } from "@/components/site";
import { useApp, EMPTY_FILTERS, type Filters } from "@/lib/store";
import { seasonLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { SEASONS, SEASON_LABEL, QUALITY_LABEL, AIRING_LABEL, AIRING_STATUS } from "@shared/utils";
import type { AnimeCard, Facets } from "@shared/schema";

const SORTS = [
  { v: "added", l: "Baru ditambahkan" },
  { v: "score", l: "Skor tertinggi" },
  { v: "popularity", l: "Paling populer" },
  { v: "newest", l: "Tayang terbaru" },
  { v: "oldest", l: "Tayang terlama" },
  { v: "title", l: "Judul A–Z" },
];
const ANY = "__any";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

function SimpleSelect({ value, onChange, options, placeholder, testid }: { value: string; onChange: (v: string) => void; options: { v: string; l: string }[]; placeholder: string; testid: string }) {
  return (
    <Select value={value || ANY} onValueChange={(v) => onChange(v === ANY ? "" : v)}>
      <SelectTrigger className="h-9 bg-card" data-testid={testid}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>{placeholder}</SelectItem>
        {options.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function StudioPicker({ value, onChange, studios }: { value: string; onChange: (v: string) => void; studios: Facets["studios"] }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-card px-3 text-sm" data-testid="select-studio">
          <span className={cn("truncate", !value && "text-muted-foreground")}>{value || "Semua studio"}</span>
          <ChevronsUpDown className="h-4 w-4 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-56 p-0" align="start">
        <Command>
          <CommandInput placeholder="Cari studio…" />
          <CommandList>
            <CommandEmpty>Studio tidak ditemukan.</CommandEmpty>
            <CommandGroup>
              <CommandItem onSelect={() => { onChange(""); setOpen(false); }}>Semua studio</CommandItem>
              {studios.map((s) => (
                <CommandItem key={s.name} value={s.name} onSelect={() => { onChange(s.name); setOpen(false); }}>
                  <Check className={cn("h-4 w-4", value === s.name ? "opacity-100" : "opacity-0")} />
                  <span className="flex-1 truncate">{s.name}</span>
                  <span className="text-xs text-muted-foreground tabular">{s.count}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function FilterPanel({ facets, f, set }: { facets?: Facets; f: Filters; set: (p: Partial<Filters>) => void }) {
  const [q, setQ] = useState(f.q);
  useEffect(() => setQ(f.q), [f.q]);
  useEffect(() => {
    const t = setTimeout(() => q !== f.q && set({ q }), 250);
    return () => clearTimeout(t);
  }, [q]);
  const toggleGenre = (g: string) => {
    // klik: sertakan → kecualikan → netral (seperti MAL)
    if (f.genres.includes(g)) set({ genres: f.genres.filter((x) => x !== g), exclude: [...f.exclude, g] });
    else if (f.exclude.includes(g)) set({ exclude: f.exclude.filter((x) => x !== g) });
    else set({ genres: [...f.genres, g] });
  };
  return (
    <div className="space-y-6">
      <Field label="Judul">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari judul, judul Inggris…" className="h-9 w-full rounded-md border border-input bg-card pl-9 pr-3 text-sm outline-none focus:border-primary/60" data-testid="input-filter-q" />
        </div>
      </Field>
      <Field label="Urutkan">
        <SimpleSelect value={f.sort} onChange={(v) => set({ sort: v || "added" })} options={SORTS.map((s) => ({ v: s.v, l: s.l }))} placeholder="Baru ditambahkan" testid="select-sort" />
      </Field>
      <Field label="Season">
        <div className="grid grid-cols-4 gap-1.5">
          {SEASONS.map((s) => (
            <button key={s} onClick={() => set({ season: f.season === s ? "" : s })}
              className={cn("rounded-md border py-1.5 text-xs", f.season === s ? "border-primary bg-primary/15" : "border-border text-muted-foreground hover:text-foreground")}
              data-testid={`button-season-${s}`}>
              {SEASON_LABEL[s]}
            </button>
          ))}
        </div>
        <div className="mt-2">
          <SimpleSelect value={f.year} onChange={(v) => set({ year: v })} options={(facets?.years || []).map((y) => ({ v: String(y), l: String(y) }))} placeholder="Semua tahun" testid="select-year" />
        </div>
      </Field>
      <Field label="Studio">
        <StudioPicker value={f.studio} onChange={(v) => set({ studio: v })} studios={facets?.studios || []} />
      </Field>
      <Field label="Tipe">
        <div className="flex flex-wrap gap-1.5">
          {(facets?.types || []).map((t) => <Chip key={t} active={f.type === t} onClick={() => set({ type: f.type === t ? "" : t })} testid={`chip-type-${t}`}>{t}</Chip>)}
        </div>
      </Field>
      {(facets?.qualities?.length ?? 0) > 0 && (
        <Field label="Kualitas">
          <div className="flex flex-wrap gap-1.5">
            {facets!.qualities.map((q) => <Chip key={q} active={f.quality === q} onClick={() => set({ quality: f.quality === q ? "" : q })} testid={`chip-quality-${q}`}>{QUALITY_LABEL[q] || q}</Chip>)}
          </div>
        </Field>
      )}
      <Field label="Status tayang">
        <div className="flex flex-wrap gap-1.5">
          {(["ongoing", "finished", "upcoming"] as const).filter((k) => facets?.statuses.includes(AIRING_STATUS[k])).map((k) => (
            <Chip key={k} active={f.status === k} onClick={() => set({ status: f.status === k ? "" : k })} testid={`chip-status-${k}`}>{AIRING_LABEL[k]}</Chip>
          ))}
        </div>
      </Field>
      <Field label="Genre">
        <p className="-mt-1 mb-2 text-xs text-muted-foreground">Klik sekali untuk menyertakan, dua kali untuk mengecualikan.</p>
        <div className="flex flex-wrap gap-1.5">
          {(facets?.genres || []).map((g) => {
            const inc = f.genres.includes(g.name);
            const exc = f.exclude.includes(g.name);
            return (
              <button key={g.name} onClick={() => toggleGenre(g.name)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors",
                  inc && "border-primary bg-primary/15 text-foreground",
                  exc && "border-destructive/60 bg-destructive/10 text-destructive line-through",
                  !inc && !exc && "border-border text-muted-foreground hover:text-foreground",
                )}
                data-testid={`chip-genre-${g.name}`}>
                {inc && <Check className="h-3 w-3" />}{exc && <Minus className="h-3 w-3" />}
                {g.name}<span className="opacity-60 tabular">{g.count}</span>
              </button>
            );
          })}
        </div>
      </Field>
      <Field label="Rating usia">
        <SimpleSelect value={f.rating} onChange={(v) => set({ rating: v })} options={(facets?.ratings || []).map((s) => ({ v: s, l: s }))} placeholder="Semua rating" testid="select-rating" />
      </Field>
      <Field label="Sumber cerita">
        <SimpleSelect value={f.source} onChange={(v) => set({ source: v })} options={(facets?.sources || []).map((s) => ({ v: s, l: s }))} placeholder="Semua sumber" testid="select-source" />
      </Field>
    </div>
  );
}

function ActiveFilters({ f, set, reset }: { f: Filters; set: (p: Partial<Filters>) => void; reset: () => void }) {
  const chips: { k: string; l: string; clear: () => void }[] = [];
  if (f.q) chips.push({ k: "q", l: `“${f.q}”`, clear: () => set({ q: "" }) });
  if (f.season || f.year) chips.push({ k: "s", l: seasonLabel(f.season, f.year ? Number(f.year) : null), clear: () => set({ season: "", year: "" }) });
  if (f.studio) chips.push({ k: "st", l: f.studio, clear: () => set({ studio: "" }) });
  if (f.type) chips.push({ k: "t", l: f.type, clear: () => set({ type: "" }) });
  if (f.quality) chips.push({ k: "qual", l: QUALITY_LABEL[f.quality] || f.quality, clear: () => set({ quality: "" }) });
  if (f.status) chips.push({ k: "status", l: (AIRING_LABEL as any)[f.status] || f.status, clear: () => set({ status: "" }) });
  if (f.rating) chips.push({ k: "r", l: f.rating.split(" (")[0], clear: () => set({ rating: "" }) });
  if (f.source) chips.push({ k: "src", l: f.source, clear: () => set({ source: "" }) });
  f.genres.forEach((g) => chips.push({ k: "g" + g, l: g, clear: () => set({ genres: f.genres.filter((x) => x !== g) }) }));
  f.exclude.forEach((g) => chips.push({ k: "x" + g, l: `tanpa ${g}`, clear: () => set({ exclude: f.exclude.filter((x) => x !== g) }) }));
  if (!chips.length) return null;
  return (
    <div className="mb-5 flex flex-wrap items-center gap-1.5">
      {chips.map((c) => (
        <button key={c.k} onClick={c.clear} className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs hover:bg-accent/70" data-testid={`chip-active-${c.k}`}>
          {c.l} <X className="h-3 w-3" />
        </button>
      ))}
      <button onClick={reset} className="px-2 text-xs text-muted-foreground underline-offset-2 hover:underline" data-testid="button-reset-filters">Reset</button>
    </div>
  );
}

function useResults(f: Filters, limit = 24) {
  return useQuery<{ items: AnimeCard[]; total: number; page: number; pages: number }>({
    queryKey: ["/api/anime", { q: f.q, genres: f.genres, exclude: f.exclude, studio: f.studio, season: f.season, year: f.year, type: f.type, status: f.status, rating: f.rating, source: f.source, quality: f.quality, sort: f.sort, page: f.page, limit }],
    placeholderData: keepPreviousData,
  });
}

export default function Browse() {
  const { filters: f, setFilters, resetFilters } = useApp();
  const { data: facets } = useQuery<Facets>({ queryKey: ["/api/facets"] });
  const { data, isLoading, isFetching } = useResults(f);
  const [sheet, setSheet] = useState(false);
  const activeCount = [f.q, f.season, f.year, f.studio, f.type, f.status, f.rating, f.source, f.quality].filter(Boolean).length + f.genres.length + f.exclude.length;
  const changePage = (p: number) => { setFilters({ page: p }, true); window.scrollTo({ top: 0, behavior: "smooth" }); };

  return (
    <PublicShell>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Jelajah anime</h1>
            <p className="mt-1 text-sm text-muted-foreground" data-testid="text-result-count">
              {data ? `${data.total} judul` : "Memuat…"}{isFetching && data ? " · memperbarui…" : ""}
            </p>
          </div>
          <Sheet open={sheet} onOpenChange={setSheet}>
            <SheetTrigger asChild>
              <Button variant="outline" className="lg:hidden" data-testid="button-open-filters">
                <SlidersHorizontal /> Filter{activeCount ? ` (${activeCount})` : ""}
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[88vw] max-w-sm overflow-y-auto">
              <SheetTitle className="mb-5">Filter</SheetTitle>
              <FilterPanel facets={facets} f={f} set={setFilters} />
              <Button className="mt-6 w-full" onClick={() => setSheet(false)}>Tampilkan {data?.total ?? ""} judul</Button>
            </SheetContent>
          </Sheet>
        </div>
        <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
          <aside className="hidden lg:block">
            <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pb-6 pr-2 scrollbar-none">
              <FilterPanel facets={facets} f={f} set={setFilters} />
            </div>
          </aside>
          <div className="min-w-0">
            <ActiveFilters f={f} set={setFilters} reset={() => resetFilters({ sort: f.sort })} />
            {data && data.total === 0 ? (
              <EmptyState title="Tidak ada anime yang cocok" body="Coba kurangi filter atau ganti kata kunci." action={<Button variant="outline" onClick={() => resetFilters()}>Reset filter</Button>} />
            ) : (
              <div className={cn("transition-opacity", isFetching && !isLoading && "opacity-60")}>
                <CardGrid items={data?.items} loading={isLoading} count={12} narrow />
              </div>
            )}
            {data && <div className="mt-10"><Pager page={data.page} pages={data.pages} onChange={changePage} testid="pager-browse" /></div>}
          </div>
        </div>
      </div>
    </PublicShell>
  );
}

/* ---------------- Season page (seperti MAL Seasonal) ---------------- */
function currentSeason() {
  const d = new Date();
  const m = d.getMonth();
  return { season: SEASONS[Math.floor(m / 3)], year: d.getFullYear() };
}
export function SeasonPage() {
  const { data: facets } = useQuery<Facets>({ queryKey: ["/api/facets"] });
  const [sel, setSel] = useState<{ season: string; year: number } | null>(null);
  const [page, setPage] = useState(1);
  const [type, setType] = useState("");
  // default: season terbaru yang ada di katalog
  const { data: home } = useQuery<any>({ queryKey: ["/api/home"] });
  const s = sel || home?.currentSeason || currentSeason();
  const f: Filters = { ...EMPTY_FILTERS, season: s.season, year: String(s.year), type, sort: "score", page };
  const { data, isLoading } = useResults(f, 24);
  const shift = (d: number) => {
    let i = SEASONS.indexOf(s.season as any) + d;
    let y = s.year;
    if (i < 0) { i = 3; y--; }
    if (i > 3) { i = 0; y++; }
    setSel({ season: SEASONS[i], year: y });
    setPage(1);
  };
  const years = facets?.years || [];
  return (
    <PublicShell>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button onClick={() => shift(-1)} className="grid h-9 w-9 place-items-center rounded-full border border-border hover:bg-accent" aria-label="Season sebelumnya" data-testid="button-season-prev"><ChevronLeft className="h-4 w-4" /></button>
            <h1 className="min-w-[10rem] text-center text-xl font-semibold tracking-tight" data-testid="text-season-title">{seasonLabel(s.season, s.year)}</h1>
            <button onClick={() => shift(1)} className="grid h-9 w-9 place-items-center rounded-full border border-border hover:bg-accent" aria-label="Season berikutnya" data-testid="button-season-next"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {["", "TV", "Movie", "OVA", "ONA", "Special"].map((t) => (
              <Chip key={t || "all"} active={type === t} onClick={() => { setType(t); setPage(1); }} testid={`chip-season-type-${t || "all"}`}>{t || "Semua"}</Chip>
            ))}
          </div>
        </div>
        {years.length > 0 && (
          <div className="mt-5 flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {years.map((y) => (
              <div key={y} className="flex flex-none items-center gap-1 rounded-full border border-border p-0.5">
                <span className="px-2 text-xs text-muted-foreground tabular">{y}</span>
                {SEASONS.map((se) => (
                  <button key={se} onClick={() => { setSel({ season: se, year: y }); setPage(1); }}
                    className={cn("rounded-full px-2 py-0.5 text-xs", s.season === se && s.year === y ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                    {SEASON_LABEL[se]}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
        <div className="mt-8">
          {data && data.total === 0 ? (
            <EmptyState title={`Belum ada anime ${seasonLabel(s.season, s.year)}`} body="Pilih season lain atau jelajahi seluruh katalog." action={<Button asChild variant="outline"><Link href="/browse">Jelajah</Link></Button>} />
          ) : (
            <CardGrid items={data?.items} loading={isLoading} />
          )}
          {data && <div className="mt-10"><Pager page={data.page} pages={data.pages} onChange={setPage} testid="pager-season" /></div>}
        </div>
      </div>
    </PublicShell>
  );
}

/* ---------------- Genre & Studio index ---------------- */
export function GenresPage() {
  const { data: facets, isLoading } = useQuery<Facets>({ queryKey: ["/api/facets"] });
  const { resetFilters } = useApp();
  const [, navigate] = useLocation();
  const go = (p: Partial<Filters>) => { resetFilters(p); navigate("/browse"); };
  const List = ({ items, onPick, testid }: { items: { name: string; count: number }[]; onPick: (n: string) => void; testid: string }) => (
    <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((g) => (
        <button key={g.name} onClick={() => onPick(g.name)} className="flex items-center justify-between border-b border-border py-2.5 text-left text-sm hover:text-primary" data-testid={`link-${testid}-${g.name}`}>
          <span className="truncate">{g.name}</span>
          <span className="ml-3 text-xs text-muted-foreground tabular">{g.count}</span>
        </button>
      ))}
    </div>
  );
  return (
    <PublicShell>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="text-xl font-semibold tracking-tight">Genre</h1>
        <div className="mt-4">{isLoading ? <div className="h-40 animate-pulse rounded-lg bg-muted" /> : <List items={facets?.genres || []} onPick={(g) => go({ genres: [g] })} testid="genre" />}</div>
        <h2 className="mt-12 text-lg font-semibold tracking-tight">Studio</h2>
        <div className="mt-4">{isLoading ? <div className="h-24 animate-pulse rounded-lg bg-muted" /> : <List items={facets?.studios || []} onPick={(s) => go({ studio: s })} testid="studio" />}</div>
      </div>
    </PublicShell>
  );
}
