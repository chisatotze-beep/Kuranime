import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Copy, Download, ExternalLink, Play, Youtube, ArrowLeft, Check } from "lucide-react";
import { EmptyState, Pager, PublicShell, ScoreBadge, QualityBadge, AiringBadge } from "@/components/site";
import { airingKey, broadcastLocal, safeHref } from "@shared/utils";
import { Comments } from "@/components/comments";
import { useApp } from "@/lib/store";
import { compact, copyText, formatSize, num, seasonLabel } from "@/lib/format";
import { guessDefaultPlayer, openExternal, playersFor } from "@/lib/players";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import type { AnimeDetail, Episode, SourceWithEpisodes } from "@shared/schema";
import type { Filters } from "@/lib/store";

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div className="flex gap-4 border-b border-border py-2 text-sm last:border-0">
      <dt className="w-24 flex-none text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

function StreamButton({ ep, animeTitle }: { ep: Episode; animeTitle: string }) {
  const { site, player, setPlayer } = useApp();
  const { toast } = useToast();
  const players = playersFor(site.players);
  const current = players.find((p) => p.id === player) || players[0];
  const label = `${animeTitle} ${ep.code}`;
  if (!players.length) return null;
  const play = (id: string) => {
    const p = players.find((x) => x.id === id)!;
    setPlayer(id);
    openExternal(p.build(ep.url, label));
  };
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-border">
      <button
        onClick={() => play(current.id)}
        className="inline-flex h-8 items-center gap-1.5 px-2.5 text-xs font-medium hover:bg-accent"
        title={`Putar di ${current.name}`}
        data-testid={`button-stream-${ep.id}`}
      >
        <Play className="h-3.5 w-3.5 fill-current" />
        <span className="hidden sm:inline">{current.name}</span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="grid h-8 w-7 place-items-center border-l border-border text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Pilih aplikasi" data-testid={`button-stream-menu-${ep.id}`}>
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Buka dengan aplikasi</DropdownMenuLabel>
          {players.map((p) => (
            <DropdownMenuItem key={p.id} onSelect={() => play(p.id)} data-testid={`menu-player-${p.id}-${ep.id}`}>
              <span className="flex-1">{p.name}</span>
              <span className="text-xs text-muted-foreground">{p.platform}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => copyText(ep.url).then(() => toast({ title: "Link disalin", description: "Tempel di pemutar atau download manager." }))}>
            <Copy className="h-4 w-4" /> Salin link langsung
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function EpisodeTable({ source, anime }: { source: SourceWithEpisodes; anime: AnimeDetail }) {
  const { site } = useApp();
  const per = site.perPage || 12;
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [source.id]);
  const pages = Math.max(1, Math.ceil(source.episodes.length / per));
  const rows = source.episodes.slice((page - 1) * per, page * per);
  const titleOf = (e: Episode) => e.title || (e.number != null ? anime.episodeTitles[String(e.number)] : null) || (e.number != null ? `Episode ${e.number}` : e.fileName || "—");
  const go = (p: number) => {
    setPage(p);
    document.getElementById("downloads")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  if (!source.episodes.length) return <EmptyState title="Belum ada file di sumber ini" />;
  return (
    <div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3 border-b border-border px-3 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground sm:grid-cols-[5.5rem_1fr_auto_auto] sm:px-4">
          <span>Episode</span>
          <span>Judul</span>
          <span className="hidden text-right sm:block">Download</span>
          <span className="text-right sm:text-left">Streaming</span>
        </div>
        <ul data-testid="list-episodes">
          {rows.map((e) => (
            <li key={e.id} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3 border-b border-border px-3 py-2.5 last:border-0 hover:bg-accent/40 sm:grid-cols-[5.5rem_1fr_auto_auto] sm:px-4" data-testid={`row-episode-${e.id}`}>
              <span className="font-mono text-xs font-medium text-primary sm:text-sm" data-testid={`text-episode-code-${e.id}`}>{e.code}</span>
              <div className="min-w-0">
                <div className="truncate text-sm" title={titleOf(e)}>{titleOf(e)}</div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <QualityBadge q={source.quality} res={source.resolution} />
                  {e.size ? <span className="text-xs text-muted-foreground tabular">{formatSize(e.size)}</span> : null}
                </div>
                <div className="mt-1.5 flex gap-1.5 sm:hidden">
                  <a href={safeHref(e.url)} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary/10 px-2.5 text-xs font-medium text-primary ring-1 ring-inset ring-primary/25" data-testid={`link-download-m-${e.id}`}>
                    <Download className="h-3.5 w-3.5" /> Download
                  </a>
                </div>
              </div>
              <a href={safeHref(e.url)} target="_blank" rel="noopener noreferrer" className="hidden h-8 items-center gap-1.5 justify-self-end rounded-md bg-primary/10 px-3 text-xs font-medium text-primary ring-1 ring-inset ring-primary/25 hover:bg-primary hover:text-primary-foreground sm:inline-flex" data-testid={`link-download-${e.id}`}>
                <Download className="h-3.5 w-3.5" /> Download
              </a>
              <div className="justify-self-end sm:justify-self-start"><StreamButton ep={e} animeTitle={anime.title} /></div>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-5">
        <Pager page={page} pages={pages} onChange={go} testid="pager-episodes" />
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground tabular">
        Menampilkan {(page - 1) * per + 1}–{Math.min(page * per, source.episodes.length)} dari {source.episodes.length} file
      </p>
    </div>
  );
}

export default function AnimePage({ params }: { params: { malId: string } }) {
  const malId = Number(params.malId);
  const { data: a, isLoading, error } = useQuery<AnimeDetail>({ queryKey: ["/api/anime", malId] });
  const { resetFilters, site, player, setPlayer } = useApp();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [srcId, setSrcId] = useState<number | null>(null);
  const [more, setMore] = useState(false);
  const players = playersFor(site.players);
  useEffect(() => {
    if (!player && players.length) setPlayer(guessDefaultPlayer(players) || players[0].id);
  }, [players.length]);
  useEffect(() => { window.scrollTo(0, 0); setSrcId(null); }, [malId]);
  useEffect(() => { if (a) document.title = `${a.title} — ${site.siteName}`; }, [a?.title, site.siteName]);

  const source = useMemo(() => a?.sources.find((s) => s.id === srcId) || a?.sources[0], [a, srcId]);
  const totalSize = source?.episodes.reduce((s, e) => s + (e.size || 0), 0) || 0;
  const browse = (p: Partial<Filters>) => { resetFilters(p); navigate("/browse"); };

  if (isLoading)
    return (
      <PublicShell>
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="grid gap-8 md:grid-cols-[240px_1fr]">
            <div className="aspect-[2/3] animate-pulse rounded-xl bg-muted" />
            <div className="space-y-3"><div className="h-8 w-2/3 animate-pulse rounded bg-muted" /><div className="h-4 w-1/3 animate-pulse rounded bg-muted" /><div className="h-24 animate-pulse rounded bg-muted" /></div>
          </div>
        </div>
      </PublicShell>
    );
  if (error || !a)
    return (
      <PublicShell>
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <EmptyState title="Anime tidak ditemukan" body="Judul ini belum ada di katalog atau sudah disembunyikan." action={<Button asChild variant="outline"><Link href="/browse">Kembali ke Jelajah</Link></Button>} />
        </div>
      </PublicShell>
    );

  const maxEp = Math.max(0, ...a.sources.map((x) => x.episodes.length));
  const meta = [a.type, a.episodes ? `${a.episodes} eps` : null, a.duration?.replace(" per ep.", "/eps")].filter(Boolean);

  return (
    <PublicShell>
      <section className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[460px] overflow-hidden">
          {a.imageUrl && <img src={a.imageUrl} alt="" className="h-full w-full scale-110 object-cover opacity-25 blur-2xl" />}
          <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-background/80 to-background" />
        </div>
        <div className="relative mx-auto max-w-6xl px-4 pt-6 sm:px-6">
          <button onClick={() => history.length > 1 ? history.back() : navigate("/browse")} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground" data-testid="button-back">
            <ArrowLeft className="h-3.5 w-3.5" /> Kembali
          </button>
          <div className="mt-5 grid gap-6 md:grid-cols-[240px_1fr] md:gap-10">
            <div className="mx-auto w-44 md:mx-0 md:w-full">
              <div className="relative">
                <img src={a.imageUrl || ""} alt={a.title} className="aspect-[2/3] w-full rounded-xl object-cover shadow-2xl ring-1 ring-white/10" data-testid="img-poster" />
              </div>
              <div className="mt-4 hidden md:block">
                <dl>
                  <InfoRow label="Status">{a.status}</InfoRow>
                  <InfoRow label="Tayang">{a.airedString}</InfoRow>
                  {airingKey(a.status) === "ongoing" && <InfoRow label="Jadwal">{broadcastLocal(a.broadcast)}</InfoRow>}
                  <InfoRow label="Season">{a.season ? <button className="hover:text-primary" onClick={() => browse({ season: a.season!, year: a.year ? String(a.year) : "" })}>{seasonLabel(a.season, a.year)}</button> : a.year}</InfoRow>
                  <InfoRow label="Sumber">{a.source}</InfoRow>
                  <InfoRow label="Rating">{a.rating}</InfoRow>
                  <InfoRow label="Produser">{a.producers.slice(0, 4).join(", ")}</InfoRow>
                </dl>
              </div>
            </div>
            <div className="min-w-0">
              <h1 className="text-balance text-xl font-semibold leading-tight tracking-tight md:text-2xl" data-testid="text-title">{a.title}</h1>
              <div className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                {a.titleEnglish && a.titleEnglish !== a.title && <p>{a.titleEnglish}</p>}
                {a.titleJapanese && <p lang="ja">{a.titleJapanese}</p>}
              </div>

              <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
                {[
                  { l: "Skor", v: a.score ? a.score.toFixed(2) : "—", s: a.scoredBy ? `${compact(a.scoredBy)} user` : "" },
                  { l: "Peringkat", v: a.rank ? `#${num(a.rank)}` : "—" },
                  { l: "Popularitas", v: a.popularity ? `#${num(a.popularity)}` : "—" },
                  { l: "Member", v: compact(a.members) },
                ].map((x) => (
                  <div key={x.l} className="bg-card px-4 py-3">
                    <div className="text-xs text-muted-foreground">{x.l}</div>
                    <div className="mt-0.5 text-base font-semibold tabular" data-testid={`text-stat-${x.l.toLowerCase()}`}>{x.v}</div>
                    {x.s && <div className="text-[11px] text-muted-foreground">{x.s}</div>}
                  </div>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                <span className="text-muted-foreground">{meta.join(" · ")}</span>
                {a.studios.map((s) => (
                  <button key={s} onClick={() => browse({ studio: s })} className="font-medium hover:text-primary" data-testid={`link-studio-${s}`}>{s}</button>
                ))}
                {a.season && (
                  <button onClick={() => browse({ season: a.season!, year: a.year ? String(a.year) : "" })} className="text-muted-foreground hover:text-primary md:hidden">{seasonLabel(a.season, a.year)}</button>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <AiringBadge status={a.status} />
                {[...new Set(a.sources.map((x) => x.quality).filter(Boolean))].map((q) => <QualityBadge key={q} q={q} />)}
                {a.genres.map((g) => (
                  <button key={g} onClick={() => browse({ genres: [g] })} className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground hover:border-primary/60 hover:text-foreground" data-testid={`link-genre-${g}`}>{g}</button>
                ))}
              </div>

              {airingKey(a.status) === "ongoing" && (
                <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] px-4 py-3 text-sm" data-testid="box-ongoing">
                  <span className="font-medium text-emerald-700 dark:text-emerald-300">Masih tayang</span>
                  {a.broadcast && <span className="text-muted-foreground">Episode baru tiap <b className="font-medium text-foreground">{broadcastLocal(a.broadcast)}</b></span>}
                  <span className="text-muted-foreground tabular">Tersedia <b className="font-medium text-foreground">{maxEp}</b>{a.episodes ? ` dari ${a.episodes}` : ""} episode</span>
                </div>
              )}
              {airingKey(a.status) === "upcoming" && (
                <div className="mt-5 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 text-sm text-muted-foreground">Belum tayang{a.airedString && a.airedString !== "Not available" ? ` · rencana ${a.airedString}` : ""}.</div>
              )}
              {a.synopsis && (
                <div className="mt-6">
                  <p className={cn("max-w-3xl whitespace-pre-line text-sm leading-relaxed text-foreground/85", !more && "line-clamp-5")} data-testid="text-synopsis">{a.synopsis}</p>
                  {a.synopsis.length > 400 && (
                    <button onClick={() => setMore(!more)} className="mt-1 text-xs text-primary hover:underline">{more ? "Tutup" : "Baca selengkapnya"}</button>
                  )}
                </div>
              )}

              <div className="mt-6 flex flex-wrap gap-2">
                <Button onClick={() => document.getElementById("downloads")?.scrollIntoView({ behavior: "smooth" })} data-testid="button-goto-downloads"><Download /> Download</Button>
                {a.trailerYoutubeId && (
                  <Button asChild variant="outline"><a href={`https://www.youtube.com/watch?v=${a.trailerYoutubeId}`} target="_blank" rel="noopener noreferrer"><Youtube /> Trailer</a></Button>
                )}
                <Button asChild variant="ghost"><a href={`https://myanimelist.net/anime/${a.malId}`} target="_blank" rel="noopener noreferrer" data-testid="link-mal"><ExternalLink /> MyAnimeList</a></Button>
              </div>

              <dl className="mt-6 md:hidden">
                <InfoRow label="Status">{a.status}</InfoRow>
                <InfoRow label="Tayang">{a.airedString}</InfoRow>
                <InfoRow label="Sumber">{a.source}</InfoRow>
                <InfoRow label="Rating">{a.rating}</InfoRow>
              </dl>
            </div>
          </div>
        </div>
      </section>

      <section id="downloads" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-12 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Download & streaming</h2>
            {source && (
              <p className="mt-1 text-sm text-muted-foreground tabular">
                {source.episodes.length} file{totalSize ? ` · total ${formatSize(totalSize)}` : ""}
              </p>
            )}
          </div>
          {source && source.episodes.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {players.length > 0 && (
                <Select value={player || players[0].id} onValueChange={setPlayer}>
                  <SelectTrigger className="h-9 w-auto min-w-[11rem] bg-card text-sm" data-testid="select-player">
                    <span className="mr-1 text-muted-foreground">Pemutar:</span><SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {players.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name} <span className="text-muted-foreground">· {p.platform}</span></SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button variant="outline" onClick={() => copyText(source.episodes.map((e) => e.url).join("\n")).then(() => toast({ title: `${source.episodes.length} link disalin`, description: "Tempel ke IDM / ADM untuk download sekaligus." }))} data-testid="button-copy-all">
                <Copy /> Salin semua link
              </Button>
            </div>
          )}
        </div>

        {a.sources.length > 1 && (
          <div className="mt-5 flex gap-1.5 overflow-x-auto pb-1 scrollbar-none" role="tablist">
            {a.sources.map((s) => (
              <button key={s.id} role="tab" aria-selected={source?.id === s.id} onClick={() => setSrcId(s.id)}
                className={cn("flex-none rounded-full border px-3 py-1.5 text-xs", source?.id === s.id ? "border-primary bg-primary/15" : "border-border text-muted-foreground hover:text-foreground")}
                data-testid={`tab-source-${s.id}`}>
                <span className="inline-flex items-center gap-1.5"><QualityBadge q={s.quality} />{s.label} <span className="opacity-60 tabular">({s.episodes.length})</span></span>
              </button>
            ))}
          </div>
        )}
        {a.sources.length === 1 && source && <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><QualityBadge q={source.quality} res={source.resolution} />{source.label}</p>}

        <div className="mt-5">
          {source ? <EpisodeTable source={source} anime={a} /> : <EmptyState title="Link download belum tersedia" body="Admin belum menambahkan file untuk judul ini." />}
        </div>
        <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
          Tombol streaming membuka file langsung di aplikasi pemutar (MX Player, VLC, mpv, dll.) tanpa perlu download dulu. Kalau aplikasinya belum terpasang, Android akan membuka Play Store.
        </p>
      </section>
      <Comments malId={a.malId} />
    </PublicShell>
  );
}
