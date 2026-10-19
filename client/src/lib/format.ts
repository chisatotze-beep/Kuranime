import { SEASON_LABEL } from "@shared/utils";

export function formatSize(bytes?: number | null) {
  if (!bytes) return "";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 100 || i < 2 ? 0 : 1)} ${u[i]}`;
}
export const seasonLabel = (s?: string | null, y?: number | null) =>
  s ? `${SEASON_LABEL[s] || s}${y ? " " + y : ""}` : y ? String(y) : "";
export const compact = (n?: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 }).format(n);
export const num = (n?: number | null) => (n == null ? "—" : new Intl.NumberFormat("id-ID").format(n));
export function copyText(t: string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(t).catch(() => fallbackCopy(t));
  fallbackCopy(t);
  return Promise.resolve();
}
function fallbackCopy(t: string) {
  const ta = document.createElement("textarea");
  ta.value = t;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); } catch {}
  ta.remove();
}
