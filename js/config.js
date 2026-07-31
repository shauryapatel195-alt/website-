/* ==========================================================================
   STANFLEX site configuration
   --------------------------------------------------------------------------
   To activate the live enquiry database, create a free Supabase project and
   paste its two values below — full walkthrough in SETUP-SUPABASE.md.

   Until both values are filled in, the quote form and admin inbox run in
   DEMO MODE: enquiries are saved in the visitor's own browser only.

   The anon (public) key is safe to publish — it only allows what your
   database policies permit (here: inserting an enquiry). Never put the
   service_role key in this file.
   ========================================================================== */
window.STANFLEX_CONFIG = {
  SUPABASE_URL: '',       // e.g. 'https://abcdefghijk.supabase.co'
  SUPABASE_ANON_KEY: '',  // Settings → API → Project API keys → anon public

  // true  = admin.html shows every enquiry to anyone with the link, no
  //         sign-in — fast for testing, but the enquiry list (names,
  //         emails, phone numbers) is then public. Also run the "open"
  //         SQL in SETUP-SUPABASE.md, or the page will just show empty.
  // false = admin.html requires the staff email/password sign-in.
  ADMIN_OPEN: true
};
