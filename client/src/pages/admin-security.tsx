import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import {
  ShieldCheck, ShieldAlert, Smartphone, Monitor, LogIn, LogOut, KeyRound, Trash2, Film, Settings, Users, MessageCircle,
  RefreshCw, AlertTriangle, CheckCircle2, Circle, Loader2, Copy, Link2,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { api, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import type { SecurityOverview, AuditRow } from "@shared/schema";

function Head({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
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

/* ---------- waktu relatif singkat ---------- */
export function ago(t?: number | null) {
  if (!t) return "—";
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "baru saja";
  if (s < 3600) return `${Math.floor(s / 60)} mnt lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} hari lalu`;
  return new Date(t).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

/* ---------- indikator kekuatan password ---------- */
const COMMON = ["password", "12345678", "qwerty", "admin", "anime", "rahasia", "bismillah", "indonesia", "iloveyou"];
export function passwordScore(pw: string, username = "") {
  if (!pw) return { score: 0, label: "", tip: "Minimal 8 karakter" };
  if (pw.length < 8) return { score: 1, label: "Terlalu pendek", tip: `Kurang ${8 - pw.length} karakter lagi` };
  const low = pw.toLowerCase();
  if (COMMON.some((c) => low.includes(c)) || (username && low.includes(username.toLowerCase())))
    return { score: 1, label: "Mudah ditebak", tip: "Hindari kata umum atau username" };
  let s = 1;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  if (pw.length >= 16) s++;
  const score = Math.min(4, s);
  return { score, label: ["", "Lemah", "Cukup", "Kuat", "Sangat kuat"][score], tip: score < 3 ? "Tambah panjang, huruf besar, angka, atau simbol" : "Mantap" };
}
export function PasswordMeter({ pw, username }: { pw: string; username?: string }) {
  const r = passwordScore(pw, username);
  const color = ["bg-muted", "bg-destructive", "bg-amber-500", "bg-emerald-500", "bg-emerald-500"][r.score];
  return (
    <div className="space-y-1 pt-1" data-testid="password-meter">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => <div key={i} className={cn("h-1 flex-1 rounded-full transition-colors", i <= r.score ? color : "bg-muted")} />)}
      </div>
      <p className="text-xs text-muted-foreground">{r.label ? <><span className="font-medium text-foreground">{r.label}</span> · {r.tip}</> : r.tip}</p>
    </div>
  );
}

/* ---------- label aksi log ---------- */
const ACTION: Record<string, { label: string; icon: any; tone?: string }> = {
  "login.success": { label: "Masuk", icon: LogIn, tone: "text-emerald-600 dark:text-emerald-400" },
  "login.fail": { label: "Login gagal", icon: AlertTriangle, tone: "text-destructive" },
  logout: { label: "Keluar", icon: LogOut },
  "account.setup": { label: "Akun owner dibuat", icon: ShieldCheck },
  "password.change": { label: "Ganti password", icon: KeyRound },
  "2fa.enable": { label: "2FA diaktifkan", icon: ShieldCheck, tone: "text-emerald-600 dark:text-emerald-400" },
  "2fa.disable": { label: "2FA dimatikan", icon: ShieldAlert, tone: "text-amber-600 dark:text-amber-400" },
  "session.revoke": { label: "Sesi dicabut", icon: LogOut },
  "anime.create": { label: "Tambah anime", icon: Film },
  "anime.update": { label: "Edit anime", icon: Film },
  "anime.delete": { label: "Hapus anime", icon: Trash2, tone: "text-destructive" },
  "source.add": { label: "Tambah sumber", icon: Link2 },
  "source.update": { label: "Edit sumber", icon: Link2 },
  "source.delete": { label: "Hapus sumber", icon: Trash2 },
  "settings.update": { label: "Ubah pengaturan", icon: Settings },
  "user.create": { label: "Tambah admin", icon: Users },
  "user.reset": { label: "Reset password admin", icon: KeyRound },
  "user.delete": { label: "Hapus admin", icon: Trash2, tone: "text-destructive" },
  "comment.delete": { label: "Hapus komentar", icon: MessageCircle },
  "sync.airing": { label: "Sinkron ongoing", icon: RefreshCw },
};

function StatusCard({ label, value, sub, tone = "default", testid }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "ok" | "warn" | "bad" | "default"; testid?: string }) {
  const dot = { ok: "bg-emerald-500", warn: "bg-amber-500", bad: "bg-destructive", default: "bg-muted-foreground/40" }[tone];
  return (
    <div className="rounded-xl border border-border bg-card p-4" data-testid={testid}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className={cn("h-1.5 w-1.5 rounded-full", dot)} />{label}</div>
      <div className="mt-1.5 text-lg font-semibold tabular">{value}</div>
      {sub && <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

/* ===================== Halaman Keamanan ===================== */
export function AdminSecurity() {
  const { user, logout } = useApp();
  const { toast } = useToast();
  const [filter, setFilter] = useState<"" | "login" | "anime" | "settings">("");
  const { data: d, isLoading } = useQuery<SecurityOverview>({ queryKey: ["/api/admin/security", { action: filter || undefined }], staleTime: 0 });
  const revoke = useMutation({
    mutationFn: (id: string) => api<{ self: boolean }>("DELETE", `/api/admin/security/sessions/${id}`),
    onSuccess: (r) => {
      if (r.self) return logout();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/security"] });
      toast({ title: "Sesi dicabut", description: "Perangkat itu harus login ulang." });
    },
    onError: (e: any) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });
  const others = useMutation({
    mutationFn: () => api("POST", "/api/admin/security/logout-others"),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/security"] }); toast({ title: "Perangkat lain sudah dikeluarkan" }); },
  });
  const isOwner = user?.role === "owner";
  const okCount = d?.checks.filter((c) => c.ok).length ?? 0;
  const total = d?.checks.length ?? 0;
  const level = !d ? "default" : okCount === total ? "ok" : okCount >= total - 1 ? "warn" : "bad";
  const mySessions = d?.sessions.filter((s) => s.userId === user?.id).length ?? 0;

  return (
    <>
      <Head
        title="Keamanan"
        sub={isOwner ? "Ringkasan keamanan semua akun admin, perangkat yang sedang login, dan riwayat aktivitas." : "Ringkasan keamanan akunmu, perangkat yang sedang login, dan riwayat aktivitas."}
      />
      {isLoading || !d ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />)}</div>
      ) : (
        <div className="space-y-6">
          {/* status */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatusCard testid="card-sec-score" label="Status" tone={level as any} value={level === "ok" ? "Aman" : level === "warn" ? "Hampir aman" : "Perlu perhatian"} sub={`${okCount} dari ${total} pemeriksaan lolos`} />
            <StatusCard testid="card-sec-2fa" label="2FA akunmu" tone={d.me.totpEnabled ? "ok" : "warn"} value={d.me.totpEnabled ? "Aktif" : "Belum aktif"} sub={d.me.totpEnabled ? "Login butuh kode dari HP" : <a href="#/admin/account" className="text-primary hover:underline">Aktifkan sekarang</a>} />
            <StatusCard testid="card-sec-sessions" label="Perangkat login" tone={mySessions > 3 ? "warn" : "ok"} value={mySessions} sub={isOwner && d.sessions.length !== mySessions ? `${d.sessions.length} total semua admin` : "dengan akunmu"} />
            <StatusCard testid="card-sec-failed" label="Login gagal 24 jam" tone={d.failed24h >= 10 ? "bad" : d.failed24h > 0 ? "warn" : "ok"} value={d.failed24h} sub={d.me.lastLogin ? `Login sebelumnya ${ago(d.me.lastLogin.at)}` : "Belum ada login sebelumnya"} />
          </div>

          <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
            {/* checklist */}
            <section className="rounded-xl border border-border bg-card">
              <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">Pemeriksaan</h2>
              <ul>
                {d.checks.map((c) => (
                  <li key={c.key} className="flex gap-3 border-b border-border px-4 py-3 last:border-0" data-testid={`check-${c.key}`}>
                    {c.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-emerald-500" /> : <Circle className="mt-0.5 h-4 w-4 flex-none text-amber-500" />}
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{c.label}</div>
                      <div className="text-xs text-muted-foreground">{c.hint}</div>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="border-t border-border bg-muted/40 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                Otomatis aktif: password di-hash (scrypt), token sesi di-hash, sesi habis 7 hari tidak dipakai, login dikunci 15 menit setelah 5x salah,
                dashboard otomatis keluar setelah 60 menit diam, link download hanya http/https, dan penjelajah index dibatasi ke domain yang diizinkan.
              </div>
            </section>

            {/* sesi */}
            <section className="rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
                <h2 className="text-sm font-semibold">Perangkat yang sedang login</h2>
                {mySessions > 1 && (
                  <Button size="sm" variant="ghost" onClick={() => others.mutate()} disabled={others.isPending} data-testid="button-logout-others">
                    Keluarkan perangkat lain
                  </Button>
                )}
              </div>
              <ul>
                {d.sessions.map((s) => {
                  const Icon = /Android|iOS/.test(s.device) ? Smartphone : Monitor;
                  return (
                    <li key={s.id} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0" data-testid={`row-session-${s.id}`}>
                      <Icon className="h-4 w-4 flex-none text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 text-sm">
                          <span className="font-medium">{s.device}</span>
                          {s.current && <span className="rounded bg-emerald-500/12 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-700 dark:text-emerald-300">Perangkat ini</span>}
                          {isOwner && s.userId !== user?.id && <span className="text-xs text-muted-foreground">· {s.username}</span>}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">{s.ip || "IP tidak diketahui"} · aktif {ago(s.lastSeen)} · login {ago(s.createdAt)}</div>
                      </div>
                      <Button size="sm" variant="ghost" className="flex-none text-muted-foreground hover:text-destructive" onClick={() => revoke.mutate(s.id)} data-testid={`button-revoke-${s.id}`}>
                        {s.current ? "Keluar" : "Cabut"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>

          {/* tim (owner) */}
          {isOwner && d.admins && d.admins.length > 1 && (
            <section className="rounded-xl border border-border bg-card">
              <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">Tim admin</h2>
              <ul className="grid sm:grid-cols-2">
                {d.admins.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 border-b border-border px-4 py-3 sm:[&:nth-last-child(-n+2)]:border-0" data-testid={`row-team-${a.id}`}>
                    <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/15 text-xs font-semibold uppercase text-primary">{a.username.slice(0, 2)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{a.username} <span className="text-xs font-normal capitalize text-muted-foreground">{a.role}</span></div>
                      <div className="text-xs text-muted-foreground">Login terakhir {ago(a.lastLogin)}</div>
                    </div>
                    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase", a.totpEnabled ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/12 text-amber-700 dark:text-amber-300")}>
                      {a.totpEnabled ? "2FA" : "Tanpa 2FA"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* log */}
          <section className="rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
              <h2 className="text-sm font-semibold">Aktivitas terbaru</h2>
              <div className="flex gap-1">
                {([["", "Semua"], ["login", "Login"], ["anime", "Anime"], ["settings", "Pengaturan"]] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setFilter(k)} className={cn("rounded-full px-2.5 py-1 text-xs transition-colors", filter === k ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent")} data-testid={`filter-audit-${k || "all"}`}>{l}</button>
                ))}
              </div>
            </div>
            {d.audit.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">Belum ada aktivitas.</p>
            ) : (
              <ul>{d.audit.map((e) => <AuditItem key={e.id} e={e} showUser={isOwner} />)}</ul>
            )}
            <p className="border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground">Log disimpan 90 hari.</p>
          </section>
        </div>
      )}
    </>
  );
}

function AuditItem({ e, showUser }: { e: AuditRow; showUser: boolean }) {
  const a = ACTION[e.action] || { label: e.action, icon: Circle };
  const Icon = a.icon;
  return (
    <li className="flex gap-3 border-b border-border px-4 py-2.5 last:border-0" data-testid={`row-audit-${e.id}`}>
      <Icon className={cn("mt-0.5 h-4 w-4 flex-none text-muted-foreground", a.tone)} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-1.5 text-sm">
          <span className="font-medium">{a.label}</span>
          {e.detail && <span className="min-w-0 truncate text-muted-foreground">· {e.detail}</span>}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {showUser && e.username ? `${e.username} · ` : ""}{e.ip ? `${e.ip} · ` : ""}<time title={new Date(e.at).toLocaleString("id-ID")}>{ago(e.at)}</time>
        </div>
      </div>
    </li>
  );
}

/* ===================== Akun: password + 2FA ===================== */
export function AccountSecurity() {
  const { user, patchUser } = useApp();
  const { toast } = useToast();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const pw = useMutation({
    mutationFn: () => api("POST", "/api/auth/password", { current: cur, next }),
    onSuccess: () => { setCur(""); setNext(""); toast({ title: "Password diganti", description: "Perangkat lain otomatis dikeluarkan." }); queryClient.invalidateQueries({ queryKey: ["/api/admin/security"] }); },
    onError: (e: any) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });
  const { data: me } = useQuery<any>({ queryKey: ["/api/auth/me"], staleTime: 0 });
  const enabled = me?.totpEnabled ?? user?.totpEnabled;

  return (
    <div className="grid max-w-4xl gap-6 lg:grid-cols-2">
      <form className="h-fit space-y-3 rounded-xl border border-border bg-card p-5" onSubmit={(e) => { e.preventDefault(); pw.mutate(); }}>
        <h2 className="text-sm font-semibold">Ganti password</h2>
        <div className="space-y-1.5"><Label htmlFor="pw-cur">Password lama</Label><Input id="pw-cur" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} data-testid="input-pw-current" /></div>
        <div className="space-y-1.5">
          <Label htmlFor="pw-new">Password baru</Label>
          <Input id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} data-testid="input-pw-new" />
          <PasswordMeter pw={next} username={user?.username} />
        </div>
        <Button type="submit" disabled={!cur || next.length < 8 || pw.isPending} data-testid="button-pw-save">Simpan</Button>
        <p className="text-xs text-muted-foreground">Setelah diganti, semua perangkat lain yang login dengan akun ini akan dikeluarkan.</p>
      </form>
      <TwoFactorCard enabled={!!enabled} onChange={(v) => { patchUser({ totpEnabled: v }); queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] }); queryClient.invalidateQueries({ queryKey: ["/api/admin/security"] }); }} />
    </div>
  );
}

function TwoFactorCard({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  const { toast } = useToast();
  const [setup, setSetup] = useState<{ secret: string; url: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [pass, setPass] = useState("");
  const start = useMutation({
    mutationFn: () => api<{ secret: string; url: string }>("POST", "/api/auth/2fa/setup"),
    onSuccess: async (r) => {
      const qr = await QRCode.toDataURL(r.url, { margin: 1, width: 360, color: { dark: "#111111", light: "#ffffff" } });
      setSetup({ ...r, qr });
    },
    onError: (e: any) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });
  const enable = useMutation({
    mutationFn: () => api("POST", "/api/auth/2fa/enable", { code }),
    onSuccess: () => { setSetup(null); setCode(""); onChange(true); toast({ title: "2FA aktif", description: "Login berikutnya akan meminta kode dari aplikasi authenticator." }); },
    onError: (e: any) => toast({ title: "Kode salah", description: e.message, variant: "destructive" }),
  });
  const disable = useMutation({
    mutationFn: () => api("POST", "/api/auth/2fa/disable", { password: pass, code }),
    onSuccess: () => { setPass(""); setCode(""); onChange(false); toast({ title: "2FA dimatikan" }); },
    onError: (e: any) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="h-fit space-y-3 rounded-xl border border-border bg-card p-5" data-testid="card-2fa">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Verifikasi 2 langkah (2FA)</h2>
        <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase", enabled ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground")} data-testid="badge-2fa">
          {enabled ? "Aktif" : "Mati"}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        Selain password, login juga butuh kode 6 digit dari aplikasi seperti Google Authenticator, Microsoft Authenticator, Aegis, atau 2FAS.
      </p>

      {!enabled && !setup && (
        <Button onClick={() => start.mutate()} disabled={start.isPending} data-testid="button-2fa-start">
          {start.isPending ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Aktifkan 2FA
        </Button>
      )}

      {!enabled && setup && (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); enable.mutate(); }}>
          <ol className="list-decimal space-y-1 pl-4 text-sm text-muted-foreground">
            <li>Scan QR ini dengan aplikasi authenticator.</li>
            <li>Masukkan kode 6 digit yang muncul.</li>
          </ol>
          <div className="flex flex-wrap items-center gap-4">
            <img src={setup.qr} alt="QR 2FA" className="h-36 w-36 rounded-lg border border-border bg-white p-1" data-testid="img-2fa-qr" />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="text-xs text-muted-foreground">Tidak bisa scan? Masukkan kode ini manual:</div>
              <button type="button" onClick={() => { navigator.clipboard?.writeText(setup.secret).catch(() => {}); toast({ title: "Kode disalin" }); }} className="flex max-w-full items-center gap-1.5 break-all rounded bg-muted px-2 py-1 text-left font-mono text-xs" data-testid="button-2fa-secret">
                {setup.secret.match(/.{1,4}/g)?.join(" ")} <Copy className="h-3 w-3 flex-none" />
              </button>
            </div>
          </div>
          <div className="flex gap-2">
            <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className="max-w-[140px] font-mono tracking-widest" data-testid="input-2fa-code" />
            <Button type="submit" disabled={code.length !== 6 || enable.isPending} data-testid="button-2fa-enable">Verifikasi</Button>
            <Button type="button" variant="ghost" onClick={() => { setSetup(null); setCode(""); }}>Batal</Button>
          </div>
        </form>
      )}

      {enabled && (
        <form className="space-y-2 border-t border-border pt-3" onSubmit={(e) => { e.preventDefault(); disable.mutate(); }}>
          <div className="text-xs text-muted-foreground">Untuk mematikan 2FA, masukkan password dan kode saat ini.</div>
          <div className="flex flex-wrap gap-2">
            <Input type="password" placeholder="Password" value={pass} onChange={(e) => setPass(e.target.value)} className="min-w-0 flex-1" data-testid="input-2fa-off-pass" />
            <Input inputMode="numeric" maxLength={6} placeholder="Kode" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className="w-24 font-mono" data-testid="input-2fa-off-code" />
            <Button type="submit" variant="outline" disabled={!pass || code.length !== 6 || disable.isPending} data-testid="button-2fa-disable">Matikan</Button>
          </div>
        </form>
      )}
    </div>
  );
}

/** Keluar otomatis setelah `minutes` tanpa aktivitas */
export function useIdleLogout(minutes: number, onIdle: () => void) {
  useEffect(() => {
    let t: any;
    const reset = () => { clearTimeout(t); t = setTimeout(onIdle, minutes * 60_000); };
    const ev = ["pointerdown", "keydown", "scroll", "touchstart"];
    ev.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => { clearTimeout(t); ev.forEach((e) => window.removeEventListener(e, reset)); };
  }, [minutes, onIdle]);
}
