# Connecting the enquiry database (Supabase)

The quote form (`quote.html`) and staff inbox (`admin.html`) work out of the
box in **demo mode** — enquiries are stored in the visitor's own browser.
Follow these steps once to make them live: enquiries from every visitor land
in a real database.

Takes about 5 minutes, free tier is plenty.

## 1. Create a Supabase project

1. Go to <https://supabase.com>, sign up (GitHub login works) and click
   **New project**.
2. Pick any name (e.g. `stanflex-site`), set a strong database password
   (you won't need it day-to-day), choose a region near you, click **Create**.

## 2. Create the enquiries table

1. In the project's left sidebar open **SQL Editor**.
2. Paste the whole block below and click **Run**:

```sql
-- Table that receives quote-form submissions
create table public.enquiries (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null,
  company     text,
  email       text not null,
  phone       text,
  nb_size     text,
  medium      text,
  pressure    text,
  temperature text,
  movement    text,
  quantity    text,
  message     text
);

alter table public.enquiries enable row level security;

-- Anyone can submit the form.
create policy "public can submit enquiries"
  on public.enquiries for insert
  to anon
  with check (true);

-- OPEN MODE (matches js/config.js ADMIN_OPEN = true, the current default):
-- anyone with the admin.html link can also READ every enquiry — no sign-in.
-- Fine for a quick test; see "Add a staff login" below before going live.
create policy "anyone can read enquiries (open mode)"
  on public.enquiries for select
  to anon
  using (true);
```

## 3. Paste two values into the site

1. Sidebar → **Project Settings** → **API**.
2. Copy **Project URL** and the **anon / public** key.
3. Open `js/config.js` in this repository and fill them in:

```js
window.STANFLEX_CONFIG = {
  SUPABASE_URL: 'https://YOURPROJECT.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOi...',
  ADMIN_OPEN: true
};
```

Commit and deploy. Done — the form now writes to the database, and
`admin.html` lists every enquiry with no sign-in required.

The anon key is designed to be public (it's in every visitor's browser
either way) — the SQL policies above are what actually control access.
Never put the `service_role` key anywhere in this repository.

⚠️ **In open mode, the enquiry list — names, emails, phone numbers — is
visible to anyone who has or guesses the `admin.html` URL.** That's fine
for early testing; add the staff login below before sharing the site
publicly or entering real customer data.

## 4. (Recommended before going live) Add a staff login

1. Sidebar → **Authentication** → **Users** → **Add user** → *Create new user*.
   Enter the email + password you'll use to sign in, and tick
   **Auto confirm user**. Recommended: under
   **Authentication → Sign In / Up**, disable **Allow new users to sign up**,
   so this stays the only account.
2. Back in **SQL Editor**, swap the open-read policy for one that requires
   sign-in:

   ```sql
   drop policy "anyone can read enquiries (open mode)" on public.enquiries;

   create policy "staff can read enquiries"
     on public.enquiries for select
     to authenticated
     using (true);
   ```

3. In `js/config.js`, set `ADMIN_OPEN: false`. `admin.html` now shows the
   sign-in box instead of the list directly.

## Notes

- **Hosted preview (claude.ai artifact):** that sandbox blocks calls to
  external services, so the preview always runs in demo mode even after
  configuration. The live behaviour appears on real hosting
  (GitHub Pages, Netlify, your own server, …).
- **Seeing the data in Supabase:** Table Editor → `enquiries` shows all
  submissions too; `admin.html` is just a nicer, branded view.
- **Email notifications** (optional, later): Supabase → Database →
  Webhooks can call a service like Resend on every insert so enquiries
  also land in your email inbox.
