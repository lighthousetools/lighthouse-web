import { useMutation, useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api, must, storeToken } from "../api/client";
import { Failure } from "../ui";

export function Login({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const status = useQuery({
    queryKey: ["auth-status"],
    queryFn: () => must(api.GET("/auth/status")),
    refetchInterval: false,
  });
  const login = useMutation({
    mutationFn: () =>
      must(
        api.POST("/auth/login", {
          body: { password, device_name: "Browser", device_kind: "web" },
        }),
      ),
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
      <h1>Lighthouse</h1>
      {status.data?.setup_required ? (
        <p className="notice">
          This server has no password yet. Set one with the admin token, as described in the
          configuration docs.
        </p>
      ) : (
        <form onSubmit={submit}>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <Failure error={login.error} />
          <button className="primary" disabled={login.isPending || !password}>
            Sign in
          </button>
        </form>
      )}
    </div>
  );
}
