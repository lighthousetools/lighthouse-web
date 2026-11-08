import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, must, storeToken, useSignedIn } from "../api/client";
import { useMe } from "../data";
import { dayTime } from "../format";
import { t, tOr, useLanguage } from "../i18n";
import { DEVICE, adopt, signOut } from "../session";
import { Avatar, Btn, Failure, Field, Skeleton } from "../ui";
import { MIN_PASSWORD, PasswordHint, SignInCard } from "./Login";

/** A link from a mail: an invitation or an email confirmation, with the token it carries. */
export type Link = { kind: "invite" | "verify"; token: string };

/** Reads `#/invite?token=…` and `#/verify?token=…`, the links the server puts into its mails. */
export function parseLink(hash: string): Link | null {
  const match = /^#\/?(invite|verify)\?(.*)$/.exec(hash);
  if (!match) return null;
  const token = new URLSearchParams(match[2]).get("token");
  return token ? { kind: match[1] as Link["kind"], token } : null;
}

export function useLink(): Link | null {
  const [link, setLink] = useState(() => parseLink(location.hash));
  useEffect(() => {
    const follow = () => setLink(parseLink(location.hash));
    addEventListener("hashchange", follow);
    return () => removeEventListener("hashchange", follow);
  }, []);
  return link;
}

/** Leaves the link page for the app itself. */
const leave = () => {
  location.hash = "";
};

export function LinkPage({ link }: { link: Link }) {
  useLanguage();
  return link.kind === "verify" ? <Verify token={link.token} /> : <Invite token={link.token} />;
}

function Verify({ token }: { token: string }) {
  const signedIn = useSignedIn();
  const client = useQueryClient();
  const verify = useMutation({
    mutationFn: () => must(api.POST("/auth/verify", { body: { token } })),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["me"] }),
  });
  const resend = useMutation({ mutationFn: () => must(api.POST("/auth/verify/resend")) });
  const { mutate } = verify;
  // The token works once, so it is sent once, also when development mode runs effects twice.
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    mutate();
  }, [mutate]);
  if (verify.isSuccess) {
    return (
      <SignInCard title={t("verify.done")} lead={t("verify.doneLead")}>
        <form onSubmit={(event) => { event.preventDefault(); leave(); }}>
          <Btn type="submit" variant="primary" size="lg">{signedIn ? t("links.open") : t("login.submit")}</Btn>
        </form>
      </SignInCard>
    );
  }
  if (verify.isError) {
    return (
      <SignInCard title={t("verify.failed")} lead={verify.error.message}>
        <form onSubmit={(event) => { event.preventDefault(); if (signedIn) resend.mutate(); else leave(); }}>
          {resend.isSuccess && <p role="status">{t("verify.sent")}</p>}
          <Failure error={resend.error} />
          {signedIn ? (
            <div className="signin-row">
              <Btn onClick={leave} size="lg">{t("links.open")}</Btn>
              <Btn type="submit" variant="primary" size="lg" disabled={resend.isPending || resend.isSuccess}>{t("verify.resend")}</Btn>
            </div>
          ) : (
            <Btn type="submit" variant="primary" size="lg">{t("verify.signInToResend")}</Btn>
          )}
        </form>
      </SignInCard>
    );
  }
  return (
    <SignInCard title={t("verify.checking")}>
      <div style={{ marginTop: 20 }}><Skeleton count={1} height={44} /></div>
    </SignInCard>
  );
}

function Invite({ token }: { token: string }) {
  const signedIn = useSignedIn();
  const info = useQuery({
    queryKey: ["invitation", token],
    queryFn: () => must(api.POST("/auth/invitation", { body: { token } })),
    retry: false,
  });
  if (info.isPending) {
    return (
      <SignInCard title={t("invite.checking")}>
        <div style={{ marginTop: 20 }}><Skeleton count={1} height={44} /></div>
      </SignInCard>
    );
  }
  if (info.isError) {
    return (
      <SignInCard title={t("invite.invalid")} lead={info.error.message}>
        <form onSubmit={(event) => { event.preventDefault(); leave(); }}>
          <Btn type="submit" size="lg">{signedIn ? t("links.open") : t("login.backToSignIn")}</Btn>
        </form>
      </SignInCard>
    );
  }
  const invitation = info.data;
  const lead = t("invite.lead", {
    email: invitation.email,
    role: tOr(`role.${invitation.role}`, invitation.role),
    time: dayTime(invitation.expires_at),
  });
  const title = t("invite.title", { tenant: invitation.tenant_name });
  if (signedIn) return <AcceptAsMember token={token} title={title} lead={lead} email={invitation.email} />;
  if (invitation.account_exists) return <SignInAndAccept token={token} title={title} lead={lead} email={invitation.email} />;
  return <CreateAndAccept token={token} title={title} lead={lead} />;
}

type Step = { token: string; title: string; lead: string };

/** Signed in already: join with this account, or sign out when the invitation is for someone else. */
function AcceptAsMember({ token, title, lead, email }: Step & { email: string }) {
  const client = useQueryClient();
  const me = useMe();
  const accept = useMutation({
    mutationFn: () => must(api.POST("/tenants/accept", { body: { token, ...DEVICE } })),
    onSuccess: (issued) => {
      adopt(issued, client);
      leave();
    },
  });
  if (!me.data) {
    return <SignInCard title={title} lead={lead}><div style={{ marginTop: 20 }}><Skeleton count={1} height={44} /></div></SignInCard>;
  }
  const matches = (me.data.email ?? "").toLowerCase() === email.toLowerCase();
  return (
    <SignInCard title={title} lead={lead}>
      <div className="signin-who">
        <Avatar name={me.data.name} size={32} />
        <span className="grow">
          <b>{me.data.name}</b>
          <small>{me.data.email ?? me.data.tenant_name}</small>
        </span>
      </div>
      <form onSubmit={(event) => { event.preventDefault(); if (matches) accept.mutate(); else void signOut(client); }}>
        {!matches && <p>{t("invite.otherAccount", { email })}</p>}
        <Failure error={accept.error} />
        <div className="signin-row">
          <Btn size="lg" onClick={leave}>{t("common.cancel")}</Btn>
          {matches ? (
            <Btn type="submit" variant="primary" size="lg" disabled={accept.isPending}>{t("invite.join")}</Btn>
          ) : (
            <Btn type="submit" variant="primary" size="lg">{t("invite.switchAccount")}</Btn>
          )}
        </div>
      </form>
    </SignInCard>
  );
}

/** Has an account but is not signed in here: sign in, then accept with that token. */
function SignInAndAccept({ token, title, lead, email }: Step & { email: string }) {
  const client = useQueryClient();
  const [password, setPassword] = useState("");
  const join = useMutation({
    mutationFn: async () => {
      const login = await must(api.POST("/auth/login", { body: { email, password, ...DEVICE } }));
      storeToken(login.token, login.id);
      return must(api.POST("/tenants/accept", { body: { token, ...DEVICE } }));
    },
    onSuccess: (issued) => {
      adopt(issued, client);
      leave();
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (password) join.mutate();
  };
  return (
    <SignInCard title={title} lead={lead}>
      <form onSubmit={submit}>
        <p>{t("invite.signInFirst")}</p>
        <Field large type="email" autoComplete="username" label={t("login.email")} value={email} onChange={() => undefined} disabled />
        <Field large autoFocus type="password" autoComplete="current-password" label={t("login.password")} placeholder={t("login.password")} value={password} onChange={setPassword} />
        <Failure error={join.error} />
        <Btn type="submit" variant="primary" size="lg" disabled={join.isPending || !password}>{t("invite.signInAndJoin")}</Btn>
      </form>
    </SignInCard>
  );
}

/** New to this server: create the account with the invitation. */
function CreateAndAccept({ token, title, lead }: Step) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const accept = useMutation({
    mutationFn: () => must(api.POST("/auth/accept", { body: { token, name: name.trim(), password, ...DEVICE } })),
    onSuccess: (issued) => {
      storeToken(issued.token, issued.id);
      leave();
    },
  });
  const ready = !!name.trim() && password.length >= MIN_PASSWORD;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (ready) accept.mutate();
  };
  return (
    <SignInCard title={title} lead={lead}>
      <form onSubmit={submit}>
        <p>{t("invite.createAccount")}</p>
        <Field large autoFocus autoComplete="name" label={t("login.name")} placeholder={t("login.name")} value={name} onChange={setName} />
        <Field large type="password" autoComplete="new-password" label={t("login.password")} placeholder={t("login.newPassword", { count: MIN_PASSWORD })} value={password} onChange={setPassword} />
        <PasswordHint value={password} />
        <Failure error={accept.error} />
        <Btn type="submit" variant="primary" size="lg" disabled={accept.isPending || !ready}>{t("invite.createAndJoin")}</Btn>
      </form>
    </SignInCard>
  );
}
