# Supabase setup

DawgShop uses Supabase for sign-in and the database. Students create their
account with a one-time code emailed to their @uga.edu address, then sign in
with a password (see step 7). (We use a code instead of a
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

Open **SQL Editor → New query**, paste all of `supabase/migrations/0001_profiles.sql`, and click **Run**. This creates the `profiles` table, its security rules, and a trigger that blocks any email that isn't `@uga.edu`. Then run `0002_passwords.sql` the same way (see step 7), and `0003_listings.sql` (see step 8).

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

## 7. Passwords

### How sign-in works now

- **Returning students** sign in on `/signin` with their @uga.edu email and a password.
- **New students** tap **Create your account**. We email them a code to prove they own the @uga.edu inbox, then they choose a name and a password on `/welcome`. The emailed code is the only way to create an account.
- **Forgot password?** emails a code too. After the code, the student picks a new password on `/set-password?reset=1`.
- Students who joined before passwords existed are sent to `/set-password` the next time they sign in with a code. Anyone can change their password from **Change password** on the **Me** tab (`/me`).

### Run the migration

Open **SQL Editor → New query**, paste all of `supabase/migrations/0002_passwords.sql`, and click **Run**. It adds:

- `has_password()`, which the app calls after a code sign-in to decide whether to ask for a password.
- A trigger that clears any password at the moment an account's email is first verified. Supabase gives code-created accounts a random password nobody knows, and this makes them truly passwordless until the student picks one. It also stops someone from registering another student's address with their own password before that student joins: the real student's code verification wipes it.
- A **one-time** fix that clears the random passwords on accounts that already exist. Only run the file once, before any student has set a real password. Running it again later would erase everyone's passwords.

If the migration hasn't been run, the app still works, but it won't send pre-password students to `/set-password` (it assumes they already have one rather than looping).

### Dashboard settings

Open **Authentication → Sign In / Providers → Email**:

- Set **Minimum password length** to **8**, the same as the app.
- Keep **Confirm email** on. It's what makes the code prove inbox ownership.
- **Secure password change:** when on, Supabase only lets a student change their password if they signed in recently (about the last 24 hours). Otherwise it returns `reauthentication_needed`, and the app says "For security, sign in with a code again to set your password." Either setting works with DawgShop; on is safer.
- **Leaked password protection** (checks passwords against known breaches) is a paid-plan feature. It's optional for the prototype.

## 8. Listings

Selling (#4), browsing (#5), and managing your listings (#7) need one more migration.

### Run the migration

Open **SQL Editor → New query**, paste all of `supabase/migrations/0003_listings.sql`, and click **Run**. Run it once, after 0001 and 0002. It creates:

- The `listings` table, with database checks that repeat the app's rules (price 0-10,000 in whole dollars, 1 to 5 photos, known categories and conditions, status `active`, `sold`, or `hidden`).
- Row Level Security rules for listings.
- A **private** Storage bucket named `listing-photos` (5 MB per file, JPEG/PNG/WebP), plus its rules. You don't need to create the bucket by hand. Check it appears under **Storage** afterwards.
- New read rules for `profiles`, so a listing can show the seller's name.
- Realtime for the `listings` table, so Browse and Move-in update live.

### Confirm Realtime is on

Open **Database → Publications**, click `supabase_realtime`, and check that `listings` is turned on. The migration adds it, but if it's off, turn it on here. Without it the app still works; students just need to refresh to see new listings.

### What students can and can't see

- **Signed out:** nothing. No listings, profiles, or photos.
- **Listings:** any signed-in student sees every **active** listing, plus all of their own, including sold and unlisted ones (on the Me tab). A listing marked sold or unlisted disappears from everyone else right away.
- **Changing listings:** only the seller can post, edit, mark sold, unlist, relist, or delete a listing. You can't post a listing as someone else.
- **Profiles:** signed-in students can read each other's name, pickup spot, and join date. They can **never** read another student's email (not even their own through the API; the app shows your email from your sign-in session instead).
- **Photos:** any signed-in student can view listing photos, through links that expire after an hour. A student can only upload, replace, or delete photos inside their own folder (`<their user id>/...`).

## 9. Try it

Run `npm run dev`, open http://localhost:3000, tap **Create your account**, enter your `@uga.edu` email, type the code from the email, then fill in your name and password. Sign out, and sign back in with your email and password.

After running 0003, tap **Sell**, add a photo, and post a listing. It should show up on **Browse**, and on the **Me** tab with Edit, Mark sold, Unlist, and Delete.
