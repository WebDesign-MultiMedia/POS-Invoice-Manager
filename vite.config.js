import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/",
  // Vite's dev server only serves the frontend — /api/* is a Vercel
  // serverless function, so `npm run dev` alone 404s on it. Proxying to
  // scripts/dev-api-server.js (see `npm run dev:api`) lets it work locally
  // without needing `vercel dev`'s Vercel-account login.
  server: {
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
  // Vitest: tests live in test/ (not api/, where Vercel would deploy them as
  // functions). Node by default; browser-side tests opt into jsdom per file.
  test: {
    include: ["test/**/*.test.js"],
    environment: "node",
    restoreMocks: false,
  },
});
