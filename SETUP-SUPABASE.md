# Connecting the enquiry database (Supabase)

The quote form (`quote.html`) and staff inbox (`admin.html`) work out of the
box in **demo mode** — enquiries are stored in the visitor's own browser.
Follow these steps once to make them live: enquiries from every visitor land
in a real database and staff sign in to read them.

Takes about 10 minutes, free tier is plenty.

## 1. Create a Supabase project

1. Go to <https://supabase.com>, sign up (GitHub login works) and click
   **New project**.
2. Pick any name (e.g. `stanflex-site`), set a strong database password
   (you won't need it day-to-day), choose a region near you, click **Create**.

## 2. Create the enquiries table and its security rules

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

-- Row-level security: the public key may ONLY insert.
-- Reading requires a signed-in staff user.
alter table public.enquiries enable row level security;

create policy "public can submit enquiries"
  on public.enquiries for insert
  to anon
  with check (true);

create policy "staff can read enquiries"
  on public.enquiries for select
  to authenticated
  using (true);
```

That's the entire backend: anonymous visitors can add an enquiry but can
never read, edit or delete anything; signed-in staff can read.

## 3. Create your staff login

1. Sidebar → **Authentication** → **Users** → **Add user** → *Create new user*.
2. Enter the email + password you want to use on `admin.html`, and tick
   **Auto confirm user**.
3. Recommended: under **Authentication → Sign In / Up**, disable
   **Allow new users to sign up**, so this stays the only account.

## 4. Paste two values into the site

1. Sidebar → **Project Settings** → **API**.
2. Copy **Project URL** and the **anon / public** key.
3. Open `js/config.js` in this repository and fill them in:

```js
window.STANFLEX_CONFIG = {
  SUPABASE_URL: 'https://YOURPROJECT.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOi...'
};
```

Commit and deploy. Done — the form now writes to the database, and
`admin.html` shows a sign-in box instead of the demo banner.

The anon key is designed to be public (it's in every visitor's browser
either way); the SQL policies above are what keep the data safe. Never put
the `service_role` key anywhere in this repository.

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
