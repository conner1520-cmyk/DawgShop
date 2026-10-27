"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import {
  CODE_FORMAT_ERROR,
  CODE_MAX_LENGTH,
  CODE_MIN_LENGTH,
  cleanCode,
  isSignInCode,
  normalizeEmail,
  ugaEmailError,
} from "@/lib/uga";
import { PASSWORD_REQUIRED_ERROR } from "@/lib/password";
import { NOT_CONNECTED_MESSAGE } from "@/lib/supabase/env";
import { PasswordField } from "@/components/password-field";
import { sendSignInCode, signInWithPassword, verifySignInCode, type CodeIntent } from "./actions";

const RESEND_SECONDS = 60;

type Props = {
  configured: boolean;
  /** Message from a failed sign-in link (e.g. expired), rendered by the server. */
  linkError?: ReactNode;
};

// The sign-in screen has three states:
//   1. "password" (default): email + password.
//   2. "code" email step: send a code, to create an account ("signup") or
//      reset a forgotten password ("reset").
//   3. "code" code step (sentTo is set): type the emailed code.
export function SigninForm({ configured, linkError }: Props) {
  const [mode, setMode] = useState<"password" | "code">("password");
  const [intent, setIntent] = useState<CodeIntent>("signup");
  const [email, setEmail] = useState("");
  const [emailErr, setEmailErr] = useState("");
  const [password, setPassword] = useState("");
  const [passwordErr, setPasswordErr] = useState("");
  const [formErr, setFormErr] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [codeErr, setCodeErr] = useState("");
  const [status, setStatus] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [pending, startTransition] = useTransition();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  // Count down the "Send a new code" wait, one second at a time.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  function clearErrors() {
    setEmailErr("");
    setPasswordErr("");
    setFormErr("");
    setCodeErr("");
    setStatus("");
  }

  // "Forgot password?" and "Create your account" both go to the code flow,
  // keeping whatever email was typed.
  function startCodeFlow(next: CodeIntent) {
    clearErrors();
    setIntent(next);
    setMode("code");
    setSentTo(null);
    setTimeout(() => emailRef.current?.focus(), 0);
  }

  function backToPassword() {
    clearErrors();
    setMode("password");
    setSentTo(null);
    setTimeout(() => emailRef.current?.focus(), 0);
  }

  function codeSent(to: string) {
    setSentTo(to);
    setCode("");
    setCodeErr("");
    setResendIn(RESEND_SECONDS);
    setTimeout(() => codeRef.current?.focus(), 0);
  }

  /** Normalizes the typed email and shows an error if it isn't @uga.edu. */
  function checkEmail(): string | null {
    const value = normalizeEmail(email);
    setEmail(value);
    const invalid = ugaEmailError(value);
    if (invalid) {
      setEmailErr(invalid);
      emailRef.current?.focus();
      return null;
    }
    setEmailErr("");
    return value;
  }

  function onPasswordSignIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setFormErr("");
    setPasswordErr("");
    const value = checkEmail();
    if (!value) return;
    if (!password) {
      setPasswordErr(PASSWORD_REQUIRED_ERROR);
      passwordRef.current?.focus();
      return;
    }
    startTransition(async () => {
      // On success the server redirects, so this only returns on failure.
      const result = await signInWithPassword(value, password);
      if (result.field === "email") {
        setEmailErr(result.error);
        emailRef.current?.focus();
      } else if (result.field === "password") {
        setPasswordErr(result.error);
        passwordRef.current?.focus();
      } else {
        setFormErr(result.error);
        passwordRef.current?.focus();
      }
    });
  }

  function onSendCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const value = checkEmail();
    if (!value) return;
    startTransition(async () => {
      const result = await sendSignInCode(value);
      if (result.ok) {
        setStatus("");
        codeSent(result.email);
      } else {
        setEmailErr(result.error);
        emailRef.current?.focus();
      }
    });
  }

  function onVerify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending || !sentTo) return;
    if (!isSignInCode(code)) {
      setCodeErr(CODE_FORMAT_ERROR);
      codeRef.current?.focus();
      return;
    }
    setCodeErr("");
    setStatus("");
    startTransition(async () => {
      // On success the server redirects, so this only returns on failure.
      const result = await verifySignInCode(sentTo, code, intent);
      if (!result.ok) {
        setCodeErr(result.error);
        codeRef.current?.focus();
      }
    });
  }

  function onResend() {
    if (pending || !sentTo || resendIn > 0) return;
    setCodeErr("");
    setStatus("");
    startTransition(async () => {
      const result = await sendSignInCode(sentTo);
      if (result.ok) {
        codeSent(result.email);
        setStatus("We sent a new code. Use the newest one.");
      } else {
        setCodeErr(result.error);
      }
    });
  }

  const notConnected = !configured && (
    <p className="proto" role="status">
      {NOT_CONNECTED_MESSAGE}
    </p>
  );

  const emailField = (
    <>
      <label className="l" htmlFor="emailIn">
        UGA email
      </label>
      <input
        ref={emailRef}
        className="in"
        id="emailIn"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="you@uga.edu"
        value={email}
        onChange={(ev) => setEmail(ev.target.value)}
        aria-invalid={emailErr ? true : undefined}
        aria-describedby={emailErr ? "emailErr" : undefined}
      />
      {emailErr && (
        <div className="err" id="emailErr" role="alert">
          {emailErr}
        </div>
      )}
    </>
  );

  // 3. Code step: type the code from the email.
  if (mode === "code" && sentTo) {
    return (
      <form className="signin" onSubmit={onVerify} noValidate>
        <div className="wordmark big">DawgShop</div>
        <h1 style={{ marginTop: 32 }}>Check your UGA inbox</h1>
        <p className="lede">
          We sent a sign-in code to <b>{sentTo}</b>.{" "}
          {intent === "reset"
            ? "Enter it below, then choose a new password."
            : "Enter it below to verify your email."}
        </p>
        <label className="l" htmlFor="codeIn" style={{ marginTop: 0 }}>
          Sign-in code
        </label>
        <input
          ref={codeRef}
          className="in code"
          id="codeIn"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern={`[0-9]{${CODE_MIN_LENGTH},${CODE_MAX_LENGTH}}`}
          maxLength={CODE_MAX_LENGTH}
          placeholder="12345678"
          value={code}
          onChange={(ev) => setCode(cleanCode(ev.target.value))}
          aria-invalid={codeErr ? true : undefined}
          aria-describedby={codeErr ? "codeErr" : undefined}
        />
        {codeErr && (
          <div className="err" id="codeErr" role="alert">
            {codeErr}
          </div>
        )}
        <button className="btn primary block" style={{ marginTop: 16 }} type="submit" disabled={pending}>
          {pending ? "Checking..." : "Verify code"}
        </button>
        <div className="signin-links">
          <button
            type="button"
            className="linkbtn"
            onClick={() => {
              setSentTo(null);
              setStatus("");
              setTimeout(() => emailRef.current?.focus(), 0);
            }}
          >
            Use a different email
          </button>
          <button type="button" className="linkbtn" onClick={onResend} disabled={pending || resendIn > 0}>
            {resendIn > 0 ? `Send a new code (${resendIn}s)` : "Send a new code"}
          </button>
        </div>
        <p className="proto" role="status">
          {status}
        </p>
      </form>
    );
  }

  // 2. Code flow, email step: create an account or reset a password.
  if (mode === "code") {
    return (
      <form className="signin" onSubmit={onSendCode} noValidate>
        <div className="wordmark big">DawgShop</div>
        <h1 style={{ marginTop: 32 }}>{intent === "reset" ? "Reset your password" : "Create your account"}</h1>
        <p className="lede">
          {intent === "reset"
            ? "We'll email a code so you can choose a new password."
            : "We'll email a code to your @uga.edu address to verify you're a UGA student."}
        </p>
        {emailField}
        <button className="btn primary block" style={{ marginTop: 16 }} type="submit" disabled={pending}>
          {pending ? "Sending..." : "Send sign-in code"}
        </button>
        <div className="signin-links">
          <button type="button" className="linkbtn" onClick={backToPassword}>
            Back to sign in
          </button>
        </div>
        {notConnected}
      </form>
    );
  }

  // 1. Default: sign in with email and password.
  return (
    <form className="signin" onSubmit={onPasswordSignIn} noValidate>
      <div className="wordmark big">DawgShop</div>
      <p className="lede">
        Buy and sell with other UGA students. Every account is a verified @uga.edu email.
      </p>
      {linkError}
      {emailField}
      <PasswordField
        ref={passwordRef}
        id="passwordIn"
        name="password"
        label="Password"
        autoComplete="current-password"
        value={password}
        onChange={setPassword}
        error={passwordErr}
      />
      <div className="forgot">
        <button type="button" className="linkbtn" onClick={() => startCodeFlow("reset")}>
          Forgot password?
        </button>
      </div>
      {formErr && (
        <div className="err" role="alert" style={{ marginTop: 12 }}>
          {formErr}
        </div>
      )}
      <button className="btn primary block" style={{ marginTop: 16 }} type="submit" disabled={pending}>
        {pending ? "Signing in..." : "Sign in"}
      </button>
      <div className="divider" role="separator">
        <span>or</span>
      </div>
      <button type="button" className="btn secondary block" onClick={() => startCodeFlow("signup")}>
        New to DawgShop? Create your account
      </button>
      {notConnected}
    </form>
  );
}
