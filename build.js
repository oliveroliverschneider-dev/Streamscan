// Inlines src/core.js into src/app.html to make one file you can open in any browser.
const fs = require("fs");
const path = require("path");
const core = fs.readFileSync(path.join(__dirname, "src/core.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "src/app.html"), "utf8").replace("/*CORE*/", () => core);
fs.writeFileSync(path.join(__dirname, "index.html"), html);
console.log("Built index.html");
