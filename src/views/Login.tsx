import { useMutation, useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api, must, storeToken } from "../api/client";
import { t, useLanguage } from "../i18n";
import { Light } from "../shell/Light";
import { Btn, Failure, Field, Logo } from "../ui";
import { LanguagePicker } from "./LanguagePicker";

export function Login({ onDone }: { onDone: () => void }) {
  useLanguage();
  const [password, setPassword] = useState("");
  const status = useQuery({
    queryKey: ["auth-status"],
    queryFn: () => must(api.GET("/auth/status")),
  });
  const login = useMutation({
    mutationFn: () =>
      must(api.POST("/auth/login", { body: { password, device_name: "Browser", device_kind: "web" } })),
    onSuccess: (issued) => {
      storeToken(issued.token);
      onDone();
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (password) login.mutate();
  };
  return (
    <div className="os">
      <Light />
      <main className="signin">
        <div className="signin-c">
          <div className="brand">
            <Logo size={22} /> {t("app.name")}
          </div>
          <h1>{t("login.title")}</h1>
          <p>{t("login.lead")}</p>
          {status.data?.setup_required ? (
            <p className="note-box" style={{ marginTop: 20 }}>{t("login.setup")}</p>
          ) : (
            <form onSubmit={submit}>
              <Field type="password" large autoFocus label={t("login.password")} placeholder={t("login.password")} value={password} onChange={setPassword} />
              <Failure error={login.error} />
              <Btn type="submit" variant="primary" size="lg" disabled={login.isPending || !password}>
                {t("login.submit")}
              </Btn>
            </form>
          )}
          <div className="lang">
            <span>{t("lang.label")}</span>
            <LanguagePicker />
          </div>
        </div>
      </main>
    </div>
  );
}
