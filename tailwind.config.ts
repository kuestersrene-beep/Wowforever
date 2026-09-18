import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        horde: "#c41f3b",
        allianz: "#0078ff",
      },
    },
  },
  plugins: [],
};

export default config;
