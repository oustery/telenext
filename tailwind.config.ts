import type { Config } from "tailwindcss";
const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        tg: {
          bg: "#17212b",
          panel: "#17212b",
          header: "#17212b",
          hover: "#202e3a",
          active: "#2b5278",
          bubbleOut: "#2b5278",
          bubbleIn: "#182533",
          text: "#f5f5f5",
          muted: "#a8b3c0",
          accent: "#40a7e3",
        },
      },
    },
  },
  plugins: [],
};
export default config;
