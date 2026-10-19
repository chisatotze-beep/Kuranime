import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  LayoutGrid, Film, Plus, MessageCircle, RefreshCw, Shield, Settings, Users, KeyRound, LogOut, ExternalLink, Search, Eye, EyeOff, Star, Trash2, Pencil, ShieldCheck, Loader2,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { api, queryClient, setOnSessionExpired } from "@/lib/queryClient";
import { PasswordMeter, AccountSecurity, useIdleLogout, ago } from "@/pages/admin-security";
import { formatSize, seasonLabel } from "@/lib/format";
import { PLAYERS } from "@/lib/players";
import { cn } from "@/lib/utils";
import { Wordmark, Pager, EmptyState, AiringBadge } from "@/components/site";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import type { AnimeCard, PublicUser, SiteSettings, AdminComment } from "@shared/schema";

/* ===================== Auth gate ===================== */
function AuthCard({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 block text-center text-xl"><Wordmark /></Link>
        <div className="rounded-2xl border border-border bg-card p-6">
          <h1 className="text-base font-semibold">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{sub}</p>
          <div className="mt-5">{children}</div>
        </div>
      </div>
    </div>
  );
}

function CredForm({ mode, needKey }: { mode: "login" | "setup"; needKey?: boolean }) {
  const [setupKey, setKey] = useState("");
  const { login } = useApp();
  const [username, setU] = useState("");
  const [password, setPassword] = useState("");
  const setP = setPassword;
  const [confirm, setC] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [need2fa, setNeed2fa] = useState(false);
  const [code, setCode] = useState("");
  const m = useMutation({
    mutationFn: () => api<{ token: string; user: PublicUser }>("POST", mode === "login" ? "/api/auth/login" : "/api/auth/setup", { username, password, ...(need2fa ? { code } : {}), ...(mode === "setup" && needKey ? { setupKey } : {}) }),
    onSuccess: (r) => { login(r.token, r.user); queryClient.invalidateQueries(); },
    onError: (e: any) => {
      if (e.data?.need2fa) {
        if (need2fa) setErr(e.message); // kode salah
        setNeed2fa(true);
        setCode("");
        return;
      }
      setErr(e.message);
    },
  });
  if (need2fa)
    return (
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setErr(""); m.mutate(); }}>
        <div className="flex items-start gap-3 rounded-lg bg-muted/60 p-3 text-sm">
          <ShieldCheck className="mt-0.5 h-4 w-4 flex-none text-primary" />
          <span className="text-muted-foreground">Akun <b className="text-foreground">{username}</b> memakai 2FA. Buka aplikasi authenticator dan masukkan kode 6 digit.</span>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="otp">Kode 2FA</Label>
          <Input id="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus placeholder="123456" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className="text-center font-mono text-lg tracking-[0.4em]" data-testid="input-otp" />
        </div>
        {err && <p className="text-sm text-destructive" data-testid="text-auth-error">{err}</p>}
        <Button type="submit" className="w-full" disabled={m.isPending || code.length !== 6} data-testid="button-otp-submit">
          {m.isPending && <Loader2 className="animate-spin" />} Verifikasi
        </Button>
        <button type="button" className="w-full text-center text-xs text-muted-foreground hover:text-foreground" onClick={() => { setNeed2fa(false); setErr(""); setPassword(""); }}>Kembali</button>
      </form>
    );
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setErr("");
        if (mode === "setup" && password !== confirm) return setErr("Konfirmasi password tidak sama");
        m.mutate();
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="u">Username</Label>
        <Input id="u" autoComplete="username" value={username} onChange={(e) => setU(e.target.value)} autoFocus data-testid="input-username" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="p">Password</Label>
        <div className="relative">
          <Input id="p" type={show ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(e) => setP(e.target.value)} className="pr-10" data-testid="input-password" />
          <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" aria-label="Lihat password">
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {mode === "setup" && needKey && (
        <div className="space-y-1.5">
          <Label htmlFor="k">Kode setup</Label>
          <Input id="k" type="password" value={setupKey} onChange={(e) => setKey(e.target.value)} data-testid="input-setup-key" />
          <p className="text-xs text-muted-foreground">Isi dengan nilai SETUP_KEY di server.</p>
        </div>
      )}
      {mode === "setup" && (
        <div className="space-y-1.5">
          <Label htmlFor="c">Ulangi password</Label>
          <Input id="c" type={show ? "text" : "password"} value={confirm} onChange={(e) => setC(e.target.value)} data-testid="input-password-confirm" />
          <PasswordMeter pw={password} username={username} />
        </div>
      )}
      {err && <p className="text-sm text-destructive" data-testid="text-auth-error">{err}</p>}
      <Button type="submit" className="w-full" disabled={m.isPending || !username || !password} data-testid="button-auth-submit">
        {m.isPending && <Loader2 className="animate-spin" />}
        {mode === "login" ? "Masuk" : "Buat akun owner"}
      </Button>
    </form>
  );
}

export function AdminGate({ children }: { children: ReactNode }) {
  const { user } = useApp();
  const { data: status, isLoading } = useQuery<{ needsSetup: boolean; setupKey?: boolean }>({ queryKey: ["/api/auth/status"], enabled: !user, staleTime: 0 });
  if (user) return <AdminShell>{children}</AdminShell>;
  if (isLoading) return <div className="grid min-h-screen place-items-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (status?.needsSetup)
    return (
      <AuthCard title="Buat akun owner" sub="Belum ada akun. Akun pertama otomatis menjadi owner dan bisa menambah admin lain.">
        <CredForm mode="setup" needKey={status.setupKey} />
      </AuthCard>
    );
  return (
    <AuthCard title="Masuk dashboard" sub="Khusus owner dan admin.">
      <CredForm mode="login" />
    </AuthCard>
  );
}

/* ===================== Shell ===================== */
function AdminShell({ children }: { children: ReactNode }) {
  const { user, logout, expire } = useApp();
  const { toast } = useToast();
  const [loc] = useLocation();
  // sesi dicabut / kedaluwarsa di server -> keluar otomatis
  useEffect(() => {
    setOnSessionExpired(() => { expire(); toast({ title: "Sesi berakhir", description: "Silakan login lagi." }); });
    return () => setOnSessionExpired(null);
  }, []);
  // diam 60 menit -> keluar otomatis
  const onIdle = useCallback(() => { logout(); toast({ title: "Keluar otomatis", description: "Dashboard tidak dipakai selama 60 menit." }); }, []);
  useIdleLogout(60, onIdle);
  const nav = [
    { href: "/admin", label: "Ringkasan", icon: LayoutGrid, exact: true },
    { href: "/admin/anime", label: "Anime", icon: Film },
    { href: "/admin/add", label: "Tambah anime", icon: Plus },
    { href: "/admin/comments", label: "Komentar", icon: MessageCircle },
    { href: "/admin/settings", label: "Pengaturan", icon: Settings },
    ...(user?.role === "owner" ? [{ href: "/admin/users", label: "Admin", icon: Users }] : []),
    { href: "/admin/security", label: "Keamanan", icon: Shield },
    { href: "/admin/account", label: "Akun", icon: KeyRound },
  ];
  const active = (n: { href: string; exact?: boolean }) => (n.exact ? loc === n.href : loc.startsWith(n.href));
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[232px_1fr]">
      <aside className="sticky top-0 z-30 border-b border-border bg-sidebar lg:h-screen lg:border-b-0 lg:border-r">
        <div className="flex h-14 items-center justify-between px-4 lg:px-5">
          <Link href="/admin" className="flex items-center gap-2">
            <Wordmark />
            <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Admin</span>
          </Link>
          <button onClick={logout} className="text-muted-foreground hover:text-foreground lg:hidden" aria-label="Keluar" data-testid="button-logout-m"><LogOut className="h-4 w-4" /></button>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2 scrollbar-none lg:flex-col lg:overflow-visible lg:pb-0">
          {nav.map((n) => (
            <Link key={n.href} href={n.href}
              className={cn("flex flex-none items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors", active(n) ? "bg-sidebar-accent font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}
              data-testid={`link-admin-${n.href.split("/")[2] || "home"}`}>
              <n.icon className="h-4 w-4" /> {n.label}
            </Link>
          ))}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 hidden border-t border-sidebar-border p-4 lg:block">
          <div className="flex items-center gap-2 text-sm">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/15 text-xs font-semibold uppercase text-primary">{user?.username.slice(0, 2)}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium" data-testid="text-current-user">{user?.username}</div>
              <div className="text-xs capitalize text-muted-foreground">{user?.role}</div>
            </div>
            <button onClick={logout} className="text-muted-foreground hover:text-foreground" aria-label="Keluar" data-testid="button-logout"><LogOut className="h-4 w-4" /></button>
          </div>
          <Link href="/" className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><ExternalLink className="h-3.5 w-3.5" /> Lihat situs</Link>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{children}</main>
    </div>
  );
}

export function PageHead({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

/* ===================== Overview ===================== */
type Stats = { comments: number; anime: number; published: number; featured: number; sources: number; episodes: number; totalSize: number; users: number; withoutLinks: number; recent: AnimeCard[]; noLinks: AnimeCard[] };

function MiniRow({ a }: { a: AnimeCard }) {
  return (
    <Link href={`/admin/anime/${a.malId}`} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent" data-testid={`link-admin-anime-${a.malId}`}>
      <img src={a.imageUrl || ""} alt="" className="h-12 w-8 flex-none rounded object-cover bg-muted" loading="lazy" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{a.title}</div>
        <div className="flex min-w-0 items-center gap-1.5"><AiringBadge status={a.status} /><span className="truncate text-xs text-muted-foreground">{[a.type, seasonLabel(a.season, a.year), `${a.episodeCount} file`].filter(Boolean).join(" · ")}</span></div>
      </div>
      {!a.published && <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">Draft</span>}
    </Link>
  );
}

export function AdminOverview() {
  const { data: s, isLoading } = useQuery<Stats>({ queryKey: ["/api/admin/stats"] });
  const { toast } = useToast();
  const sync = useMutation({
    mutationFn: () => api<{ updated: number; failed: number; finished: number; running: boolean }>("POST", "/api/admin/sync-airing"),
    onSuccess: (r) => {
      queryClient.invalidateQueries();
      toast(r.running
        ? { title: "Sinkron sedang berjalan", description: "Proses otomatis sedang memperbarui data, coba lagi sebentar." }
        : { title: "Sinkron selesai", description: `${r.updated} anime diperbarui${r.finished ? `, ${r.finished} sudah tamat` : ""}${r.failed ? `, ${r.failed} gagal` : ""}.` });
    },
    onError: (e: any) => toast({ title: "Gagal sinkron", description: e.message, variant: "destructive" }),
  });
  const kpis = s
    ? [
        { l: "Total anime", v: s.anime, sub: `${s.published} tampil · ${s.anime - s.published} draft` },
        { l: "File episode", v: s.episodes, sub: `${s.sources} sumber` },
        { l: "Total ukuran", v: formatSize(s.totalSize) || "0", sub: "dari semua link" },
        { l: "Komentar", v: s.comments, sub: "di semua anime" },
      ]
    : [];
  return (
    <>
      <PageHead
        title="Ringkasan"
        sub="Anime ongoing otomatis diperbarui dari MAL tiap beberapa jam (status, skor, jumlah episode)."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => sync.mutate()} disabled={sync.isPending} data-testid="button-sync-airing">
              {sync.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Sinkron ongoing
            </Button>
            <Button asChild data-testid="button-add-anime"><Link href="/admin/add"><Plus /> Tambah anime</Link></Button>
          </div>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-card" />)
          : kpis.map((k) => (
              <div key={k.l} className="rounded-xl border border-border bg-card p-4">
                <div className="text-xs text-muted-foreground">{k.l}</div>
                <div className="mt-1 text-xl font-semibold tabular" data-testid={`text-kpi-${k.l}`}>{k.v}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{k.sub}</div>
              </div>
            ))}
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-2 flex items-center justify-between px-2"><h2 className="text-sm font-semibold">Baru ditambahkan</h2><Link href="/admin/anime" className="text-xs text-muted-foreground hover:text-foreground">Semua</Link></div>
          {s?.recent.length ? s.recent.map((a) => <MiniRow key={a.id} a={a} />) : <p className="px-2 py-6 text-sm text-muted-foreground">Belum ada anime.</p>}
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-2 px-2"><h2 className="text-sm font-semibold">Perlu link download</h2></div>
          {s?.noLinks.length ? s.noLinks.map((a) => <MiniRow key={a.id} a={a} />) : <p className="px-2 py-6 text-sm text-muted-foreground">Semua anime sudah punya link. Mantap.</p>}
        </div>
      </div>
    </>
  );
}

/* ===================== Anime list ===================== */
export function AdminAnimeList() {
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [page, setPage] = useState(1);
  const { toast } = useToast();
  useEffect(() => { const t = setTimeout(() => { setDq(q); setPage(1); }, 250); return () => clearTimeout(t); }, [q]);
  const { data, isLoading } = useQuery<{ items: AnimeCard[]; total: number; page: number; pages: number }>({
    queryKey: ["/api/admin/anime", { q: dq, page, limit: 20, sort: "added" }],
  });
  const patch = useMutation({
    mutationFn: ({ id, p }: { id: number; p: any }) => api("PATCH", `/api/admin/anime/${id}`, p),
    onSuccess: () => { queryClient.invalidateQueries(); },
    onError: (e: any) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });
  const del = useMutation({
    mutationFn: (id: number) => api("DELETE", `/api/admin/anime/${id}`),
    onSuccess: () => { queryClient.invalidateQueries(); toast({ title: "Anime dihapus" }); },
  });
  return (
    <>
      <PageHead title="Anime" sub={data ? `${data.total} judul di katalog` : undefined} action={<Button asChild><Link href="/admin/add"><Plus /> Tambah anime</Link></Button>} />
      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari di katalog…" className="pl-9" data-testid="input-admin-search" />
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="hidden grid-cols-[1fr_6rem_5.5rem_5.5rem_7rem] gap-3 border-b border-border px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground md:grid">
          <span>Judul</span><span>File</span><span>Tampil</span><span>Pilihan</span><span className="text-right">Aksi</span>
        </div>
        {isLoading && <div className="h-40 animate-pulse" />}
        {data?.items.map((a) => (
          <div key={a.id} className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-border px-3 py-2.5 last:border-0 md:grid-cols-[1fr_6rem_5.5rem_5.5rem_7rem] md:px-4" data-testid={`row-admin-anime-${a.malId}`}>
            <Link href={`/admin/anime/${a.malId}`} className="flex min-w-0 items-center gap-3">
              <img src={a.imageUrl || ""} alt="" className="h-14 w-10 flex-none rounded object-cover bg-muted" loading="lazy" />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium hover:text-primary">{a.title}</div>
                <div className="flex min-w-0 items-center gap-1.5"><AiringBadge status={a.status} /><span className="truncate text-xs text-muted-foreground">{[a.type, seasonLabel(a.season, a.year), a.studios[0]].filter(Boolean).join(" · ")}</span></div>
                <div className="mt-1 flex items-center gap-3 md:hidden">
                  <span className={cn("text-xs tabular", a.episodeCount ? "text-muted-foreground" : "text-destructive")}>{a.episodeCount} file</span>
                  {!a.published && <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">Draft</span>}
                  {a.featured && <Star className="h-3 w-3 fill-amber-400 text-amber-400" />}
                </div>
              </div>
            </Link>
            <span className={cn("hidden text-sm tabular md:block", !a.episodeCount && "text-destructive")}>{a.episodeCount}</span>
            <div className="hidden md:block"><Switch checked={a.published} onCheckedChange={(v) => patch.mutate({ id: a.id, p: { published: v } })} aria-label="Tampilkan" data-testid={`switch-published-${a.malId}`} /></div>
            <div className="hidden md:block"><Switch checked={a.featured} onCheckedChange={(v) => patch.mutate({ id: a.id, p: { featured: v } })} aria-label="Pilihan" data-testid={`switch-featured-${a.malId}`} /></div>
            <div className="flex items-center justify-end gap-1">
              <Button asChild size="icon" variant="ghost" title="Lihat di situs"><a href={`#/anime/${a.malId}`}><ExternalLink /></a></Button>
              <Button asChild size="icon" variant="ghost" title="Edit"><Link href={`/admin/anime/${a.malId}`} data-testid={`button-edit-${a.malId}`}><Pencil /></Link></Button>
              <AlertDialog>
                <AlertDialogTrigger asChild><Button size="icon" variant="ghost" className="text-muted-foreground hover:text-destructive" title="Hapus" data-testid={`button-delete-${a.malId}`}><Trash2 /></Button></AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Hapus “{a.title}”?</AlertDialogTitle>
                    <AlertDialogDescription>Data anime dan semua link download-nya akan dihapus dari katalog. File di Google Drive tidak terpengaruh.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Batal</AlertDialogCancel>
                    <AlertDialogAction onClick={() => del.mutate(a.id)} className="bg-destructive text-destructive-foreground">Hapus</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        ))}
        {data && data.total === 0 && <div className="p-6"><EmptyState title="Tidak ada anime" body={dq ? "Tidak ada judul yang cocok." : "Mulai dengan menambahkan anime dari link MyAnimeList."} /></div>}
      </div>
      {data && <div className="mt-6"><Pager page={data.page} pages={data.pages} onChange={setPage} testid="pager-admin" /></div>}
    </>
  );
}

/* ===================== Settings ===================== */
function Section({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 border-b border-border py-6 first:pt-0 last:border-0 last:pb-0 md:grid-cols-[220px_1fr]">
      <div><h2 className="text-sm font-semibold">{title}</h2>{sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}</div>
      <div className="max-w-xl space-y-4">{children}</div>
    </section>
  );
}
export function AdminSettings() {
  const { user } = useApp();
  const isOwner = user?.role === "owner";
  const { data } = useQuery<SiteSettings>({ queryKey: ["/api/admin/settings"] });
  const [f, setF] = useState<SiteSettings | null>(null);
  const [hosts, setHosts] = useState("");
  useEffect(() => { if (data) setHosts((data.indexHosts || []).join("\n")); }, [data]);
  const { toast } = useToast();
  useEffect(() => { if (data && !f) setF(data); }, [data]);
  const save = useMutation({
    mutationFn: () => {
      const { indexRoot, indexHosts, ...rest } = f!;
      const body = isOwner ? { ...rest, indexRoot, indexHosts: hosts.split(/[\s,]+/).map((h) => h.trim().toLowerCase()).filter(Boolean) } : rest;
      return api("PATCH", "/api/admin/settings", body);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/site"] }); queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] }); toast({ title: "Pengaturan disimpan" }); },
    onError: (e: any) => toast({ title: "Gagal menyimpan", description: e.message, variant: "destructive" }),
  });
  if (!f) return <div className="h-60 animate-pulse rounded-xl bg-card" />;
  const set = (p: Partial<SiteSettings>) => setF({ ...f, ...p });
  return (
    <>
      <PageHead title="Pengaturan" sub="Berlaku untuk seluruh situs." action={<Button onClick={() => save.mutate()} disabled={save.isPending} data-testid="button-save-settings">{save.isPending && <Loader2 className="animate-spin" />}Simpan</Button>} />
      <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
        <Section title="Identitas situs">
          <div className="space-y-1.5"><Label>Nama situs</Label><Input value={f.siteName} onChange={(e) => set({ siteName: e.target.value })} data-testid="input-sitename" /></div>
          <div className="space-y-1.5"><Label>Tagline</Label><Input value={f.tagline} onChange={(e) => set({ tagline: e.target.value })} data-testid="input-tagline" /></div>
        </Section>
        <Section title="Pengumuman" sub="Tampil sebagai banner tipis di atas semua halaman. Kosongkan untuk menyembunyikan.">
          <Textarea value={f.announcement} onChange={(e) => set({ announcement: e.target.value })} rows={3} placeholder="Contoh: Server sedang maintenance malam ini pukul 23.00 WIB." data-testid="input-announcement" />
        </Section>
        <Section title="Daftar episode" sub="Jumlah link per halaman di tabel download.">
          <div className="flex items-center gap-3">
            <Input type="number" min={6} max={50} value={f.perPage} onChange={(e) => set({ perPage: Number(e.target.value) || 12 })} className="w-24" data-testid="input-perpage" />
            <span className="text-sm text-muted-foreground">link per halaman</span>
          </div>
        </Section>
        <Section title="Aplikasi streaming" sub="Pilih aplikasi yang muncul di tombol Streaming.">
          <div className="grid gap-2 sm:grid-cols-2">
            {PLAYERS.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2.5 hover:bg-accent/50">
                <Checkbox checked={f.players.includes(p.id)} onCheckedChange={(v) => set({ players: v ? [...f.players, p.id] : f.players.filter((x) => x !== p.id) })} data-testid={`checkbox-player-${p.id}`} />
                <span className="flex-1 text-sm">{p.name}</span>
                <span className="text-xs text-muted-foreground">{p.platform}</span>
              </label>
            ))}
          </div>
        </Section>
        <Section title="Index Google Drive" sub={isOwner ? "Folder awal penjelajah index dan daftar domain yang boleh dibuka server. Domain lain otomatis ditolak." : "Hanya owner yang bisa mengubah bagian ini."}>
          <div className="space-y-1.5">
            <Label>Folder awal</Label>
            <Input value={f.indexRoot} onChange={(e) => set({ indexRoot: e.target.value })} disabled={!isOwner} className="font-mono text-xs" data-testid="input-indexroot" />
          </div>
          <div className="space-y-1.5">
            <Label>Domain yang diizinkan</Label>
            <Textarea value={hosts} onChange={(e) => setHosts(e.target.value)} disabled={!isOwner} rows={2} className="font-mono text-xs" placeholder="adb.gabutinz.workers.dev" data-testid="input-indexhosts" />
            <p className="text-xs text-muted-foreground">Satu domain per baris. Domain dari folder awal otomatis ditambahkan.</p>
          </div>
        </Section>
      </div>
    </>
  );
}

/* ===================== Users (owner) ===================== */
export function AdminUsers() {
  const { user } = useApp();
  const { toast } = useToast();
  const { data: users } = useQuery<PublicUser[]>({ queryKey: ["/api/admin/users"], enabled: user?.role === "owner" });
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [reset, setReset] = useState<{ id: number; pw: string } | null>(null);
  const add = useMutation({
    mutationFn: () => api("POST", "/api/admin/users", { username: u, password: p }),
    onSuccess: () => { setU(""); setP(""); queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] }); toast({ title: "Admin ditambahkan" }); },
    onError: (e: any) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });
  const del = useMutation({
    mutationFn: (id: number) => api("DELETE", `/api/admin/users/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] }); toast({ title: "Admin dihapus" }); },
  });
  const pw = useMutation({
    mutationFn: () => api("PATCH", `/api/admin/users/${reset!.id}`, { password: reset!.pw }),
    onSuccess: () => { setReset(null); toast({ title: "Password diganti", description: "Sesi lama user tersebut otomatis keluar." }); },
    onError: (e: any) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });
  if (user?.role !== "owner") return <EmptyState title="Khusus owner" body="Hanya owner yang bisa mengelola admin." />;
  return (
    <>
      <PageHead title="Admin" sub="Owner bisa menambah, mengganti password, dan menghapus admin. Admin bisa mengelola anime dan pengaturan, tapi tidak bisa mengelola admin lain." />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {users?.map((x) => (
            <div key={x.id} className="border-b border-border px-4 py-3 last:border-0" data-testid={`row-user-${x.id}`}>
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-full bg-primary/15 text-xs font-semibold uppercase text-primary">{x.username.slice(0, 2)}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{x.username}{x.id === user.id && <span className="ml-1 text-muted-foreground">(kamu)</span>}</div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1 capitalize">{x.role === "owner" && <ShieldCheck className="h-3 w-3 text-primary" />}{x.role}</span>
                    <span className={cn("rounded px-1 py-px text-[10px] font-semibold uppercase", x.totpEnabled ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/12 text-amber-700 dark:text-amber-300")}>{x.totpEnabled ? "2FA" : "Tanpa 2FA"}</span>
                    {x.passwordChangedAt && <span>· password diganti {ago(x.passwordChangedAt)}</span>}
                  </div>
                </div>
                {x.role !== "owner" && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setReset(reset?.id === x.id ? null : { id: x.id, pw: "" })}>Ganti password</Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild><Button size="icon" variant="ghost" className="text-muted-foreground hover:text-destructive" data-testid={`button-delete-user-${x.id}`}><Trash2 /></Button></AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>Hapus admin “{x.username}”?</AlertDialogTitle><AlertDialogDescription>Admin ini tidak akan bisa masuk dashboard lagi.</AlertDialogDescription></AlertDialogHeader>
                        <AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><AlertDialogAction onClick={() => del.mutate(x.id)} className="bg-destructive text-destructive-foreground">Hapus</AlertDialogAction></AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                )}
              </div>
              {reset?.id === x.id && (
                <form className="mt-3 flex gap-2 pl-12" onSubmit={(e) => { e.preventDefault(); pw.mutate(); }}>
                  <Input type="password" placeholder="Password baru (min. 8)" value={reset.pw} onChange={(e) => setReset({ ...reset, pw: e.target.value })} />
                  <Button type="submit" disabled={reset.pw.length < 8 || pw.isPending}>Simpan</Button>
                </form>
              )}
            </div>
          ))}
        </div>
        <form className="h-fit space-y-3 rounded-xl border border-border bg-card p-5" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
          <h2 className="text-sm font-semibold">Tambah admin</h2>
          <div className="space-y-1.5"><Label>Username</Label><Input value={u} onChange={(e) => setU(e.target.value)} data-testid="input-new-username" /></div>
          <div className="space-y-1.5"><Label>Password</Label><Input type="password" autoComplete="new-password" value={p} onChange={(e) => setP(e.target.value)} data-testid="input-new-password" /><PasswordMeter pw={p} username={u} /></div>
          <Button type="submit" className="w-full" disabled={!u || p.length < 8 || add.isPending} data-testid="button-add-user">Tambah</Button>
        </form>
      </div>
    </>
  );
}

/* ===================== Account ===================== */
export function AdminAccount() {
  const { user } = useApp();
  return (
    <>
      <PageHead title="Akun" sub={`Masuk sebagai ${user?.username} (${user?.role}).`} />
      <AccountSecurity />
    </>
  );
}

/* ===================== Comments moderation ===================== */
export function AdminComments() {
  const [page, setPage] = useState(1);
  const { toast } = useToast();
  const { data, isLoading } = useQuery<{ items: AdminComment[]; total: number; page: number; pages: number }>({ queryKey: ["/api/admin/comments", { page }] });
  const del = useMutation({
    mutationFn: (id: number) => api("DELETE", `/api/admin/comments/${id}`),
    onSuccess: () => { queryClient.invalidateQueries(); toast({ title: "Komentar dihapus" }); },
  });
  return (
    <>
      <PageHead title="Komentar" sub={data ? `${data.total} komentar, terbaru di atas. Menghapus komentar juga menghapus balasannya.` : undefined} />
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {isLoading && <div className="h-40 animate-pulse" />}
        {data?.items.map((c) => (
          <div key={c.id} className="flex gap-3 border-b border-border px-4 py-3 last:border-0" data-testid={`row-admin-comment-${c.id}`}>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 text-sm">
                <span className="font-medium">{c.name}</span>
                {c.isAdmin && <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary">Admin</span>}
                {c.parentId && <span className="text-xs text-muted-foreground">membalas</span>}
                <span className="text-xs text-muted-foreground">di</span>
                <a href={`#/anime/${c.malId}`} className="truncate text-xs font-medium hover:text-primary">{c.animeTitle}</a>
              </div>
              <p className="mt-1 whitespace-pre-line text-sm text-foreground/90 [overflow-wrap:anywhere]">{c.body}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{new Date(c.createdAt).toLocaleString("id-ID")}{c.ip ? ` · IP ${c.ip}` : ""}</p>
            </div>
            <Button size="icon" variant="ghost" className="flex-none text-muted-foreground hover:text-destructive" onClick={() => del.mutate(c.id)} aria-label="Hapus komentar" data-testid={`button-admin-delete-comment-${c.id}`}><Trash2 /></Button>
          </div>
        ))}
        {data && data.total === 0 && <div className="p-6"><EmptyState title="Belum ada komentar" /></div>}
      </div>
      {data && <div className="mt-6"><Pager page={data.page} pages={data.pages} onChange={setPage} testid="pager-admin-comments" /></div>}
    </>
  );
}
