// Streamscan core: turns TVmaze schedule data into personalised picks.
// Pure functions only, shared by the browser app and the command-line scanner.

const SERVICES = {
  "Netflix": ["netflix"],
  "Prime Video": ["prime video"],
  "Disney+": ["disney+", "hulu", "star"],
  "Apple TV+": ["apple tv"],
  "Paramount+": ["paramount+"],
  "Sky / NOW": ["sky atlantic", "sky max", "sky one", "sky showcase", "sky comedy", "sky witness", "sky documentaries", "sky nature", "sky crime", "sky arts", "sky", "now", "hbo", "hbo max"],
  "BBC iPlayer": ["bbc"],
  "ITVX": ["itv"],
  "Channel 4": ["channel 4", "e4", "more4", "film4"],
  "Channel 5": ["channel 5", "5star", "my5", "5usa"],
  "U (UKTV)": ["dave", "gold", "alibi", "drama", "yesterday", "w", "u&"],
  "BritBox": ["britbox"],
  "MUBI": ["mubi"],
  "Crunchyroll": ["crunchyroll"],
};

const DEFAULT_PREFS = {
  services: ["Netflix", "Prime Video", "Disney+", "Apple TV+", "BBC iPlayer", "ITVX", "Channel 4"],
  likedGenres: [],
  dislikedGenres: [],
  followedShows: [],
  hiddenShows: [],
  languages: ["English"],
  days: 28,
  lookBack: 30,
  includeNewSeasons: true,
};

const GENRES = ["Action", "Adventure", "Anime", "Children", "Comedy", "Crime", "Drama", "Espionage", "Family", "Fantasy", "Food", "History", "Horror", "Legal", "Medical", "Music", "Mystery", "Nature", "Romance", "Science-Fiction", "Sports", "Supernatural", "Thriller", "Travel", "War", "Western"];

const norm = (s) => (s || "").toLowerCase().trim();

// TVmaze puts the show under _embedded.show for web/full schedules and under show for broadcast ones.
function showOf(ep) {
  return (ep._embedded && ep._embedded.show) || ep.show || null;
}

function outletOf(show) {
  const ch = show.webChannel || show.network;
  return ch ? ch.name : "";
}

// Outlets based outside the UK whose shows still stream here (HBO via Sky/NOW,
// Hulu originals on Disney+, Paramount+ originals on Paramount+ UK).
const UK_CARRIED_FOREIGN = ["hbo", "hbo max", "hulu", "paramount+"];

// UK only: a channel counts if it is global (no country), British, or carried in the UK.
function availableInUK(ch) {
  const code = ch.country && ch.country.code;
  return !code || code === "GB" || UK_CARRIED_FOREIGN.includes(norm(ch.name));
}

// Which of the known UK services a show's network or web channel belongs to, if any.
// Exact match first, then prefix match, so "Sky Atlantic" beats the bare "sky".
function serviceFor(show) {
  const names = [show.webChannel, show.network].filter(Boolean).filter(availableInUK).map((c) => norm(c.name));
  for (const name of names) {
    for (const [service, keys] of Object.entries(SERVICES)) {
      if (keys.includes(name)) return service;
    }
  }
  for (const name of names) {
    for (const [service, keys] of Object.entries(SERVICES)) {
      if (keys.some((k) => k.length > 2 && name.startsWith(k))) return service;
    }
  }
  return null;
}

function stripHtml(s) {
  return (s || "").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
}

// Collapse a list of episodes into one entry per show, keeping its earliest upcoming episode.
function groupByShow(episodes) {
  const byShow = new Map();
  for (const ep of episodes) {
    const show = showOf(ep);
    if (!show || !ep.airdate) continue;
    const prev = byShow.get(show.id);
    if (!prev) {
      byShow.set(show.id, { show, first: ep, episodes: 1 });
    } else {
      prev.episodes += 1;
      if (ep.airdate < prev.first.airdate || (ep.airdate === prev.first.airdate && (ep.number || 99) < (prev.first.number || 99))) prev.first = ep;
    }
  }
  return [...byShow.values()];
}

function kindOf(ep) {
  if (ep.number === 1 && ep.season === 1) return "new-show";
  if (ep.number === 1) return "new-season";
  return "continuing";
}

// Score one show for these preferences. Returns null when it should be left out entirely.
function scoreShow(entry, prefs, today) {
  const { show, first } = entry;
  const name = norm(show.name);
  if (prefs.hiddenShows.map(norm).includes(name)) return null;

  const followed = prefs.followedShows.map(norm).includes(name);
  const service = serviceFor(show);
  if (!followed) {
    if (!service || !prefs.services.includes(service)) return null;
    if (prefs.languages.length && show.language && !prefs.languages.includes(show.language)) return null;
  }

  const kind = kindOf(first);
  if (!followed) {
    if (kind === "continuing") return null;
    if (kind === "new-season" && !prefs.includeNewSeasons) return null;
  }

  const genres = show.genres || [];
  const disliked = genres.filter((g) => prefs.dislikedGenres.includes(g));
  if (disliked.length && !followed) return null;
  const liked = genres.filter((g) => prefs.likedGenres.includes(g));

  let score = 0;
  const reasons = [];
  if (followed) { score += 100; reasons.push("You follow this show"); }
  if (kind === "new-show") { score += 20; reasons.push("Brand new series"); }
  if (kind === "new-season") { score += 12; reasons.push(`Season ${first.season} premiere`); }
  if (liked.length) { score += 15 * liked.length; reasons.push(`You like ${liked.join(", ")}`); }
  const rating = show.rating && show.rating.average;
  if (rating) { score += Math.max(0, rating - 6) * 4; if (rating >= 7.5) reasons.push(`Rated ${rating}/10 on TVmaze`); }
  if (show.weight) score += show.weight / 20; // TVmaze popularity, 0-100
  if (show.type === "Reality" || show.type === "Talk Show" || show.type === "News") score -= 8;

  const daysAway = Math.round((Date.parse(first.airdate) - Date.parse(today)) / 86400000);
  return {
    id: show.id,
    name: show.name,
    url: show.url,
    officialSite: show.officialSite || null,
    image: show.image ? show.image.medium : null,
    summary: stripHtml(show.summary),
    genres,
    language: show.language,
    type: show.type,
    rating: rating || null,
    service: service || outletOf(show),
    outlet: outletOf(show),
    kind,
    season: first.season,
    episode: first.number,
    airdate: first.airdate,
    daysAway,
    episodesComing: entry.episodes,
    followed,
    score: Math.round(score * 10) / 10,
    reasons,
  };
}

// Main entry: episodes (any TVmaze schedule shape) + prefs -> sorted picks within the window.
// opts.arrived: look back over the last prefs.lookBack days instead of ahead, keeping
// only premieres (shows that started a new series or season and are out now).
function recommend(episodes, prefsIn, today, opts = {}) {
  const prefs = { ...DEFAULT_PREFS, ...(prefsIn || {}) };
  const start = opts.arrived ? addDays(today, -prefs.lookBack) : today;
  const end = opts.arrived ? addDays(today, -1) : addDays(today, prefs.days);
  const inWindow = episodes.filter((ep) => ep.airdate && ep.airdate >= start && ep.airdate <= end);
  const seen = new Set();
  const unique = inWindow.filter((ep) => (seen.has(ep.id) ? false : (seen.add(ep.id), true)));
  return groupByShow(unique)
    .map((e) => scoreShow(e, prefs, today))
    .filter((p) => p && (!opts.arrived || p.kind !== "continuing"))
    .sort((a, b) => b.score - a.score || a.airdate.localeCompare(b.airdate));
}


// Shows both people want: each would see it on their own services and filters, and
// each has a positive reason (follows it, or it has a genre they like).
// Without that second rule, two people with default settings would "both want" everything.
function bothWant(episodes, prefsA, prefsB, today, opts = {}) {
  const keen = (p) => p && (p.followed || p.reasons.some((r) => r.startsWith("You like")));
  const b = new Map(recommend(episodes, prefsB, today, opts).map((p) => [p.id, p]));
  return recommend(episodes, prefsA, today, opts)
    .filter((p) => keen(p) && keen(b.get(p.id)))
    .map((p) => {
      const q = b.get(p.id);
      return { ...p, score: p.score + q.score, followed: p.followed || q.followed, reasonsA: p.reasons, reasonsB: q.reasons };
    })
    .sort((x, y) => y.score - x.score || x.airdate.localeCompare(y.airdate));
}

// ---- Fetching from TVmaze -------------------------------------------------
// Per day we ask for every streaming (web) release worldwide plus UK broadcast TV,
// which covers iPlayer, ITVX, Channel 4 and Sky shows. TVmaze allows ~20 calls per
// 10 seconds, so calls are spaced out and retried on 429.

const API = "https://api.tvmaze.com";

function addDays(iso, n) {
  return new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10);
}

// Keep only what scoring and display need, so caches stay small.
function trimEpisode(ep) {
  const s = showOf(ep);
  if (!s) return null;
  const ch = (c) => (c ? { name: c.name, country: c.country ? { code: c.country.code } : null } : null);
  return {
    id: ep.id, season: ep.season, number: ep.number, airdate: ep.airdate,
    show: {
      id: s.id, name: s.name, url: s.url, officialSite: s.officialSite, type: s.type, language: s.language,
      genres: s.genres, rating: s.rating, weight: s.weight, network: ch(s.network), webChannel: ch(s.webChannel),
      image: s.image ? { medium: s.image.medium } : null, summary: s.summary,
    },
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One failed TVmaze call, with a reason a person can act on.
class FetchError extends Error {
  constructor(kind, url, detail) {
    super(`${kind}: ${detail} (${url})`);
    this.kind = kind; // "blocked" (browser stopped it / no network), "rate-limited", "http"
    this.url = url;
    this.detail = detail;
  }
}

// TVmaze answers too many calls with 429. In a browser that 429 can arrive without
// CORS headers, so it shows up as a network TypeError instead; both are retried.
async function getJson(fetchFn, url, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) {
    if (i) await sleep(2000 * 2 ** (i - 1));
    let res;
    try {
      res = await fetchFn(url);
    } catch (e) {
      last = new FetchError("blocked", url, e && e.message ? e.message : String(e));
      continue;
    }
    if (res.status === 429) { last = new FetchError("rate-limited", url, "TVmaze asked us to slow down"); continue; }
    if (!res.ok) throw new FetchError("http", url, `TVmaze returned ${res.status}`);
    return res.json();
  }
  throw last;
}

// cache: optional {get(key), set(key, value)} so repeat runs skip days already fetched.
// onDay(episodesSoFar) lets a page show results while later days are still loading.
// A day that keeps failing is skipped and reported through onError; the run only
// fails outright if no day at all could be fetched.
// back: also fetch this many past days (after the upcoming ones), for "just arrived".
async function fetchUpcoming({ fetchFn, today, days, back = 0, country = "GB", cache, onProgress, onDay, onError, gapMs = 1000 }) {
  const all = [];
  let ok = 0, lastErr = null;
  const offsets = [];
  for (let d = 0; d <= days; d++) offsets.push(d);
  for (let d = 1; d <= back; d++) offsets.push(-d);
  for (let i = 0; i < offsets.length; i++) {
    const d = offsets[i];
    const date = addDays(today, d);
    const key = `day:${country}:${date}`;
    let eps = cache && cache.get(key);
    if (!eps) {
      try {
        // Until one call has worked, give up quickly so a blocked browser hears about it fast.
        const tries = ok ? 4 : 2;
        const web = await getJson(fetchFn, `${API}/schedule/web?date=${date}`, tries);
        await sleep(gapMs);
        const tv = await getJson(fetchFn, `${API}/schedule?country=${country}&date=${date}`, tries);
        await sleep(gapMs);
        eps = [...web, ...tv].map(trimEpisode).filter(Boolean);
        if (cache) cache.set(key, eps);
      } catch (e) {
        lastErr = e;
        if (onError) onError(e, date);
        // Nothing has worked yet and the browser is refusing outright: stop instead of
        // grinding through every remaining day with the same failure.
        if (!ok && i >= 1 && e.kind === "blocked") break;
        continue;
      }
    }
    ok++;
    all.push(...eps);
    if (onProgress) onProgress(i + 1, offsets.length);
    if (onDay) onDay(all);
  }
  if (!ok && lastErr) throw lastErr;
  return all;
}

const Streamscan = { bothWant, FetchError, availableInUK, fetchUpcoming, addDays, SERVICES, DEFAULT_PREFS, GENRES, serviceFor, recommend, kindOf, stripHtml };
if (typeof module !== "undefined" && module.exports) module.exports = Streamscan;
if (typeof window !== "undefined") window.Streamscan = Streamscan;
