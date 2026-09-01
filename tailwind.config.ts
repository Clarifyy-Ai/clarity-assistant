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
        /* Career Pilot brand palette */
        brand: {
          50:  "#EFF6FF",
          100: "#DBEAFE",
          200: "#BFDBFE",
          300: "#93C5FD",
          400: "#38BDF8",
          500: "#2563EB",
          600: "#1D4ED8",
          700: "#163B73",
          800: "#0F294F",
          900: "#0B1220",
          950: "#070B14",
        },
        navy: "#0B1220",
        "deep-blue": "#163B73",
        "electric-blue": "#2563EB",
        "sky-blue": "#38BDF8",
        accent: {
          DEFAULT: "#38BDF8",
          foreground: "#0B1220",
        },
        success: {
          DEFAULT: "#16A34A",
          foreground: "#ffffff",
        },
        warning: {
          DEFAULT: "#F59E0B",
          foreground: "#ffffff",
        },
        danger: {
          DEFAULT: "#DC2626",
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
          bg:     "rgba(11, 18, 32, 0.92)",
          border: "rgba(37, 99, 235, 0.38)",
          text:   "#e2e8f0",
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
        /* Career Pilot motion */
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
        overlay: "0 8px 32px rgba(11,18,32,0.55), 0 0 0 1px rgba(37,99,235,0.25)",
        "overlay-hover": "0 12px 40px rgba(11,18,32,0.65), 0 0 0 1px rgba(56,189,248,0.4)",
        glow: "0 0 20px rgba(37,99,235,0.4)",
        "glow-success": "0 0 20px rgba(22,163,74,0.4)",
        "glow-warning": "0 0 20px rgba(245,158,11,0.4)",
        "glow-danger":  "0 0 20px rgba(220,38,38,0.4)",
      },

      backgroundImage: {
        "shimmer-gradient":
          "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.05) 50%, transparent 100%)",
        "brand-gradient":
          "linear-gradient(135deg, #2563EB 0%, #38BDF8 100%)",
        "dark-glass":
          "linear-gradient(135deg, rgba(11,18,32,0.94) 0%, rgba(22,59,115,0.85) 100%)",
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
        "overlay-root":  "1100",
        "overlay-pip":   "9998",
        "overlay-above": "9999",
      },
    },
  },
  plugins: [animate, typography],
};

export default config;
