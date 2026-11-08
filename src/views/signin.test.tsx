import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { authHeader, isSignedIn, storeToken } from "../api/client";
import { App } from "../shell/App";
import { callsTo, json, serve, show } from "../test/api";

const ISSUED = { id: "d1", token: "lht_new", tenant_id: "t1", user_id: "u1" };
const status = (signup: string, email_required: boolean) => () => ({ setup_required: false, signup, email_required });

beforeEach(() => {
  storeToken(null);
  location.hash = "";
});

describe("sign-in with email", () => {
  it("asks for the email once the server has several people and sends it", async () => {
    const calls = serve({ "GET /auth/status": status("invite", true), "POST /auth/login": () => ISSUED });
    show(<App />);
    const submit = await screen.findByRole("button", { name: "Sign in" });
    await userEvent.type(screen.getByLabelText("Password"), "correct horse battery");
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    await userEvent.type(screen.getByLabelText("Email"), "ann@example.com");
    await userEvent.click(submit);
    await waitFor(() => expect(isSignedIn()).toBe(true));
    expect(await callsTo(calls, "POST", "/auth/login")[0]!.json()).toEqual({
      email: "ann@example.com", password: "correct horse battery", device_name: "Browser", device_kind: "web",
    });
  });

  it("keeps the password-only sign-in of a single-user server", async () => {
    const calls = serve({ "GET /auth/status": status("closed", false), "POST /auth/login": () => ISSUED });
    show(<App />);
    await userEvent.type(await screen.findByLabelText("Password"), "secret password");
    expect(screen.queryByLabelText("Email")).toBeNull();
    expect(screen.queryByRole("button", { name: "Create one" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(isSignedIn()).toBe(true));
    expect(await callsTo(calls, "POST", "/auth/login")[0]!.json()).not.toHaveProperty("email");
  });

  it("says when sign-in pauses after too many attempts", async () => {
    serve({ "GET /auth/status": status("open", true), "POST /auth/login": () => json(429, { error: "too many attempts, try again later" }) });
    show(<App />);
    await userEvent.type(await screen.findByLabelText("Email"), "ann@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "wrong password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Too many attempts/);
  });
});

describe("sign-up", () => {
  it("creates an account with its own workspace while sign-up is open", async () => {
    const calls = serve({ "GET /auth/status": status("open", false), "POST /auth/signup": () => json(201, ISSUED) });
    show(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Create one" }));
    await userEvent.type(screen.getByLabelText("Your name"), "Ann Example");
    await userEvent.type(screen.getByLabelText("Email"), "ann@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "short");
    expect(screen.getByText("At least 12 characters.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Create account" }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.type(screen.getByLabelText("Password"), " but now long enough");
    await userEvent.type(screen.getByLabelText("Workspace name"), "Ann Team");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(authHeader()).toEqual({ Authorization: "Bearer lht_new" }));
    expect(await callsTo(calls, "POST", "/auth/signup")[0]!.json()).toEqual({
      email: "ann@example.com", name: "Ann Example", password: "short but now long enough", tenant_name: "Ann Team", device_name: "Browser", device_kind: "web",
    });
  });

  it("opens directly at #/signup, the link of the Mac app", async () => {
    location.hash = "#/signup";
    serve({ "GET /auth/status": status("open", false), "POST /auth/signup": () => json(201, ISSUED) });
    show(<App />);
    expect(await screen.findByRole("heading", { name: "Create your account" })).toBeTruthy();
  });

  it("explains at #/signup that accounts come from invitations when sign-up is not open", async () => {
    location.hash = "#/signup";
    serve({ "GET /auth/status": status("invite", true) });
    show(<App />);
    expect(await screen.findByText(/Accounts are created through invitations/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeTruthy();
  });

  it("shows the server's word when it holds a sign-up", async () => {
    serve({ "GET /auth/status": status("open", false), "POST /auth/signup": () => json(202, { error: "We will confirm your account by mail." }) });
    show(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Create one" }));
    await userEvent.type(screen.getByLabelText("Your name"), "Ann");
    await userEvent.type(screen.getByLabelText("Email"), "ann@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "long enough password");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("We will confirm your account by mail.")).toBeTruthy();
    expect(isSignedIn()).toBe(false);
  });

  it("shows why the server refused", async () => {
    serve({ "GET /auth/status": status("open", false), "POST /auth/signup": () => json(409, { error: "this email address has an account" }) });
    show(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Create one" }));
    await userEvent.type(screen.getByLabelText("Your name"), "Ann");
    await userEvent.type(screen.getByLabelText("Email"), "ann@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "long enough password");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect((await screen.findByRole("alert")).textContent).toBe("this email address has an account");
  });
});
