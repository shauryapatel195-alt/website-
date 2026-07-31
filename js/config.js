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
  SUPABASE_URL: 'https://autjzjiqofgekujckorw.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1dGp6amlxb2ZnZWt1amNrb3J3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1MTMxMTAsImV4cCI6MjEwMTA4OTExMH0.vC4hI3-eJJqyGk1Py4AMb8zxMjki3tBsiIUzfKB70Dg',

  // true  = admin.html shows every enquiry to anyone with the link, no
  //         sign-in — fast for testing, but the enquiry list (names,
  //         emails, phone numbers) is then public. Also run the "open"
  //         SQL in SETUP-SUPABASE.md, or the page will just show empty.
  // false = admin.html requires the staff email/password sign-in.
  ADMIN_OPEN: true
};
