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
import { NOT_CONNECTED_MESSAGE } from "@/lib/supabase/env";
import { sendSignInCode, verifySignInCode } from "./actions";

const RESEND_SECONDS = 60;

type Props = {
  configured: boolean;
  /** Message from a failed sign-in link (e.g. expired), rendered by the server. */
  linkError?: ReactNode;
};

export function SigninForm({ configured, linkError }: Props) {
  const [email, setEmail] = useState("");
  const [emailErr, setEmailErr] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [codeErr, setCodeErr] = useState("");
  const [status, setStatus] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [pending, startTransition] = useTransition();
  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  // Count down the "Send a new code" wait, one second at a time.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  function codeSent(to: string) {
    setSentTo(to);
    setCode("");
    setCodeErr("");
    setResendIn(RESEND_SECONDS);
    setTimeout(() => codeRef.current?.focus(), 0);
  }

  function onSendCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const value = normalizeEmail(email);
    setEmail(value);
    const invalid = ugaEmailError(value);
    if (invalid) {
      setEmailErr(invalid);
      emailRef.current?.focus();
      return;
    }
    setEmailErr("");
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
      // On success the server redirects to /welcome or /, so this only returns on failure.
      const result = await verifySignInCode(sentTo, code);
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

  if (sentTo) {
    return (
      <form className="signin" onSubmit={onVerify} noValidate>
        <div className="wordmark big">DawgShop</div>
        <h1 style={{ marginTop: 32 }}>Check your UGA inbox</h1>
        <p className="lede">
          We sent a sign-in code to <b>{sentTo}</b>. Enter it below to finish signing in.
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
          {pending ? "Checking..." : "Verify and sign in"}
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

  return (
    <form className="signin" onSubmit={onSendCode} noValidate>
      <div className="wordmark big">DawgShop</div>
      <p className="lede">
        Buy and sell with other UGA students. Every account is a verified @uga.edu email.
      </p>
      {linkError}
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
      <button className="btn primary block" style={{ marginTop: 16 }} type="submit" disabled={pending}>
        {pending ? "Sending..." : "Send sign-in code"}
      </button>
      {!configured && (
        <p className="proto" role="status">
          {NOT_CONNECTED_MESSAGE}
        </p>
      )}
    </form>
  );
}
