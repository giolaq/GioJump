import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "dist");
const destination = resolve(root, "vega/assets/game");

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });

// file:// documents have an opaque origin in Chromium. Vite's default
// `crossorigin` module tags therefore reject adjacent packaged assets even
// though they live under /pkg/assets. The production bundle is self-contained,
// so load it as a classic script for Vega's local WebView origin.
const indexPath = resolve(destination, "index.html");
const index = await readFile(indexPath, "utf8");
const vegaIndex = index
  .replace('<script type="module" crossorigin src=', "<script defer src=")
  .replace(
    '<link rel="stylesheet" crossorigin href=',
    '<link rel="stylesheet" href=',
  );

if (vegaIndex === index) {
  throw new Error("Vite asset tags changed; Vega local-file rewrite was not applied");
}

await writeFile(indexPath, vegaIndex);

console.log(`Synced web assets to ${destination}`);
