import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "hsl(var(--color-paper) / <alpha-value>)",
        ink: "hsl(var(--color-ink) / <alpha-value>)",
        charcoal: "hsl(var(--color-charcoal) / <alpha-value>)",
        stone: "hsl(var(--color-stone) / <alpha-value>)",
        mist: "hsl(var(--color-mist) / <alpha-value>)",
        vermilion: "hsl(var(--color-vermilion) / <alpha-value>)",
        bamboo: "hsl(var(--color-bamboo) / <alpha-value>)",
        wood: "hsl(var(--color-wood) / <alpha-value>)",
      },
      fontFamily: {
        serif: [
          "Cormorant Garamond",
          "Iowan Old Style",
          "Georgia",
          "Cambria",
          "Times New Roman",
          "serif",
        ],
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
      },
      boxShadow: {
        soft: "0 24px 80px hsl(var(--color-ink) / 0.08)",
        line: "0 1px 0 hsl(var(--color-ink) / 0.08)",
      },
      backgroundImage: {
        tatami:
          "linear-gradient(90deg, hsl(var(--color-ink) / 0.045) 1px, transparent 1px), linear-gradient(0deg, hsl(var(--color-ink) / 0.035) 1px, transparent 1px)",
        paper:
          "linear-gradient(135deg, hsl(var(--color-paper)) 0%, hsl(var(--color-mist)) 48%, hsl(var(--color-paper)) 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
