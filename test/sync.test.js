const test = require("node:test");
const assert = require("node:assert");
const Y = require("../src/sync.js");
const crypto = require("node:crypto");

test("codes are 12 unambiguous chars and normalise from sloppy typing", () => {
  const c = Y.makeCode((n) => crypto.randomBytes(n));
  assert.match(c, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.strictEqual(Y.normaliseCode(c.toLowerCase().replace(/-/g, " ")), c);
  assert.strictEqual(Y.normaliseCode("abc"), null);
  assert.strictEqual(Y.normaliseCode("O0O0-1111-IIII"), null);
});

test("merge: newer profile wins per person, watched unions, undo sticks", () => {
  const local = {
    profiles: [{ name: "Nicola", prefs: { likedGenres: ["Crime"] }, updatedAt: 200 }, { name: "Oliver", prefs: { likedGenres: [] }, updatedAt: 100 }],
    watched: [{ id: 1, name: "A", at: 10 }, { id: 2, name: "B", at: 20 }],
    unwatched: { 3: 50 },
  };
  const remote = {
    profiles: [{ name: "Nicola", prefs: { likedGenres: [] }, updatedAt: 150 }, { name: "Oliver", prefs: { likedGenres: ["Comedy"] }, updatedAt: 300 }],
    watched: [{ id: 3, name: "C", at: 40 }, { id: 4, name: "D", at: 60 }],
    unwatched: { 2: 30 },
  };
  const m = Y.mergeState(local, remote);
  assert.deepStrictEqual(m.profiles.map((p) => p.prefs.likedGenres), [["Crime"], ["Comedy"]]);
  assert.deepStrictEqual(m.watched.map((w) => w.id), [4, 1]); // 2 and 3 were moved back later
  assert.deepStrictEqual(Y.mergeState(local, null), local);
});

test("syncOnce talks Firestore REST and skips writing when nothing changed", async () => {
  const docs = new Map(); const calls = [];
  const fetchFn = async (url, opt = {}) => {
    calls.push(opt.method || "GET");
    assert.match(url, /^https:\/\/firestore\.googleapis\.com\/v1\/projects\/p1\/databases\/\(default\)\/documents\/households\/ABCD-EFGH-JKMN\?key=k1$/);
    if (opt.method === "PATCH") { docs.set(url, JSON.parse(opt.body)); return { ok: true, status: 200 }; }
    return docs.has(url) ? { ok: true, status: 200, json: async () => docs.get(url) } : { ok: false, status: 404 };
  };
  const store = Y.firestoreStore({ apiKey: "k1", projectId: "p1" }, fetchFn);
  const state = { profiles: [{ name: "Nicola", prefs: {}, updatedAt: 1 }, { name: "Oliver", prefs: {}, updatedAt: 1 }], watched: [], unwatched: {} };
  const a = await Y.syncOnce(store, "ABCD-EFGH-JKMN", state);
  assert.deepStrictEqual(a, state);
  assert.deepStrictEqual(calls, ["GET", "PATCH"]);
  await Y.syncOnce(store, "ABCD-EFGH-JKMN", state);
  assert.deepStrictEqual(calls, ["GET", "PATCH", "GET"]);
  assert.deepStrictEqual(await store.get("ABCD-EFGH-JKMN"), state);
});
