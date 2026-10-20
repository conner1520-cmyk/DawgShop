# Supabase setup

DawgShop uses Supabase for sign-in and the database. Students sign in with a
one-time code emailed to their @uga.edu address. (We use a code instead of a
magic link because UGA mail runs on Microsoft 365, and its Safe Links scanner
opens links in incoming mail, which uses up a one-time link before the student
can click it.)

Do these steps yourself, once. Keys and passwords go only in `.env.local` or
the Supabase dashboard. Never commit them, and never paste them into a chat
(including with an AI assistant).

## 1. Create the project and add your keys

1. Go to [supabase.com](https://supabase.com), sign in, and create a new project (the free plan is fine).
2. In the project, open **Project Settings → API**. Copy `.env.local.example` to `.env.local` at the repo root and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL` = the Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the `anon` / public key

   Restart `npm run dev` after editing `.env.local`.

## 2. Create the tables

Open **SQL Editor → New query**, paste all of `supabase/migrations/0001_profiles.sql`, and click **Run**. This creates the `profiles` table, its security rules, and a trigger that blocks any email that isn't `@uga.edu`.

## 3. URLs

Open **Authentication → URL Configuration**:

- **Site URL:** `http://localhost:3000`
- **Redirect URLs:** add `http://localhost:3000/auth/callback`

The code flow doesn't need a redirect, but the app keeps `/auth/callback` as a fallback for sign-in links. When the app is deployed on Vercel, add `https://<your-vercel-domain>/auth/callback` too.

## 4. Email provider settings

Open **Authentication → Providers → Email** (in some dashboard versions, **Authentication → Sign In / Providers**):

- Keep **Confirm email** on.
- **Email OTP length:** any value from 6 to 10 works (the app accepts the whole range). The DawgShop project currently sends 8-digit codes.
- **Email OTP expiration:** **600** seconds (10 minutes) is a good setting.

## 5. Email templates (show the code, not a link)

Open **Authentication → Email Templates**. Edit **both** templates below. A brand-new student gets "Confirm signup"; a returning student gets "Magic Link". If either still contains `{{ .ConfirmationURL }}`, students get a link instead of a code.

**Magic Link** template. Subject: `Your DawgShop sign-in code`

```html
<div style="font-family: Arial, Helvetica, sans-serif; max-width: 440px; margin: 0 auto; padding: 24px; color: #1C1B1A;">
  <p style="font-size: 22px; font-weight: 800; color: #A3122A; margin: 0 0 20px;">DawgShop</p>
  <p style="font-size: 16px; margin: 0 0 8px;">Your DawgShop sign-in code is</p>
  <p style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #A3122A; margin: 0 0 16px;">{{ .Token }}</p>
  <p style="font-size: 14px; color: #6A6661; margin: 0 0 8px;">Enter it in DawgShop to finish signing in. It works for a limited time and only once.</p>
  <p style="font-size: 14px; color: #6A6661; margin: 0;">If you didn't request this, ignore this email.</p>
</div>
```

**Confirm signup** template. Subject: `Your DawgShop sign-in code`

```html
<div style="font-family: Arial, Helvetica, sans-serif; max-width: 440px; margin: 0 auto; padding: 24px; color: #1C1B1A;">
  <p style="font-size: 22px; font-weight: 800; color: #A3122A; margin: 0 0 20px;">DawgShop</p>
  <p style="font-size: 16px; margin: 0 0 8px;">Welcome to DawgShop! Your DawgShop sign-in code is</p>
  <p style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #A3122A; margin: 0 0 16px;">{{ .Token }}</p>
  <p style="font-size: 14px; color: #6A6661; margin: 0 0 8px;">Enter it in DawgShop to verify your UGA email and finish signing in. It works for a limited time and only once.</p>
  <p style="font-size: 14px; color: #6A6661; margin: 0;">If you didn't request this, ignore this email.</p>
</div>
```

## 6. Send email through Gmail (custom SMTP)

Without custom SMTP, Supabase's built-in sender **only emails members of your Supabase project's team**, so classmates would never get a code. To email any @uga.edu student, connect a Gmail account:

1. On the Google account you'll send from, turn on **2-Step Verification** (Google Account → Security).
2. Create an **App Password** at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords). Google shows a 16-character password once. Keep it private.
3. In Supabase, open **Project Settings → Authentication → SMTP Settings** (also reachable from **Authentication → Emails → SMTP Settings**), turn on **Enable custom SMTP**, and enter:
   - **Host:** `smtp.gmail.com`
   - **Port:** `465`
   - **Username:** your full Gmail address
   - **Password:** the App Password (not your normal Gmail password)
   - **Sender email:** the same Gmail address
   - **Sender name:** `DawgShop`
4. Save, then send yourself a code to test it.

Limits to know:

- Gmail allows roughly **500 emails a day** from a personal account. Plenty for a class demo.
- Supabase also caps auth emails per hour (**Authentication → Rate Limits**). The default can be low; raise it before a demo where many people sign in at once.
- If a code doesn't arrive, check the UGA junk/quarantine folder.

## 7. Try it

Run `npm run dev`, open http://localhost:3000, enter your `@uga.edu` email, and type the code from the email.
