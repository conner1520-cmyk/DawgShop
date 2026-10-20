"use client";

import { useActionState, useState } from "react";
import { AREAS } from "@/lib/areas";
import { saveProfile, type WelcomeState } from "./actions";

export function WelcomeForm({ defaultName }: { defaultName: string }) {
  const [state, formAction, pending] = useActionState<WelcomeState, FormData>(saveProfile, {});
  const [name, setName] = useState(defaultName);
  const [area, setArea] = useState("");
  const e = state.errors ?? {};

  return (
    <form action={formAction} noValidate>
      <label className="l" htmlFor="f-name">
        Name
      </label>
      <input
        className="in"
        id="f-name"
        name="name"
        autoComplete="given-name"
        maxLength={50}
        value={name}
        onChange={(ev) => setName(ev.target.value)}
        aria-invalid={e.name ? true : undefined}
        aria-describedby={e.name ? "err-name" : undefined}
      />
      {e.name && (
        <div className="err" id="err-name" role="alert">
          {e.name}
        </div>
      )}
      <div className="meta" style={{ marginTop: 4 }}>
        This is what buyers and sellers see.
      </div>

      <label className="l" htmlFor="f-area">
        Dorm or apartment for pickup
      </label>
      <select
        className="in"
        id="f-area"
        name="pickup_area"
        value={area}
        onChange={(ev) => setArea(ev.target.value)}
        aria-invalid={e.area ? true : undefined}
        aria-describedby={e.area ? "err-area" : undefined}
      >
        <option value="">Skip for now</option>
        {AREAS.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
      {e.area && (
        <div className="err" id="err-area" role="alert">
          {e.area}
        </div>
      )}
      <div className="meta" style={{ marginTop: 4 }}>
        Optional. It fills in your pickup spot when you sell.
      </div>

      {e.form && (
        <div className="err" role="alert" style={{ marginTop: 16 }}>
          {e.form}
        </div>
      )}
      <button className="btn primary block" style={{ marginTop: 24 }} type="submit" disabled={pending}>
        {pending ? "Saving..." : "Start using DawgShop"}
      </button>
    </form>
  );
}
