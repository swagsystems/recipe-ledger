import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#161514",
        panel: "#f8f5ed",
        line: "#ded6c7",
        herb: "#397a52",
        citrus: "#d8a124",
        tomato: "#b84c3f"
      }
    }
  },
  plugins: []
};

export default config;
