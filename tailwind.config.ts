import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        terminal: {
          ink: "#050b12",
          panel: "#0b1420",
          line: "#1c2d3d",
          muted: "#7f93a8",
          text: "#d9e7f2",
          cyan: "#38d3ff",
          green: "#35e19a",
          amber: "#f5c451",
          red: "#ff6874"
        }
      },
      boxShadow: {
        glow: "0 0 36px rgba(56, 211, 255, 0.12)"
      }
    }
  },
  plugins: []
};

export default config;
