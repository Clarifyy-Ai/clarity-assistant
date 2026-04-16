import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";
import typography from "@tailwindcss/typography";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx,js,jsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        /* Clarify AI Brand Palette */
        brand: {
          50:  "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#6366f1", // Primary
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81",
          950: "#1e1b4b",
        },
        accent: {
          DEFAULT: "#06b6d4", // Cyan — live session accent
          foreground: "#ffffff",
        },
        success: {
          DEFAULT: "#10b981",
          foreground: "#ffffff",
        },
        warning: {
          DEFAULT: "#f59e0b",
          foreground: "#ffffff",
        },
        danger: {
          DEFAULT: "#ef4444",
          foreground: "#ffffff",
        },

        /* shadcn/ui semantic tokens — CSS variable driven */
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },

        /* Sidebar — CSS variable driven */
        "sidebar-background": "hsl(var(--sidebar-background))",
        "sidebar-foreground": "hsl(var(--sidebar-foreground))",
        "sidebar-border": "hsl(var(--sidebar-border))",
        "sidebar-accent": "hsl(var(--sidebar-accent))",
        "sidebar-accent-foreground": "hsl(var(--sidebar-accent-foreground))",
        "sidebar-ring": "hsl(var(--sidebar-ring))",

        /* Overlay-specific — glass dark panel */
        overlay: {
          bg:     "rgba(10, 10, 20, 0.88)",
          border: "rgba(99, 102, 241, 0.35)",
          text:   "#e0e7ff",
        },
      },

      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "calc(var(--radius) + 4px)",
        "2xl": "calc(var(--radius) + 8px)",
      },

      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },

      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "0.875rem" }],
      },

      keyframes: {
        /* shadcn base */
        "accordion-down": {
          from: { height: "0" },
          to:   { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to:   { height: "0" },
        },
        /* Custom Clarify AI */
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        "fade-out": {
          from: { opacity: "1" },
          to:   { opacity: "0" },
        },
        "slide-in-right": {
          from: { transform: "translateX(100%)", opacity: "0" },
          to:   { transform: "translateX(0)",    opacity: "1" },
        },
        "slide-up": {
          from: { transform: "translateY(12px)", opacity: "0" },
          to:   { transform: "translateY(0)",    opacity: "1" },
        },
        "pulse-ring": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(245,158,11,0.6)" },
          "50%":       { boxShadow: "0 0 0 8px rgba(245,158,11,0)" },
        },
        "badge-pop": {
          "0%":   { transform: "scale(0.5)", opacity: "0" },
          "70%":  { transform: "scale(1.15)" },
          "100%": { transform: "scale(1)",   opacity: "1" },
        },
        "stream-cursor": {
          "0%, 100%": { opacity: "1" },
          "50%":       { opacity: "0" },
        },
        "breathing": {
          "0%, 100%": { transform: "scale(1)",    opacity: "0.7" },
          "50%":       { transform: "scale(1.25)", opacity: "1"   },
        },
        "network-ping": {
          "0%":   { transform: "scale(1)",   opacity: "1" },
          "100%": { transform: "scale(2.5)", opacity: "0" },
        },
        shimmer: {
          from: { backgroundPosition: "-200% 0" },
          to:   { backgroundPosition: "200% 0"  },
        },
      },

      animation: {
        "accordion-down":  "accordion-down 0.2s ease-out",
        "accordion-up":    "accordion-up 0.2s ease-out",
        "fade-in":         "fade-in 0.2s ease-out",
        "fade-out":        "fade-out 0.15s ease-in",
        "slide-in-right":  "slide-in-right 0.25s ease-out",
        "slide-up":        "slide-up 0.2s ease-out",
        "pulse-ring":      "pulse-ring 1.8s ease-in-out infinite",
        "badge-pop":       "badge-pop 0.45s cubic-bezier(0.34,1.56,0.64,1)",
        "stream-cursor":   "stream-cursor 0.9s step-end infinite",
        "breathing":       "breathing 4s ease-in-out infinite",
        "network-ping":    "network-ping 1.2s ease-out infinite",
        shimmer:           "shimmer 2s linear infinite",
      },

      backdropBlur: {
        xs: "2px",
      },

      boxShadow: {
        overlay: "0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.25)",
        "overlay-hover": "0 12px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(99,102,241,0.5)",
        glow: "0 0 20px rgba(99,102,241,0.4)",
        "glow-success": "0 0 20px rgba(16,185,129,0.4)",
        "glow-warning": "0 0 20px rgba(245,158,11,0.4)",
        "glow-danger":  "0 0 20px rgba(239,68,68,0.4)",
      },

      backgroundImage: {
        "shimmer-gradient":
          "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.05) 50%, transparent 100%)",
        "brand-gradient":
          "linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)",
        "dark-glass":
          "linear-gradient(135deg, rgba(15,15,30,0.9) 0%, rgba(20,20,45,0.85) 100%)",
      },

      transitionTimingFunction: {
        spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },

      zIndex: {
        overlay:         "40",
        modal:           "50",
        toast:           "60",
        dropdown:        "500",
        tooltip:         "400",
        banner:          "300",
        "overlay-pip":   "9998",
        "overlay-above": "9999",
      },
    },
  },
  plugins: [animate, typography],
};

export default config;
