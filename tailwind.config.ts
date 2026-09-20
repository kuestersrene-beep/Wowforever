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
        gold: {
          DEFAULT: "#c9a86a",
          light: "#e4cf9a",
          dark: "#8a6f3f",
        },
        ink: "#0f0c0a",
        panel: "#1a140f",
        parchment: "#e8dfc9",
      },
      fontFamily: {
        heading: ["var(--font-heading)", ...defaultTheme.fontFamily.serif],
        sans: ["var(--font-body)", ...defaultTheme.fontFamily.sans],
      },
      backgroundImage: {
        "wow-radial":
          "radial-gradient(ellipse at top, #2a1d14 0%, #140f0b 45%, #0a0807 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
