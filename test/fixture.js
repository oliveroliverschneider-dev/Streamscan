// Synthetic TVmaze-shaped data for tests only. Show names are invented.
const show = (id, name, ch, genres, extra = {}) => ({
  id, name, url: `https://www.tvmaze.com/shows/${id}`, type: "Scripted", language: "English", genres,
  rating: { average: 7 }, weight: 80, network: null, webChannel: { name: ch, country: null },
  image: null, summary: `<p>${name} summary.</p>`, ...extra,
});
const ep = (id, s, season, number, airdate, nested = true) =>
  nested ? { id, season, number, airdate, _embedded: { show: s } } : { id, season, number, airdate, show: s };

const A = show(1, "Test New Thriller", "Netflix", ["Thriller", "Crime"]);
const B = show(2, "Test Returning Comedy", "Apple TV+", ["Comedy"]);
const C = show(3, "Test Ongoing Drama", "Prime Video", ["Drama"]);
const D = show(4, "Test Horror Show", "Netflix", ["Horror"]);
const E = show(5, "Test Korean Drama", "Netflix", ["Romance"], { language: "Korean" });
const F = show(6, "Test BBC Mystery", null, ["Mystery", "Crime"], { webChannel: null, network: { name: "BBC One", country: { code: "GB" } } });
const G = show(7, "Test Paramount Show", "Paramount+", ["Drama"]);
const H = show(8, "Test Followed Show", "Prime Video", ["Drama"]);

module.exports = [
  ep(101, A, 1, 1, "2026-10-10"), ep(102, A, 1, 2, "2026-10-10"),
  ep(201, B, 3, 1, "2026-10-20"),
  ep(301, C, 2, 5, "2026-10-12"),
  ep(401, D, 1, 1, "2026-10-15"),
  ep(501, E, 1, 1, "2026-10-11"),
  ep(601, F, 1, 1, "2026-10-19", false),
  ep(701, G, 1, 1, "2026-10-14"),
  ep(801, H, 4, 6, "2026-10-13"),
  ep(901, A, 1, 1, "2026-12-30"), // outside window
];
