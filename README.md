# Our Cinema

A private, shared watchlist for Aleks and Alina.

**Live site:** https://sentvinsent.github.io/our-cinema/

## What it does
- Tabs: Proposed, Agreed, Watched, Declined by Aleks, Declined by Alina, Declined by both.
- Type a title in English or Ukrainian and pick it from the TMDB suggestions. The site fills in:
  both names, year, runtime, genres, EN and UA descriptions, the poster, and the YouTube
  links for the English trailer and (when TMDB lists one) the Ukrainian trailer.
- Trailers play inside the page.
- Each film has Yes/No votes for Aleks and Alina and a Watched checkbox. The tab follows the votes:
  both Yes → Agreed, one No → Declined by that person, both No → Declined by both. Watched overrides all.
- Changes show up live on the other person's device.
- Table on desktop, cards on phones, light and dark themes.

## How it works
- Static site (`index.html`, `styles.css`, `app.js`) hosted on GitHub Pages.
- **Supabase** handles sign-in (one-time email link) and stores the list.
  Access rules in `supabase/setup.sql` let only the two member accounts read or change anything,
  so the public code and the public anon key in `config.js` expose no data.
- **TMDB** supplies film data. The TMDB key is saved in the database (table `app_config`),
  readable only by the two members, never in this repository.

## Setting it up again from scratch
1. Create a Supabase project. In the SQL editor, run `supabase/setup.sql` after replacing the two
   placeholder emails.
2. In Supabase → Authentication → URL Configuration, set the Site URL to the GitHub Pages address.
3. Put the project URL and anon key in `config.js`.
4. Enable GitHub Pages for this repository (branch `main`, root folder).
5. Sign in and paste the TMDB key when the site asks for it.

This product uses the TMDB API but is not endorsed or certified by TMDB.
