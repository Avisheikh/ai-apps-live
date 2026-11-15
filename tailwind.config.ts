import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: "#05080F",
        panel: "#0A1020",
        hairline: "#16233D",
        broadcast: {
          text: "#EAF2FF",
          secondary: "#8DA2C4",
          blue: "#2D7BFF",
          cyan: "#22D3EE",
          purple: "#8B5CF6",
          amber: "#F5A524",
          gray: "#5B6B86",
          red: "#F0524D",
          green: "#2BD576",
        },
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
