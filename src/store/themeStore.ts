import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ThemeState {
  theme: "dark" | "light" | "system";
  accentColor: string;
  setTheme: (t: "dark" | "light" | "system") => void;
  setAccentColor: (c: string) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: "dark",
      accentColor: "violet",
      setTheme: (theme) => set({ theme }),
      setAccentColor: (accentColor) => set({ accentColor }),
    }),
    { name: "confideq-theme" }
  )
);
