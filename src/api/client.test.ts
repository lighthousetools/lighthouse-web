import { beforeEach, describe, expect, it } from "vitest";
import { setLanguage } from "../i18n";
import { serve, json } from "../test/api";
import { ApiError, api, currentDevice, isSignedIn, must, statusOf, storeToken } from "./client";

beforeEach(() => storeToken(null));

describe("failed calls", () => {
  it("keep the server's message and the status", async () => {
    serve({ "GET /tenant/invitations": () => json(403, { error: "this needs the owner or admin role" }) });
    const error = await must(api.GET("/tenant/invitations")).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toBe("this needs the owner or admin role");
    expect(statusOf(error)).toBe(403);
    expect(statusOf(new Error("x"))).toBe(0);
  });

  it("explain the sign-in pause in the viewer's language", async () => {
    serve({ "POST /auth/login": () => json(429, { error: "too many attempts, try again later" }) });
    const body = { password: "x", device_name: "Browser", device_kind: "web" as const };
    await expect(must(api.POST("/auth/login", { body }))).rejects.toThrow("Too many attempts. Wait a minute and try again.");
    setLanguage("de");
    await expect(must(api.POST("/auth/login", { body }))).rejects.toThrow("Zu viele Versuche");
  });

  it("name the status when the server gives no reason", async () => {
    serve({ "GET /tenant": () => json(500) });
    await expect(must(api.GET("/tenant"))).rejects.toThrow("The server answered 500.");
  });
});

describe("the token", () => {
  it("names its device only while it is the token that device got", () => {
    storeToken("lht_from_the_web", "d1");
    expect(currentDevice()).toBe("d1");
    expect(localStorage.getItem("lighthouse.device")).toBe("d1:_the_web");
    // The Mac app writes its own token into storage; the remembered ID no longer describes it.
    localStorage.setItem("lighthouse.token", "lht_from_the_mac");
    expect(currentDevice()).toBeNull();
    storeToken("lht_native");
    expect(currentDevice()).toBeNull();
    expect(localStorage.getItem("lighthouse.device")).toBeNull();
  });

  it("is dropped when the server no longer accepts it", async () => {
    storeToken("lht_old", "d1");
    serve({ "GET /me": () => json(401, { error: "sign-in required" }) });
    await must(api.GET("/me")).catch(() => undefined);
    expect(isSignedIn()).toBe(false);
    expect(currentDevice()).toBeNull();
  });

  it("stays when only the current password was wrong", async () => {
    storeToken("lht_x", "d1");
    serve({ "POST /auth/password": () => json(401, { error: "wrong email or password" }) });
    await expect(must(api.POST("/auth/password", { body: { current: "nope", new: "a long new password" } }))).rejects.toThrow("wrong email or password");
    expect(isSignedIn()).toBe(true);
    expect(currentDevice()).toBe("d1");
  });
});
