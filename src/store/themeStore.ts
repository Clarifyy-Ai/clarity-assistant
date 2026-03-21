import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ThemeState {
  accentColor: string;
  fontSize: string;
  density: string;
  setAccentColor: (c: string) => void;
  setFontSize: (f: string) => void;
  setDensity: (d: string) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      accentColor: "violet",
      fontSize: "Default",
      density: "Default",
      setAccentColor: (accentColor) => set({ accentColor }),
      setFontSize: (fontSize) => set({ fontSize }),
      setDensity: (density) => set({ density }),
    }),
    { name: "confideq-theme" }
  )
);
