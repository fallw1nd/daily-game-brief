import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "/daily-game-brief/",
  plugins: [react()],
  test: {
    projects: [
      { extends: true, test: { name: "node", environment: "node", include: ["scripts/**/*.test.mjs"] } },
      { extends: true, test: { name: "ui", environment: "jsdom", include: ["src/**/*.test.{ts,tsx}"] } },
    ],
  },
});
