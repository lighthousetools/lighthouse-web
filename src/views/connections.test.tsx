import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { storeToken } from "../api/client";
import { OWNER, serve, show } from "../test/api";
import { Connections } from "./Connections";

const LINEAR = { name: "linear", auth: "oauth", connected: false, read_tools: ["list_issues"], draft_tools: [] };

beforeEach(() => {
  storeToken("lht_x");
  location.hash = "#connections";
});

describe("connections by role", () => {
  it("let owners and admins connect a service", async () => {
    serve({ "GET /connectors": () => [LINEAR] });
    show(<Connections />);
    expect(await screen.findByRole("button", { name: "Connect linear" })).toBeTruthy();
  });

  it("show members the state without a way to connect", async () => {
    serve({ "GET /connectors": () => [LINEAR], "GET /me": () => ({ ...OWNER, role: "member" }) });
    show(<Connections />);
    expect(await screen.findByText("Linear")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Connect linear" })).toBeNull();
  });
});
