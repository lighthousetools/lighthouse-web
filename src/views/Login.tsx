import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { ApiError, api, errorText, must, storeToken, type Schemas } from "../api/client";
import { t, useLanguage } from "../i18n";
import { DEVICE, useAuthStatus } from "../session";
import { Dots } from "../shell/Dots";
import { Btn, Failure, Field, Wordmark } from "../ui";
import { LanguagePicker } from "./LanguagePicker";

/** The shortest password the server takes. */
export const MIN_PASSWORD = 12;

/** The glass card every page before the shell uses: sign-in, sign-up, invitations and email links. */
export function SignInCard({ title, lead, children }: { title: string; lead?: ReactNode; children: ReactNode }) {
  useLanguage();
  return (
    <div className="os">
      <Dots />
      <main className="signin">
        <div className="signin-c">
          <div className="brand">
            <Wordmark />
          </div>
          <h1>{title}</h1>
          {lead && <p>{lead}</p>}
          {children}
          <div className="lang">
            <span>{t("lang.label")}</span>
            <LanguagePicker />
          </div>
        </div>
      </main>
    </div>
  );
}

/** A password hint under the field, or nothing once it is long enough. */
export function PasswordHint({ value }: { value: string }) {
  if (!value || value.length >= MIN_PASSWORD) return null;
  return <small className="signin-h">{t("login.passwordShort", { count: MIN_PASSWORD })}</small>;
}

/** What `POST /auth/signup` gives: a token, or a message when the server holds the sign-up for now (202). */
async function signUp(body: Schemas["SignupRequest"]): Promise<Schemas["TokenIssued"] | { held: string }> {
  const { data, error, response } = await api.POST("/auth/signup", { body });
  if (error !== undefined) throw new ApiError(errorText(response.status, error), response.status);
  if (response.status === 202) {
    const message = (data as unknown as { error?: string } | undefined)?.error;
    return { held: message || t("login.held") };
  }
  return data as Schemas["TokenIssued"];
}

export function Login({ onDone }: { onDone: () => void }) {
  useLanguage();
  const status = useAuthStatus();
  // `#/signup` opens the sign-up directly; the Mac app links there while sign-up is open.
  const [mode, setMode] = useState<"signin" | "signup">(() => (/^#\/?signup\b/.test(location.hash) ? "signup" : "signin"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [held, setHeld] = useState<string | null>(null);
  const needsEmail = status.data?.email_required ?? false;
  // A single-user server keeps the password-only sign-in; one that can have more people asks for the email too.
  const showEmail = needsEmail || (status.data?.signup ?? "closed") !== "closed";
  const canSignUp = status.data?.signup === "open";
  const finish = (issued: Schemas["TokenIssued"]) => {
    storeToken(issued.token, issued.id);
    if (/^#\/?signup\b/.test(location.hash)) location.hash = "";
    onDone();
  };
  const login = useMutation({
    mutationFn: () =>
      must(api.POST("/auth/login", { body: { ...(email.trim() ? { email: email.trim() } : {}), password, ...DEVICE } })),
    onSuccess: finish,
  });
  const signup = useMutation({
    mutationFn: () =>
      signUp({ email: email.trim(), name: name.trim(), password, tenant_name: workspace.trim() || null, ...DEVICE }),
    onSuccess: (result) => ("held" in result ? setHeld(result.held) : finish(result)),
  });
  const signInReady = !!password && (!needsEmail || !!email.trim());
  const signUpReady = !!email.trim() && !!name.trim() && password.length >= MIN_PASSWORD;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (mode === "signin" && signInReady) login.mutate();
    if (mode === "signup" && signUpReady) signup.mutate();
  };
  const switchTo = (next: "signin" | "signup") => {
    setMode(next);
    login.reset();
    signup.reset();
  };
  if (held) {
    return (
      <SignInCard title={t("login.heldTitle")} lead={held}>
        <form onSubmit={(event) => { event.preventDefault(); setHeld(null); switchTo("signin"); }}>
          <Btn type="submit" size="lg">{t("login.backToSignIn")}</Btn>
        </form>
      </SignInCard>
    );
  }
  if (mode === "signup" && canSignUp) {
    return (
      <SignInCard title={t("login.signupTitle")} lead={t("login.signupLead")}>
        <form onSubmit={submit}>
          <Field large autoFocus autoComplete="name" label={t("login.name")} placeholder={t("login.name")} value={name} onChange={setName} />
          <Field large type="email" autoComplete="email" label={t("login.email")} placeholder={t("login.email")} value={email} onChange={setEmail} />
          <Field large type="password" autoComplete="new-password" label={t("login.password")} placeholder={t("login.newPassword", { count: MIN_PASSWORD })} value={password} onChange={setPassword} />
          <PasswordHint value={password} />
          <Field large autoComplete="organization" label={t("login.workspace")} placeholder={t("login.workspaceHint")} value={workspace} onChange={setWorkspace} />
          <Failure error={signup.error} />
          <Btn type="submit" variant="primary" size="lg" disabled={signup.isPending || !signUpReady}>
            {t("login.signupSubmit")}
          </Btn>
        </form>
        <p className="signin-alt">
          {t("login.haveAccount")} <button type="button" className="signin-link" onClick={() => switchTo("signin")}>{t("login.submit")}</button>
        </p>
      </SignInCard>
    );
  }
  return (
    <SignInCard title={t("login.title")}>
      {status.data?.setup_required ? (
        <p className="note-box" style={{ marginTop: 20 }}>{t("login.setup")}</p>
      ) : (
        <form onSubmit={submit}>
          {showEmail && (
            <Field large autoFocus type="email" autoComplete="username" label={t("login.email")} placeholder={needsEmail ? t("login.email") : t("login.emailOptional")} value={email} onChange={setEmail} />
          )}
          <Field type="password" large autoFocus={!showEmail} autoComplete="current-password" label={t("login.password")} placeholder={t("login.password")} value={password} onChange={setPassword} />
          <Failure error={login.error} />
          <Btn type="submit" variant="primary" size="lg" disabled={login.isPending || !signInReady}>
            {t("login.submit")}
          </Btn>
        </form>
      )}
      {mode === "signup" && status.data?.signup === "invite" && <p className="note-box" style={{ marginTop: 20 }}>{t("login.inviteOnly")}</p>}
      {canSignUp && (
        <p className="signin-alt">
          {t("login.noAccount")} <button type="button" className="signin-link" onClick={() => switchTo("signup")}>{t("login.signup")}</button>
        </p>
      )}
    </SignInCard>
  );
}
