import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Navy + rose identity (kept per user preference). Navy carries
        // structure/ink; pink is the single accent for actions & "where Exa acts".
        nccn: {
          navy: "#1e3a5f",
          blue: "#2c5282",
          slate: "#4a6785",
          pink: "#d6417f", // slightly deepened rose for AA contrast on white
          ink: "#0f172a",
        },
        paper: "#eef2f7",
        line: "#e2e8f0",
        grounded: "#0f7a5e",
      },
      fontFamily: {
        // One sans across the UI (product register). Mono is reserved for
        // clinical data — lab values, dates, NCCN categories.
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
        display: ["var(--font-body)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
