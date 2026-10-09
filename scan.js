#!/usr/bin/env node
// Command-line scanner: writes a Markdown digest of upcoming picks.
// Usage: node scan.js [prefs.json] [--days N] [--out digest.md] [--json picks.json]
const fs = require("fs");
const S = require("./src/core.js");

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const prefsPath = args.find((a) => a.endsWith(".json") && args[args.indexOf(a) - 1] !== "--json") || "prefs.json";
const prefs = fs.existsSync(prefsPath) ? JSON.parse(fs.readFileSync(prefsPath, "utf8")) : {};
if (opt("--days")) prefs.days = Number(opt("--days"));
const days = prefs.days || S.DEFAULT_PREFS.days;
const today = new Date().toISOString().slice(0, 10);

(async () => {
  const episodes = await S.fetchUpcoming({
    fetchFn: (u) => fetch(u), today, days,
    onProgress: (n, t) => process.stderr.write(`\rFetched ${n}/${t} days`),
  });
  process.stderr.write("\n");
  const picks = S.recommend(episodes, prefs, today);
  const fmt = (iso) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const line = (p) => {
    const what = p.followed && p.kind === "continuing" ? `new episode S${p.season}E${p.episode}` : p.kind === "new-show" ? "new series" : `season ${p.season}`;
    return `- **[${p.name}](${p.url})** · ${what} · ${fmt(p.airdate)} on ${p.service}${p.genres.length ? " · " + p.genres.join(", ") : ""}\n  ${p.reasons.join("; ")}`;
  };
  const top = picks.slice(0, 8);
  const rest = picks.slice(8).sort((a, b) => a.airdate.localeCompare(b.airdate));
  let md = `# Streamscan: next ${days} days (from ${fmt(today)})\n\n## Top picks\n${top.map(line).join("\n")}\n`;
  if (rest.length) md += `\n## Also coming\n${rest.map(line).join("\n")}\n`;
  if (!picks.length) md += "\nNothing matched your services and tastes this time.\n";
  if (opt("--out")) fs.writeFileSync(opt("--out"), md); else process.stdout.write(md);
  if (opt("--json")) fs.writeFileSync(opt("--json"), JSON.stringify(picks, null, 2));
})().catch((e) => { console.error(e.message); process.exit(1); });
