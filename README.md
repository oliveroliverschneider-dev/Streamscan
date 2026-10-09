# Streamscan

Tells you which new series and new seasons are coming to your UK streaming services, ranked by your tastes.

## Use it
Open https://oliveroliverschneider-dev.github.io/Streamscan/ on your phone or computer, or download `index.html` and open it in a browser. It reads live listings from TVmaze, a free site that already tracks Netflix, Prime Video, Disney+, Apple TV+, Paramount+, Sky/NOW (including HBO), iPlayer, ITVX, Channel 4 and more. Two profiles (Nicola and Oliver) each keep their own services, genres, followed and hidden shows, saved in that browser. "Follow" a show to see every new episode; "Not for me" hides it.

## On iPhone
Open the web address in Safari, then Share > Add to Home Screen. "Send to other phone" makes a link holding both profiles; open it on the other phone to load them there.

## How it works
- `src/core.js`: fetches TVmaze's schedule day by day (all streaming releases worldwide plus UK broadcast TV), keeps premieres (new series and new seasons) on your services, UK only: channels based in other countries are dropped unless they stream here (HBO, Hulu, Paramount+), and scores them by liked genres, rating and popularity.
- `src/app.html`: the page; `node build.js` inlines core.js into `index.html`, which GitHub Pages serves.
- `scan.js`: command-line digest, `node scan.js prefs.json --out digest.md`. Used for scheduled updates.
- Tests: `node --test test/core.test.js` (synthetic data).

Listings © TVmaze, CC BY-SA.
