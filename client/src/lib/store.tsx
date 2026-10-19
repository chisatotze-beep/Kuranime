import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { setAuthToken, api, queryClient } from "./queryClient";
import { DEFAULT_SETTINGS } from "@shared/utils";
import type { PublicUser, SiteSettings } from "@shared/schema";

export type Filters = {
  q: string;
  genres: string[];
  exclude: string[];
  studio: string;
  season: string;
  year: string;
  type: string;
  status: string;
  rating: string;
  source: string;
  quality: string;
  sort: string;
  page: number;
};
export const EMPTY_FILTERS: Filters = {
  q: "", genres: [], exclude: [], studio: "", season: "", year: "", type: "", status: "", rating: "", source: "", quality: "", sort: "added", page: 1,
};

type Ctx = {
  theme: "dark" | "light";
  toggleTheme: () => void;
  filters: Filters;
  setFilters: (f: Partial<Filters>, keepPage?: boolean) => void;
  resetFilters: (f?: Partial<Filters>) => void;
  user: PublicUser | null;
  login: (token: string, user: PublicUser) => void;
  logout: () => void;
  /** hapus sesi lokal tanpa memanggil server (sesi sudah dicabut / kedaluwarsa) */
  expire: () => void;
  patchUser: (p: Partial<PublicUser>) => void;
  site: SiteSettings;
  player: string | undefined;
  setPlayer: (id: string) => void;
  commentName: string;
  setCommentName: (n: string) => void;
};
const AppCtx = createContext<Ctx>(null as any);

export function AppProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<"dark" | "light">(() =>
    window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark",
  );
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const [filters, setF] = useState<Filters>(EMPTY_FILTERS);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [player, setPlayer] = useState<string | undefined>(undefined);
  const [commentName, setCommentName] = useState("");
  const { data: site } = useQuery<SiteSettings>({ queryKey: ["/api/site"] });

  useEffect(() => {
    if (site?.siteName) document.title = `${site.siteName} — Download Anime`;
  }, [site?.siteName]);

  const value: Ctx = {
    theme,
    toggleTheme: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
    filters,
    setFilters: (f, keepPage) => setF((prev) => ({ ...prev, ...f, page: keepPage ? (f.page ?? prev.page) : f.page ?? 1 })),
    resetFilters: (f) => setF({ ...EMPTY_FILTERS, ...(f || {}) }),
    user,
    login: (token, u) => { setAuthToken(token); setUser(u); },
    logout: () => {
      api("POST", "/api/auth/logout").catch(() => {}).finally(() => setAuthToken(null));
      setUser(null);
      queryClient.removeQueries({ predicate: (q) => /^\/api\/(admin|auth\/me)/.test(String(q.queryKey[0])) });
    },
    expire: () => {
      setAuthToken(null);
      setUser(null);
      queryClient.removeQueries({ predicate: (q) => /^\/api\/(admin|auth\/me)/.test(String(q.queryKey[0])) });
    },
    patchUser: (p) => setUser((u) => (u ? { ...u, ...p } : u)),
    site: site || DEFAULT_SETTINGS,
    player,
    setPlayer,
    commentName,
    setCommentName,
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
export const useApp = () => useContext(AppCtx);
