export type Theme = "light" | "dark";
export const accents = ["orange", "cobalt", "jade", "violet", "rose", "playstation", "switch", "xbox", "pink"] as const;
export type Accent = typeof accents[number];

export function storedTheme(): Theme {
  try { const value = localStorage.getItem("brief-theme"); if (value === "light" || value === "dark") return value; } catch { /* Storage is optional. */ }
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
export function storedAccent(): Accent {
  try { const value = localStorage.getItem("brief-accent"); if (accents.includes(value as Accent)) return value as Accent; } catch { /* Storage is optional. */ }
  return "orange";
}
