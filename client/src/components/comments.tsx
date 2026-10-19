import { useState } from "react";
import { useMutation, useQuery, keepPreviousData } from "@tanstack/react-query";
import { Loader2, MessageCircle, Reply, ShieldCheck, Trash2 } from "lucide-react";
import { api, queryClient } from "@/lib/queryClient";
import { useApp } from "@/lib/store";
import { Pager } from "@/components/site";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { CommentDTO } from "@shared/schema";

type Page = { items: CommentDTO[]; total: number; all: number; page: number; pages: number };

function timeAgo(t: number) {
  const s = Math.max(1, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return "baru saja";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} menit lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} hari lalu`;
  return new Date(t).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

function Avatar({ name, admin }: { name: string; admin?: boolean }) {
  // warna stabil dari nama
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return (
    <div
      className={cn("grid h-8 w-8 flex-none place-items-center rounded-full text-xs font-semibold uppercase", admin && "ring-2 ring-primary/60")}
      style={{ background: `hsl(${h} 45% 50% / 0.18)`, color: `hsl(${h} 55% 55%)` }}
      aria-hidden
    >
      {name.slice(0, 1)}
    </div>
  );
}

function Composer({ malId, parentId, onDone, autoFocus, compact }: { malId: number; parentId?: number; onDone?: () => void; autoFocus?: boolean; compact?: boolean }) {
  const { user, commentName, setCommentName } = useApp();
  const { toast } = useToast();
  const [body, setBody] = useState("");
  const [hp, setHp] = useState("");
  const m = useMutation({
    mutationFn: () => api("POST", `/api/anime/${malId}/comments`, { name: commentName, body, parentId: parentId ?? null, website: hp }),
    onSuccess: () => {
      setBody("");
      queryClient.invalidateQueries({ queryKey: ["/api/anime", malId, "comments"] });
      onDone?.();
    },
    onError: (e: any) => toast({ title: "Komentar gagal dikirim", description: e.message, variant: "destructive" }),
  });
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (body.trim().length >= 2) m.mutate(); }}
      className={cn("rounded-xl border border-border bg-card", compact ? "p-3" : "p-4")}
      data-testid={parentId ? `form-reply-${parentId}` : "form-comment"}
    >
      {/* honeypot anti-bot */}
      <input tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} className="hidden" aria-hidden name="website" />
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={parentId ? "Tulis balasan…" : "Gimana pendapatmu soal anime ini? Ada masalah link? Tulis di sini…"}
        rows={compact ? 2 : 3}
        maxLength={1500}
        autoFocus={autoFocus}
        className="resize-none border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
        data-testid={parentId ? `input-reply-${parentId}` : "input-comment"}
      />
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        {user ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5 text-primary" /> Sebagai <b className="text-foreground">{user.username}</b> ({user.role})</span>
        ) : (
          <Input value={commentName} onChange={(e) => setCommentName(e.target.value)} placeholder="Nama (opsional)" maxLength={32} className="h-8 w-40 text-sm" data-testid="input-comment-name" />
        )}
        <span className="ml-auto text-[11px] text-muted-foreground tabular">{body.length}/1500</span>
        {onDone && <Button type="button" size="sm" variant="ghost" onClick={onDone}>Batal</Button>}
        <Button type="submit" size="sm" disabled={body.trim().length < 2 || m.isPending} data-testid={parentId ? `button-send-reply-${parentId}` : "button-send-comment"}>
          {m.isPending && <Loader2 className="animate-spin" />} Kirim
        </Button>
      </div>
    </form>
  );
}

function CommentItem({ c, malId, isReply }: { c: CommentDTO; malId: number; isReply?: boolean }) {
  const { user } = useApp();
  const [replying, setReplying] = useState(false);
  const { toast } = useToast();
  const del = useMutation({
    mutationFn: () => api("DELETE", `/api/admin/comments/${c.id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/anime", malId, "comments"] }); toast({ title: "Komentar dihapus" }); },
  });
  return (
    <div className="flex gap-3" data-testid={`comment-${c.id}`}>
      <Avatar name={c.name} admin={c.isAdmin} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
          <span className="font-medium">{c.name}</span>
          {c.isAdmin && <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">Admin</span>}
          <span className="text-xs text-muted-foreground">{timeAgo(c.createdAt)}</span>
        </div>
        <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-foreground/90 [overflow-wrap:anywhere]">{c.body}</p>
        <div className="mt-1.5 flex items-center gap-3">
          {!isReply && (
            <button onClick={() => setReplying(!replying)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" data-testid={`button-reply-${c.id}`}>
              <Reply className="h-3.5 w-3.5" /> Balas
            </button>
          )}
          {user && (
            <button onClick={() => del.mutate()} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive" data-testid={`button-delete-comment-${c.id}`}>
              <Trash2 className="h-3.5 w-3.5" /> Hapus
            </button>
          )}
        </div>
        {replying && <div className="mt-3"><Composer malId={malId} parentId={c.id} onDone={() => setReplying(false)} autoFocus compact /></div>}
        {c.replies.length > 0 && (
          <div className="mt-4 space-y-4 border-l border-border pl-4">
            {c.replies.map((r) => <CommentItem key={r.id} c={r} malId={malId} isReply />)}
          </div>
        )}
      </div>
    </div>
  );
}

export function Comments({ malId }: { malId: number }) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery<Page>({
    queryKey: ["/api/anime", malId, "comments", { page }],
    placeholderData: keepPreviousData,
  });
  const go = (p: number) => { setPage(p); document.getElementById("comments")?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  return (
    <section id="comments" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-14 sm:px-6">
      <div className="max-w-3xl">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <MessageCircle className="h-5 w-5 text-muted-foreground" /> Diskusi
          {data && data.all > 0 && <span className="text-sm font-normal text-muted-foreground tabular" data-testid="text-comment-count">{data.all}</span>}
        </h2>
        <div className="mt-4"><Composer malId={malId} /></div>
        <div className="mt-8 space-y-6">
          {isLoading && Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex gap-3"><div className="h-8 w-8 animate-pulse rounded-full bg-muted" /><div className="flex-1 space-y-2"><div className="h-3 w-32 animate-pulse rounded bg-muted" /><div className="h-3 w-3/4 animate-pulse rounded bg-muted" /></div></div>
          ))}
          {data && data.items.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Belum ada komentar. Jadi yang pertama.</p>}
          {data?.items.map((c) => <CommentItem key={c.id} c={c} malId={malId} />)}
        </div>
        {data && <div className="mt-8"><Pager page={data.page} pages={data.pages} onChange={go} testid="pager-comments" /></div>}
      </div>
    </section>
  );
}
