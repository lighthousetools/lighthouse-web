import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const server = process.env.LIGHTHOUSE_URL ?? "http://127.0.0.1:8080";
// Every first path segment of the API goes to the server, so new endpoints work in development without a list here.
const spec = JSON.parse(readFileSync(new URL("./openapi.json", import.meta.url), "utf8")) as { paths: Record<string, unknown> };
const api = [...new Set(Object.keys(spec.paths).map((path) => `/${path.split("/")[1]}`))];

export default defineConfig({
  plugins: [react()],
  server: { proxy: Object.fromEntries(api.map((path) => [path, server])) },
  test: { environment: "jsdom", globals: true, setupFiles: ["src/test/setup.ts"] },
});
