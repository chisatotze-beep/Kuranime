import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { CardGrid, PublicShell, Row, Rail, ScoreBadge, EmptyState, Pager, QualityBadge, AiringBadge } from "@/components/site";
import { keepPreviousData } from "@tanstack/react-query";
import { useApp } from "@/lib/store";
import { seasonLabel } from "@/lib/format";
import { Button } from "@/components/ui/button";
import type { AnimeCard } from "@shared/schema";

type HomeData = {
  featured: AnimeCard[];
  latest: AnimeCard[];
  top: AnimeCard[];
  season: AnimeCard[];
  ongoing: AnimeCard[];
  currentSeason: { season: string; year: number } | null;
  total: number;
};

function Hero({ items }: { items: AnimeCard[] }) {
  const [i, setI] = useState(0);
  const a = items[i];
  const { data: detail } = useQuery<any>({ queryKey: ["/api/anime", a?.malId], enabled: !!a });
  if (!a) return null;
  const go = (d: number) => setI((x) => (x + d + items.length) % items.length);
  return (
    <section className="relative overflow-hidden border-b border-border" data-testid="section-hero">
      <div className="absolute inset-0">
        {a.imageUrl && <img key={a.id} src={a.imageUrl} alt="" className="fade-in h-full w-full scale-110 object-cover opacity-30 blur-2xl" />}
        <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/70 to-background" />
      </div>
      <div className="relative mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:grid-cols-[180px_1fr] sm:gap-10 sm:px-6 sm:py-14 md:grid-cols-[220px_1fr]">
        <Link href={`/anime/${a.malId}`} className="relative mx-auto w-40 sm:mx-0 sm:w-full">
          <img key={a.id} src={a.imageUrl || ""} alt={a.title} fetchPriority="high" className="fade-in aspect-[2/3] w-full rounded-xl object-cover shadow-2xl ring-1 ring-white/10" />
          <ScoreBadge score={a.score} className="absolute left-2 top-2" />
        </Link>
        <div key={a.id} className="fade-in flex min-w-0 flex-col justify-center">
          <div className="flex items-center gap-2"><p className="text-xs font-medium uppercase tracking-[0.14em] text-primary">Pilihan</p><AiringBadge status={a.status} /></div>
          <h1 className="mt-2 text-balance text-xl font-semibold leading-tight tracking-tight sm:text-2xl md:text-[2rem]" data-testid="text-hero-title">
            {a.title}
          </h1>
          {a.titleEnglish && a.titleEnglish !== a.title && <p className="mt-1 text-sm text-muted-foreground">{a.titleEnglish}</p>}
          <p className="mt-3 text-sm text-muted-foreground">
            {[a.type, seasonLabel(a.season, a.year), a.studios[0], a.episodeCount ? `${a.episodeCount} file` : null].filter(Boolean).join("  ·  ")}
          </p>
          {detail?.synopsis && <p className="mt-4 line-clamp-3 max-w-2xl text-sm leading-relaxed text-foreground/80">{detail.synopsis}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            {a.qualities?.map((q) => <QualityBadge key={q} q={q} />)}
            {a.genres.slice(0, 4).map((g) => (
              <span key={g} className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">{g}</span>
            ))}
          </div>
          <div className="mt-6 flex items-center gap-3">
            <Button asChild data-testid="button-hero-download">
              <Link href={`/anime/${a.malId}`}><Download /> Download</Link>
            </Button>
            {items.length > 1 && (
              <div className="ml-auto flex items-center gap-2 sm:ml-4">
                <button onClick={() => go(-1)} className="grid h-9 w-9 place-items-center rounded-full border border-border hover:bg-accent" aria-label="Sebelumnya" data-testid="button-hero-prev"><ChevronLeft className="h-4 w-4" /></button>
                <span className="text-xs text-muted-foreground tabular">{i + 1} / {items.length}</span>
                <button onClick={() => go(1)} className="grid h-9 w-9 place-items-center rounded-full border border-border hover:bg-accent" aria-label="Berikutnya" data-testid="button-hero-next"><ChevronRight className="h-4 w-4" /></button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

const PER_PAGE = 24;

function AllAnime() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching } = useQuery<{ items: AnimeCard[]; total: number; page: number; pages: number }>({
    queryKey: ["/api/anime", { sort: "added", page, limit: PER_PAGE }],
    placeholderData: keepPreviousData,
  });
  const go = (p: number) => {
    setPage(p);
    document.getElementById("all-anime")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <section id="all-anime" className="mt-12 scroll-mt-20">
      <div className="mb-4 flex items-end justify-between gap-4">
        <h2 className="text-base font-semibold tracking-tight sm:text-lg">Baru ditambahkan</h2>
        {data && <span className="text-xs text-muted-foreground tabular" data-testid="text-home-page">Halaman {data.page} dari {data.pages} · {data.total} judul</span>}
      </div>
      <div className={isFetching && !isLoading ? "opacity-60 transition-opacity" : "transition-opacity"}>
        <CardGrid items={data?.items} loading={isLoading} count={PER_PAGE} />
      </div>
      {data && <div className="mt-8"><Pager page={data.page} pages={data.pages} onChange={go} testid="pager-home" /></div>}
    </section>
  );
}

export default function Home() {
  const { data, isLoading } = useQuery<HomeData>({ queryKey: ["/api/home"] });
  const { resetFilters } = useApp();
  const more = (label: string, onClick: () => void, href = "/browse") => (
    <Link href={href} onClick={onClick} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
      {label} <ArrowRight className="h-3.5 w-3.5" />
    </Link>
  );
  return (
    <PublicShell>
      {isLoading ? (
        <div className="h-[380px] animate-pulse border-b border-border bg-card" />
      ) : (
        data && <Hero items={data.featured} />
      )}
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {!isLoading && data?.total === 0 ? (
          <div className="mt-12">
            <EmptyState title="Katalog masih kosong" body="Owner atau admin bisa menambahkan anime dari dashboard menggunakan link MyAnimeList." />
          </div>
        ) : (
          <>
            {data && data.ongoing.length > 0 && (
              <Row title="Sedang tayang" action={more("Semua ongoing", () => resetFilters({ status: "ongoing", sort: "popularity" }))}>
                <Rail items={data.ongoing} />
              </Row>
            )}
            {data?.currentSeason && data.season.length > 0 && (
              <Row title={`Season ${seasonLabel(data.currentSeason.season, data.currentSeason.year)}`} action={more("Season lain", () => {}, "/season")}>
                <Rail items={data.season} />
              </Row>
            )}
            <Row title="Skor tertinggi" action={more("Lihat semua", () => resetFilters({ sort: "score" }))}>
              <Rail items={data?.top} loading={isLoading} />
            </Row>
            <AllAnime />
          </>
        )}
      </div>
    </PublicShell>
  );
}
