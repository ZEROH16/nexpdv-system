import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#111827",
        cloud: "#F7F8FA",
        mint: "#16A085",
        cobalt: "#2563EB"
      },
      boxShadow: {
        panel: "0 1px 0 rgba(15, 23, 42, 0.06), 0 18px 50px rgba(15, 23, 42, 0.08)"
      }
    }
  },
  plugins: []
} satisfies Config;
