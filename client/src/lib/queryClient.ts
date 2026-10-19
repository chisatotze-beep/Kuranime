import { QueryClient, QueryFunction } from "@tanstack/react-query";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

// Token sesi admin disimpan di memori (iframe sandbox memblokir storage)
let authToken: string | null = null;
export function setAuthToken(t: string | null) { authToken = t; }
export function getAuthToken() { return authToken; }
// dipanggil saat server bilang sesi sudah tidak berlaku (dicabut / kedaluwarsa)
let onExpired: (() => void) | null = null;
export function setOnSessionExpired(fn: (() => void) | null) { onExpired = fn; }

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    let msg = res.statusText;
    let data: any = null;
    try {
      const t = await res.text();
      try { data = JSON.parse(t); msg = data.message || t; } catch { msg = t || msg; }
    } catch {}
    if (res.status === 401 && data?.code === "SESSION_EXPIRED" && authToken) onExpired?.();
    if (res.status === 429 && !data) msg = "Terlalu banyak permintaan, tunggu sebentar.";
    const err = new Error(msg) as Error & { status?: number; data?: any };
    err.status = res.status;
    err.data = data;
    throw err;
  }
}

function headers(json: boolean): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h["Content-Type"] = "application/json";
  if (authToken) h["Authorization"] = `Bearer ${authToken}`;
  return h;
}

export async function apiRequest(method: string, url: string, data?: unknown): Promise<Response> {
  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers: headers(data !== undefined),
    body: data !== undefined ? JSON.stringify(data) : undefined,
  });
  await throwIfResNotOk(res);
  return res;
}
export async function api<T = any>(method: string, url: string, data?: unknown): Promise<T> {
  const r = await apiRequest(method, url, data);
  return r.json();
}

/** queryKey: ["/api/anime", {q:"..."}] -> /api/anime?q=... ; ["/api/anime", 123] -> /api/anime/123 */
export function keyToUrl(queryKey: readonly unknown[]) {
  let path = "";
  const params = new URLSearchParams();
  for (const part of queryKey) {
    if (part && typeof part === "object") {
      for (const [k, v] of Object.entries(part as Record<string, unknown>)) {
        if (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length)) continue;
        params.set(k, Array.isArray(v) ? v.join(",") : String(v));
      }
    } else if (part !== undefined && part !== null) {
      path += (path && !String(part).startsWith("/") ? "/" : "") + String(part);
    }
  }
  const qs = params.toString();
  return path + (qs ? `?${qs}` : "");
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: { on401: UnauthorizedBehavior }) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(`${API_BASE}${keyToUrl(queryKey)}`, { headers: headers(false) });
    if (unauthorizedBehavior === "returnNull" && res.status === 401) return null;
    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 60_000,
      retry: false,
    },
    mutations: { retry: false },
  },
});
