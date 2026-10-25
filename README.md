# Our Cinema

A private, shared watchlist for Aleks and Alina.

**Live site:** https://sentvinsent.github.io/Our-Cinema/

## What it does
- Lists: Proposed, Agreed, Watching, Watched, Recommended and Declined (with an Everyone / Aleks / Alina / Both filter).
  Tabs on desktop; on phones a list button in a bar at the bottom of the screen opens a panel with all lists and their counts.
- Type a title in English or Ukrainian and pick it from the TMDB suggestions. The site fills in:
  both names, year, runtime, genres, EN and UA descriptions, the poster, and the YouTube
  links for the English trailer and (when TMDB lists one) the Ukrainian trailer.
- Trailers play inside the page.
- Each film has a Yes/No vote for whoever is signed in (your partner's vote is shown read-only; the database
  only lets each of you change your own) and a Watched checkbox. The tab follows the votes:
  both Yes → Agreed, one No → Declined by that person, both No → Declined by both. Watched overrides all.
- Once a title is marked Watched, the Yes/No votes turn into 1–10 star ratings for Aleks and Alina
  (one row of ten stars each; tap the same star again to clear it); the average shows as a ★ badge next to the title.
- Changes show up live on the other person's device.
- **Where to watch:** each unwatched title shows tags for the streaming services that carry it in Poland
  (TMDB data, refreshed in the background: series daily, films every few days).
- **Що дивимось?** — the dice button picks a random title from Погоджені, following the Усі / Фільми / Серіали filter.
- **Series tracking:** «Почали дивитись» moves a series to the Дивимось tab, where you pick the season and episode and
  tap «Переглянули серію» to move on. Badges show upcoming and newly released seasons.
- **Рекомендовані:** suggestions from TMDB based on titles you rated 7+ or both agreed on; add them in one tap or hide them.
- **Статистика** (account menu): totals, hours, average ratings, how often you agree, top genres, titles per month.
- **Notifications:** a short message on the site when the other person adds, votes, rates or deletes something, a
  «Нове» badge on titles they added since your last visit, and optional phone notifications (account menu) when
  the other person adds or deletes a title.
- **Installable:** add it to the home screen to open it like an app.
- **Compact list + details:** phone cards show the essentials and one action for that list (vote, mark watched, start a
  series, next episode, or ratings); tap a card for details (one description with a UA/EN switch, trailers, where to
  watch, all actions, edit/delete). On desktop the table's poster and title open the same panel.
- **Swipe voting:** «Голосувати» on the Proposed summary opens titles waiting for your vote one at a time — swipe or
  tap right for Yes, left for No (arrow keys on desktop). Matches get a small burst and a vibration on Android.
- The site opens on the list that needs you (Proposed if something waits for your vote, then Watching, then Agreed).
- **Languages:** Ukrainian or English (switch in the account menu or on the sign-in screen). The choice is saved on the
  device and in your account, and also sets which title/description/trailer comes first, the language of
  recommendations and of phone notifications. English text lives in `i18n.js`, keyed by the Ukrainian original.
- Shows 10 items at a time with a "show more" button; filter by films or series.
- Table on desktop, cards on phones; dark glass theme in black, graphite and aquamarine (`glass.css`); short animations (off when the device asks for reduced motion).

## How it works
- Static site (`index.html`, `styles.css`, `app.js`) hosted on GitHub Pages.
- **Supabase** handles sign-in (one-time email link) and stores the list.
  Access rules in `supabase/setup.sql` let only the two member accounts read or change anything,
  so the public code and the public anon key in `config.js` expose no data.
- **TMDB** supplies film data. The browser never sees the TMDB key: the page calls the database
  function `tmdb()` (in `supabase/tmdb-proxy.sql`), which checks the caller is a member, reads the key
  from a table no browser can read, and calls TMDB from the server.

## Setting it up again from scratch
1. Create a Supabase project. In the SQL editor, run `supabase/setup.sql` (after replacing the two
   placeholder emails), then `supabase/tmdb-proxy.sql`, then store the TMDB key with the insert
   shown in the comments of `tmdb-proxy.sql`.
2. In Supabase → Authentication → URL Configuration, set the Site URL to the GitHub Pages address.
3. Put the project URL and anon key in `config.js`.
4. Enable GitHub Pages for this repository (branch `main`, root folder).
5. Run `supabase/features.sql`, then `supabase/notifications.sql`. For phone notifications, deploy
   `supabase/functions/notify` (JWT verification off — it checks its own secret), add `hook_secret`, `vapid_public`
   and `vapid_private` rows to `app_secrets`, and put the public key in `config.js` as `vapidPublicKey`.
6. `.github/workflows/keepalive.yml` pings the database daily so the free Supabase project never pauses.

## Samsung Internet
The page declares its own dark theme (`color-scheme: light dark` plus a `prefers-color-scheme: dark` rule), which is how
Samsung Internet's "Force Dark mode for web content" is told to leave a site alone. Older Samsung Internet versions ignore
this; there, turn on Settings → Labs → "Use website dark theme".

This product uses the TMDB API but is not endorsed or certified by TMDB.

## Security
- Only the two member emails can read or change the list (row-level security on every table).
- The TMDB key is in `app_secrets`, which has RLS on, no policies and no grants, so no browser can read it.
  `tmdb()` is the only way in: it checks membership, allows only TMDB search and details paths,
  and keeps a fixed search path.
- Sign-in is email + password. The first password (and any reset) is set after opening a one-time
  email link, which proves the address belongs to you.
- Only the two member emails can get an account (`supabase/auth-hook.sql`, a Before User Created hook),
  so setup links can't be sent to other addresses. Sign-in attempts are rate-limited per IP, the
  project sends at most 2 emails an hour, and the site locks the setup-link button for 60 seconds
  after each send. Passwords must be at least 10 characters.
- The page sends a Content Security Policy, and the Supabase library is pinned with an integrity hash.
- No secrets are in this repository. The anon key in `config.js` is public by design.
- Phone notifications: each browser's subscription is readable only by its owner; the database signs its calls to the
  `notify` function with a secret, and the signing keys stay in `app_secrets`.
