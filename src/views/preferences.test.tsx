import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { storeToken } from "../api/client";
import { OWNER, callsTo, serve, show } from "../test/api";
import { Preferences } from "./Preferences";

const VALUES = [
  { key: "timezone", value: "Europe/Berlin", source: "instance" },
  { key: "talk.agent", value: null, source: "instance" },
  { key: "notifications", value: { deliver: ["owner"], decisions: true, done: false, alerts: "critical" }, source: "personal" },
];

const ok = () => new Response(null, { status: 204 });

beforeEach(() => {
  storeToken("lht_x");
});

describe("preferences", () => {
  it("save a person's own choice and reset it", async () => {
    const calls = serve({
      "GET /settings/values": () => VALUES,
      "GET /me": () => ({ ...OWNER, role: "member" }),
      "PUT /settings/me/values/notifications": ok,
      "DELETE /settings/me/values/notifications": ok,
    });
    show(<Preferences />);
    fireEvent.click(await screen.findByRole("switch", { name: "A run finished" }));
    await waitFor(() => expect(callsTo(calls, "PUT", "/settings/me/values/notifications")).toHaveLength(1));
    expect(await callsTo(calls, "PUT", "/settings/me/values/notifications")[0]!.json()).toEqual({ deliver: ["owner"], decisions: true, done: true, alerts: "critical" });
    fireEvent.click(screen.getByRole("button", { name: "Reset to the default" }));
    await waitFor(() => expect(callsTo(calls, "DELETE", "/settings/me/values/notifications")).toHaveLength(1));
  });

  it("let owners choose the workspace layer", async () => {
    const calls = serve({ "GET /settings/values": () => VALUES, "PUT /settings/tenant/values/language": ok });
    show(<Preferences />);
    fireEvent.click(await screen.findByRole("button", { name: "Whole workspace" }));
    fireEvent.click(screen.getByRole("button", { name: "Deutsch" }));
    await waitFor(() => expect(callsTo(calls, "PUT", "/settings/tenant/values/language")).toHaveLength(1));
    expect(await callsTo(calls, "PUT", "/settings/tenant/values/language")[0]!.json()).toBe("de");
  });
});
