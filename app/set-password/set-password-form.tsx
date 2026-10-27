"use client";

import { useActionState, useState } from "react";
import { PasswordField } from "@/components/password-field";
import { savePassword, type SetPasswordState } from "./actions";

export function SetPasswordForm() {
  const [state, formAction, pending] = useActionState<SetPasswordState, FormData>(savePassword, {});
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const e = state.errors ?? {};

  return (
    <form action={formAction} noValidate>
      <PasswordField
        id="sp-password"
        name="password"
        label="New password"
        autoComplete="new-password"
        value={password}
        onChange={setPassword}
        error={e.password}
        showStrength
        describedBy="sp-help"
      />
      <div className="meta" id="sp-help" style={{ marginTop: 4 }}>
        At least 8 characters. Next time, sign in with your email and this password.
      </div>

      <PasswordField
        id="sp-confirm"
        name="confirm_password"
        label="Confirm password"
        autoComplete="new-password"
        value={confirm}
        onChange={setConfirm}
        error={e.confirm}
      />

      {e.form && (
        <div className="err" role="alert" style={{ marginTop: 16 }}>
          {e.form}
        </div>
      )}
      <button className="btn primary block" style={{ marginTop: 24 }} type="submit" disabled={pending}>
        {pending ? "Saving..." : "Save password"}
      </button>
    </form>
  );
}
