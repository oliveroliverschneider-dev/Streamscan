// Streamscan sync: keeps one shared copy of both profiles and the watched list online,
// so every phone (and the home-screen app, which iOS keeps separate from Safari) sees
// the same thing. Pure merge logic plus a tiny Firestore REST client; no SDK.

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L

// 12 random characters (~59 bits), shown as XXXX-XXXX-XXXX. The code is the only key
// to a household's lists, so it must not be guessable.
function makeCode(randomBytes) {
  const bytes = randomBytes(12);
  let s = "";
  for (let i = 0; i < 12; i++) s += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}

function normaliseCode(input) {
  const s = String(input || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (s.length !== 12 || [...s].some((c) => !CODE_ALPHABET.includes(c))) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}

// Combine two copies of the shared state.
// - Each profile: whichever copy was edited more recently wins (the remote copy on a tie).
// - Watched shows: union of both, except shows moved back out of the archive after
//   they were marked watched (recorded in `unwatched` as id -> time).
function mergeState(local, remote) {
  if (!remote) return local;
  if (!local) return remote;
  const profiles = [0, 1].map((i) => {
    const a = local.profiles && local.profiles[i], b = remote.profiles && remote.profiles[i];
    if (!a) return b;
    if (!b) return a;
    return (b.updatedAt || 0) >= (a.updatedAt || 0) ? b : a; // a tie goes to the shared copy
  });
  const unwatched = { ...(remote.unwatched || {}) };
  for (const [id, t] of Object.entries(local.unwatched || {})) unwatched[id] = Math.max(t, unwatched[id] || 0);
  const byId = new Map();
  for (const w of [...(remote.watched || []), ...(local.watched || [])]) {
    const prev = byId.get(w.id);
    if (!prev || (w.at || 0) > (prev.at || 0)) byId.set(w.id, w);
  }
  const watched = [...byId.values()]
    .filter((w) => !((unwatched[w.id] || 0) > (w.at || 0)))
    .sort((x, y) => (y.at || 0) - (x.at || 0));
  return { profiles, watched, unwatched };
}

// Firestore over plain REST. Each household is one document holding the state as a JSON
// string. Security rules only allow reading or writing a single household by its code.
function firestoreStore({ apiKey, projectId }, fetchFn) {
  const url = (code) =>
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/households/${encodeURIComponent(code)}?key=${encodeURIComponent(apiKey)}`;
  return {
    async get(code) {
      const res = await fetchFn(url(code));
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Sync server returned ${res.status}`);
      const doc = await res.json();
      const raw = doc.fields && doc.fields.data && doc.fields.data.stringValue;
      return raw ? JSON.parse(raw) : null;
    },
    async put(code, state) {
      const res = await fetchFn(url(code), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: { data: { stringValue: JSON.stringify(state) }, updated: { timestampValue: new Date().toISOString() } } }),
      });
      if (!res.ok) throw new Error(`Sync server returned ${res.status}`);
    },
  };
}

// Pull the remote copy, merge it with ours, push the result back. Returns the merged state.
async function syncOnce(store, code, local) {
  const remote = await store.get(code);
  const merged = mergeState(local, remote);
  if (JSON.stringify(merged) !== JSON.stringify(remote)) await store.put(code, merged);
  return merged;
}

const StreamscanSync = { makeCode, normaliseCode, mergeState, firestoreStore, syncOnce };
if (typeof module !== "undefined" && module.exports) module.exports = StreamscanSync;
if (typeof window !== "undefined") window.StreamscanSync = StreamscanSync;
