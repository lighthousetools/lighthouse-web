import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const server = process.env.LIGHTHOUSE_URL ?? "http://127.0.0.1:8080";
const api = [
  "/health", "/openapi.json", "/auth", "/me", "/events", "/runs", "/agents", "/approvals", "/brain", "/credentials",
  "/tasks", "/ready", "/rules", "/memory", "/alerts", "/briefs", "/recaps", "/documents", "/automations",
  "/connectors", "/skills", "/costs", "/nodes", "/sessions", "/permissions",
];

export default defineConfig({
  plugins: [react()],
  server: { proxy: Object.fromEntries(api.map((path) => [path, server])) },
  test: { environment: "jsdom", globals: true, setupFiles: ["src/test/setup.ts"] },
});
