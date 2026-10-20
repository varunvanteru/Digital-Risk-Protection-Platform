export type Palette = "crimson" | "slate";
export type Mode = "system" | "light" | "dark";

export const PALETTES: { id: Palette; name: string; note: string; swatch: [string, string, string] }[] = [
  { id: "crimson", name: "Crimson", note: "Soft white, raised cards, crimson titles", swatch: ["#eef1f5", "#ffffff", "#d40000"] },
  { id: "slate", name: "Slate", note: "Cool grey, deep navy", swatch: ["#f6f7f9", "#cfd4dc", "#1f3a5f"] },
];

// v4: Crimson / light is the default again, so earlier saved choices start fresh.
export const THEME_KEY = "brandshield-theme-v4";

export interface ThemePref {
  palette: Palette;
  mode: Mode;
}

export const DEFAULT_THEME: ThemePref = { palette: "crimson", mode: "light" };

export function readTheme(): ThemePref {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (!raw) return DEFAULT_THEME;
    const v = JSON.parse(raw) as Partial<ThemePref>;
    return {
      palette: PALETTES.some((p) => p.id === v.palette) ? (v.palette as Palette) : DEFAULT_THEME.palette,
      mode: v.mode === "light" || v.mode === "dark" || v.mode === "system" ? v.mode : DEFAULT_THEME.mode,
    };
  } catch {
    return DEFAULT_THEME;
  }
}

export function resolvedMode(mode: Mode): "light" | "dark" {
  if (mode !== "system") return mode;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(pref: ThemePref) {
  const root = document.documentElement;
  root.dataset.palette = pref.palette;
  root.dataset.mode = resolvedMode(pref.mode);
  try {
    localStorage.setItem(THEME_KEY, JSON.stringify(pref));
  } catch {
    /* private mode: the choice just isn't remembered */
  }
}

/**
 * Runs before first paint (inlined in layout) so there is no flash of the wrong theme.
 * `?palette=slate&mode=dark` in the URL presets the theme, handy for demos and screenshots.
 */
// data-js marks that scripts run, which hides the no-JavaScript project summary (see ProjectSummary).
export const THEME_BOOT_SCRIPT = `(function(){document.documentElement.dataset.js="1";try{var p={palette:"${DEFAULT_THEME.palette}",mode:"${DEFAULT_THEME.mode}"};var r=localStorage.getItem("${THEME_KEY}");if(r){var v=JSON.parse(r);if(v&&v.palette)p.palette=v.palette;if(v&&v.mode)p.mode=v.mode;}var q=new URLSearchParams(location.search);var qp=q.get("palette"),qm=q.get("mode");if(${JSON.stringify(PALETTES.map((x) => x.id))}.indexOf(qp)>-1)p.palette=qp;if(["system","light","dark"].indexOf(qm)>-1)p.mode=qm;if(qp||qm)localStorage.setItem("${THEME_KEY}",JSON.stringify(p));var m=p.mode==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):p.mode;var d=document.documentElement;d.dataset.palette=p.palette;d.dataset.mode=m;}catch(e){}})();`;
