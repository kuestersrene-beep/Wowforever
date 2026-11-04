import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        horde: {
          DEFAULT: "#a11f2b",
          dark: "#6e141d",
        },
        allianz: {
          DEFAULT: "#2b5f9e",
          dark: "#1b3d68",
        },
        // Akzentfarbe der Gilde (Black Cocoon: Schwarz und Giftgrün). Der
        // Name "gold" stammt aus dem ersten Design und wird überall
        // verwendet - umbenannt wird er bewusst nicht, nur umgefärbt.
        gold: {
          DEFAULT: "#8be04e",
          light: "#a6e86f",
          dark: "#4f8a2a",
        },
        // Hinweise und Warnungen ("Heiler gesucht", Beta-Tool)
        amber: {
          soft: "#f2b66b",
        },
        ink: "#0a0c09",
        panel: "#12160f",
        "panel-2": "#181d14",
        line: "#26301f",
        parchment: "#e9e6da",
        muted: "#a4ac98",
      },
      fontFamily: {
        heading: ["var(--font-heading)", ...defaultTheme.fontFamily.serif],
        sans: ["var(--font-body)", ...defaultTheme.fontFamily.sans],
      },
      backgroundImage: {
        "wow-radial":
          "radial-gradient(ellipse at top, #141a10 0%, #0d100b 45%, #0a0c09 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
