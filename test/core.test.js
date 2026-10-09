const test = require("node:test");
const assert = require("node:assert");
const S = require("../src/core.js");
const eps = require("./fixture.js");
const today = "2026-10-08";
const names = (r) => r.map((x) => x.name);

test("default prefs: premieres on default services, English only", () => {
  const r = S.recommend(eps, {}, today);
  assert.deepStrictEqual(names(r).sort(), ["Test BBC Mystery", "Test Horror Show", "Test New Thriller", "Test Returning Comedy"].sort());
});

test("liked genres rank first and give reasons", () => {
  const r = S.recommend(eps, { likedGenres: ["Comedy"] }, today);
  assert.strictEqual(r[0].name, "Test Returning Comedy");
  assert.ok(r[0].reasons.some((x) => x.includes("Comedy")));
});

test("disliked genres, hidden shows and new-season toggle", () => {
  const r = S.recommend(eps, { dislikedGenres: ["Horror"], hiddenShows: ["test bbc mystery"], includeNewSeasons: false }, today);
  assert.deepStrictEqual(names(r), ["Test New Thriller"]);
});

test("followed shows appear even mid-season and off-service", () => {
  const r = S.recommend(eps, { services: ["Netflix"], followedShows: ["Test Followed Show"] }, today);
  assert.strictEqual(r[0].name, "Test Followed Show");
  assert.strictEqual(r[0].episode, 6);
});

test("service mapping", () => {
  assert.strictEqual(S.serviceFor({ network: { name: "BBC Three" } }), "BBC iPlayer");
  assert.strictEqual(S.serviceFor({ network: { name: "Sky Atlantic" } }), "Sky / NOW");
  assert.strictEqual(S.serviceFor({ webChannel: { name: "Apple TV+" } }), "Apple TV+");
  assert.strictEqual(S.serviceFor({ network: { name: "ITV1" } }), "ITVX");
  assert.strictEqual(S.serviceFor({ webChannel: { name: "Tencent QQ" } }), null);
});

test("fetchUpcoming spaces calls, retries 429, uses cache", async () => {
  const calls = [];
  let first429 = true;
  const fetchFn = async (url) => {
    calls.push(url);
    if (first429) { first429 = false; return { status: 429, ok: false }; }
    return { status: 200, ok: true, json: async () => (url.includes("/web") ? [eps[0]] : [eps[6]]) };
  };
  const store = new Map();
  const cache = { get: (k) => store.get(k), set: (k, v) => store.set(k, v) };
  const out = await S.fetchUpcoming({ fetchFn, today, days: 1, cache, gapMs: 0 });
  assert.strictEqual(out.length, 4);
  assert.strictEqual(out[0].show.name, "Test New Thriller");
  const n = calls.length;
  await S.fetchUpcoming({ fetchFn, today, days: 1, cache, gapMs: 0 });
  assert.strictEqual(calls.length, n);
});

test("UK only: regional channels elsewhere are dropped, UK-carried ones kept", () => {
  assert.strictEqual(S.serviceFor({ webChannel: { name: "Netflix", country: null } }), "Netflix");
  assert.strictEqual(S.serviceFor({ webChannel: { name: "Disney+", country: { code: "JP" } } }), null);
  assert.strictEqual(S.serviceFor({ network: { name: "ITV1", country: { code: "GB" } } }), "ITVX");
  assert.strictEqual(S.serviceFor({ network: { name: "HBO", country: { code: "US" } } }), "Sky / NOW");
  assert.strictEqual(S.serviceFor({ network: { name: "NBC", country: { code: "US" } } }), null);
  assert.strictEqual(S.serviceFor({ network: { name: "Sky", country: { code: "DE" } } }), null);
});

test("network errors are retried, a failing day is skipped, total failure throws", async () => {
  let n = 0;
  const flaky = async (url) => {
    n++;
    if (n === 1) throw new TypeError("Failed to fetch");
    if (url.includes("2026-10-09")) return { status: 500, ok: false };
    return { status: 200, ok: true, json: async () => [] };
  };
  const errs = [];
  const out = await S.fetchUpcoming({ fetchFn: flaky, today, days: 2, gapMs: 0, onError: (e, d) => errs.push([e.kind, d]) });
  assert.deepStrictEqual(out, []);
  assert.deepStrictEqual(errs, [["http", "2026-10-09"]]);

  const dead = async () => { throw new TypeError("Failed to fetch"); };
  const t0 = Date.now();
  await assert.rejects(S.fetchUpcoming({ fetchFn: dead, today, days: 28, gapMs: 0 }), (e) => e.kind === "blocked");
  console.log("gave up after", Date.now() - t0, "ms");
});

test("bothWant: only shows each person is keen on and can watch", () => {
  const a = { likedGenres: ["Crime"], followedShows: ["Test Returning Comedy"] };
  const b = { likedGenres: ["Thriller", "Mystery"], followedShows: ["Test Returning Comedy"], hiddenShows: ["Test BBC Mystery"] };
  const r = S.bothWant(eps, a, b, today);
  // Thriller: A likes Crime, B likes Thriller -> both keen. BBC Mystery: B hid it. Comedy: both follow.
  assert.deepStrictEqual(names(r).sort(), ["Test New Thriller", "Test Returning Comedy"]);
  assert.ok(r.every((x) => x.reasonsA.length && x.reasonsB.length));
  assert.deepStrictEqual(S.bothWant(eps, {}, {}, today), []);
  // B lacks Netflix -> the thriller drops out
  const r2 = S.bothWant(eps, a, { ...b, services: ["Apple TV+"] }, today);
  assert.deepStrictEqual(names(r2), ["Test Returning Comedy"]);
});

test("arrived: premieres from the last lookBack days, newest window only", () => {
  const past = [
    { id: 1001, season: 1, number: 1, airdate: "2026-09-20", _embedded: { show: { id: 50, name: "Test Fresh Netflix", genres: ["Crime"], language: "English", webChannel: { name: "Netflix" } } } },
    { id: 1002, season: 2, number: 3, airdate: "2026-09-25", _embedded: { show: { id: 51, name: "Test Midseason", genres: [], language: "English", webChannel: { name: "Netflix" } } } },
    { id: 1003, season: 1, number: 1, airdate: "2026-08-01", _embedded: { show: { id: 52, name: "Test Too Old", genres: [], language: "English", webChannel: { name: "Netflix" } } } },
  ];
  const r = S.recommend([...eps, ...past], { followedShows: ["Test Midseason"] }, today, { arrived: true });
  assert.deepStrictEqual(names(r), ["Test Fresh Netflix"]);
  assert.strictEqual(r[0].daysAway, -18);
  assert.ok(!S.recommend([...eps, ...past], {}, today).some((x) => x.name === "Test Fresh Netflix"));
});

test("fetchUpcoming with back fetches past days after upcoming ones", async () => {
  const dates = [];
  const fetchFn = async (u) => { dates.push(new URL(u).searchParams.get("date")); return { status: 200, ok: true, json: async () => [] }; };
  await S.fetchUpcoming({ fetchFn, today, days: 1, back: 2, gapMs: 0 });
  assert.deepStrictEqual([...new Set(dates)], ["2026-10-08", "2026-10-09", "2026-10-07", "2026-10-06"]);
});
