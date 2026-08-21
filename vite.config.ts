import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "/daily-game-brief/",
  plugins: [react()],
  test: {
    environment: "jsdom",
  },
});
