import { useMutation, useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api, must, storeToken } from "../api/client";
import { t, useLanguage } from "../i18n";
import { Failure, Logo } from "../ui";
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
    login.mutate();
  };
  return (
    <div className="login">
      <div className="brand">
        <Logo size={30} /> {t("app.name")}
      </div>
      <p className="sub" style={{ marginBottom: 20 }}>{t("login.title")}</p>
      {status.data?.setup_required ? (
        <p className="note">{t("login.setup")}</p>
      ) : (
        <form onSubmit={submit}>
          <label className="lab">
            {t("login.password")}
            <input
              className="field"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <Failure error={login.error} />
          <button className="btn primary" disabled={login.isPending || !password}>
            {t("login.submit")}
          </button>
        </form>
      )}
      <div style={{ marginTop: 28 }}>
        <LanguagePicker />
      </div>
    </div>
  );
}
