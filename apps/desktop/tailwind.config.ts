import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/renderer/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink: "#111827",
        graphite: "#252A34",
        cloud: "#F7F8FA",
        mint: "#16A085",
        cobalt: "#2563EB",
        ember: "#EF4444"
      },
      boxShadow: {
        soft: "0 18px 60px rgba(15, 23, 42, 0.10)",
        panel: "0 1px 0 rgba(15, 23, 42, 0.06), 0 18px 50px rgba(15, 23, 42, 0.08)"
      }
    }
  },
  plugins: []
} satisfies Config;
