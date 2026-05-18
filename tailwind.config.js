/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: { center: true, padding: "1rem" },
    extend: {
      colors: {
        // Kept stable for incremental migration of legacy pages
        base: "#08080b",
        panel: "#0f0f15",
        border: "#23232b",
        purple: "#8b5cf6",
        orange: "#f97316",
        // Refined semantic system used by the rebuilt UI
        surface: {
          DEFAULT: "rgba(255,255,255,0.025)",
          hover: "rgba(255,255,255,0.045)",
          strong: "rgba(255,255,255,0.06)",
        },
        line: {
          DEFAULT: "rgba(255,255,255,0.08)",
          strong: "rgba(255,255,255,0.14)",
        },
        ink: {
          DEFAULT: "#fafafa",
          muted: "rgba(255,255,255,0.62)",
          faint: "rgba(255,255,255,0.40)",
        },
        brand: {
          DEFAULT: "#8b5cf6",
          soft: "rgba(139,92,246,0.14)",
          ring: "rgba(139,92,246,0.45)",
        },
        accent: { DEFAULT: "#f97316", soft: "rgba(249,115,22,0.14)" },
        success: { DEFAULT: "#22c55e", soft: "rgba(34,197,94,0.14)" },
        danger: { DEFAULT: "#ef4444", soft: "rgba(239,68,68,0.14)" },
        warn: { DEFAULT: "#eab308", soft: "rgba(234,179,8,0.14)" },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica",
          "Arial",
          "Apple Color Emoji",
          "Segoe UI Emoji",
        ],
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: { xl: "0.875rem", "2xl": "1.125rem", "3xl": "1.5rem" },
      boxShadow: {
        soft: "0 1px 2px rgba(0,0,0,0.4)",
        card: "0 2px 12px -4px rgba(0,0,0,0.5)",
        pop: "0 12px 40px -12px rgba(0,0,0,0.7)",
        glow: "0 0 32px -8px rgba(139,92,246,0.45)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.25s ease-out both",
        shimmer: "shimmer 1.4s infinite",
      },
    },
  },
  plugins: [],
};
