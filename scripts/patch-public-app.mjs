// Idempotent and tightly scoped portal sidebar change: does not overwrite App.jsx.
import fs from "node:fs";
import path from "node:path";
const [root, action] = process.argv.slice(2);
if (!root || !["check", "apply"].includes(action)) throw Error("Usage: node patch-app.mjs <projectRoot> check|apply");
const file = path.join(root, "frontend", "src", "app", "App.jsx");
const source = fs.readFileSync(file,"utf8");
const marker = "GOYALNEST_VISIT_HOMEPAGE_V1";
if (source.includes(marker)) { console.log("App.jsx: Visit Homepage link already installed"); process.exit(0); }
const anchor = '<div className="sidebar-bottom">';
const occurrences = source.split(anchor).length - 1;
if (occurrences !== 1) throw Error(`App.jsx: expected one sidebar-bottom anchor, found ${occurrences}. No changes made.`);
if (!source.includes('const navigate = useNavigate()') && !source.includes('const navigate=useNavigate()')) throw Error("App.jsx: navigate hook not found; no change made");
const addition = `${anchor}
          {/* ${marker} */}
          <button type="button" className="nav-item gn-visit-homepage" title="Visit GoyalNest Homepage" onClick={() => { setMobileNavOpen(false); navigate("/"); }}>
            <span aria-hidden="true">⌂</span> &nbsp; Visit Homepage
          </button>`;
if (action === "apply") {fs.writeFileSync(file,source.replace(anchor,addition),"utf8"); console.log("App.jsx: Visit Homepage sidebar link installed");}
else console.log("App.jsx: portal sidebar insertion compatible");
