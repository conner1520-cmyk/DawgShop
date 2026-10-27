"use client";

import { useState, type Ref } from "react";
import { PASSWORD_MAX, passwordStrength } from "@/lib/password";

type Props = {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  error?: string;
  /** Show the Weak / OK / Strong hint under the field (for new passwords). */
  showStrength?: boolean;
  /** Extra id(s) for aria-describedby, e.g. a helper line below the field. */
  describedBy?: string;
  ref?: Ref<HTMLInputElement>;
};

// A password input with a Show/Hide button and an optional strength hint.
// Used on /signin, /welcome, and /set-password.
export function PasswordField({
  id,
  name,
  label,
  value,
  onChange,
  autoComplete,
  error,
  showStrength,
  describedBy,
  ref,
}: Props) {
  const [visible, setVisible] = useState(false);
  const errId = `${id}-err`;
  const strengthId = `${id}-strength`;
  const strength = showStrength && value ? passwordStrength(value) : null;
  const describers = [error ? errId : null, strength ? strengthId : null, describedBy ?? null]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <label className="l" htmlFor={id}>
        {label}
      </label>
      <div className="pw">
        <input
          ref={ref}
          className="in"
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          // Generous cap so a long passphrase isn't cut off silently; the
          // 72-byte rule is checked with a clear message instead.
          maxLength={PASSWORD_MAX * 4}
          value={value}
          onChange={(ev) => onChange(ev.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describers || undefined}
        />
        <button
          type="button"
          className="pw-toggle"
          onClick={() => setVisible((v) => !v)}
          aria-label="Show password"
          aria-pressed={visible}
          aria-controls={id}
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
      {error && (
        <div className="err" id={errId} role="alert">
          {error}
        </div>
      )}
      {strength && (
        <div className={`pw-strength ${strength.level}`} id={strengthId} aria-live="polite">
          Strength: <b>{strength.label}</b>
          {strength.level !== "strong" && <span> · Longer is stronger. Mix in numbers or symbols.</span>}
        </div>
      )}
    </>
  );
}
