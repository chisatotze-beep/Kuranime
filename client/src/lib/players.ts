export type Player = {
  id: string;
  name: string;
  platform: string;
  build: (url: string, title: string) => string;
};

const intent = (pkg: string) => (url: string, title: string) => {
  const u = new URL(url);
  const rest = url.slice(u.protocol.length + 2); // host/path?query
  const fallback = encodeURIComponent(`https://play.google.com/store/apps/details?id=${pkg}`);
  return `intent://${rest}#Intent;scheme=${u.protocol.replace(":", "")};action=android.intent.action.VIEW;type=video/*;package=${pkg};S.title=${encodeURIComponent(title)};S.browser_fallback_url=${fallback};end`;
};

export const PLAYERS: Player[] = [
  { id: "mx", name: "MX Player", platform: "Android", build: intent("com.mxtech.videoplayer.ad") },
  { id: "mxpro", name: "MX Player Pro", platform: "Android", build: intent("com.mxtech.videoplayer.pro") },
  { id: "vlc", name: "VLC", platform: "Android", build: intent("org.videolan.vlc") },
  { id: "mpv", name: "mpv", platform: "Android", build: intent("is.xyz.mpv") },
  { id: "just", name: "Just Player", platform: "Android", build: intent("com.brouken.player") },
  { id: "nplayer", name: "nPlayer", platform: "Android / iOS", build: (u) => `nplayer-${u}` },
  { id: "vlcios", name: "VLC", platform: "iOS", build: (u) => `vlc-x-callback://x-callback-url/stream?url=${encodeURIComponent(u)}` },
  { id: "infuse", name: "Infuse", platform: "iOS / Apple TV", build: (u) => `infuse://x-callback-url/play?url=${encodeURIComponent(u)}` },
  { id: "outplayer", name: "Outplayer", platform: "iOS", build: (u) => `outplayer://${u}` },
  { id: "potplayer", name: "PotPlayer", platform: "Windows", build: (u) => `potplayer://${u}` },
  { id: "iina", name: "IINA", platform: "macOS", build: (u) => `iina://weblink?url=${encodeURIComponent(u)}` },
];

export function playersFor(enabled: string[]) {
  return PLAYERS.filter((p) => enabled.includes(p.id));
}

/** Tebak pemutar default sesuai perangkat */
export function guessDefaultPlayer(enabled: Player[]): string | undefined {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const pick = (ids: string[]) => ids.find((id) => enabled.some((p) => p.id === id));
  if (/Android/i.test(ua)) return pick(["mx", "vlc", "mpv", "just"]);
  if (/iPhone|iPad|iPod/i.test(ua)) return pick(["vlcios", "infuse", "outplayer", "nplayer"]);
  if (/Windows/i.test(ua)) return pick(["potplayer"]);
  if (/Mac OS/i.test(ua)) return pick(["iina", "infuse"]);
  return enabled[0]?.id;
}

export function openExternal(href: string) {
  const inFrame = (() => { try { return window.self !== window.top; } catch { return true; } })();
  const a = document.createElement("a");
  a.href = href;
  a.rel = "noopener noreferrer";
  if (inFrame) a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
