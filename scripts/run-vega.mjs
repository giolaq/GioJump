import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { resolveVegaSdk } from "./vega-sdk.mjs";

const root = resolve(import.meta.dirname, "..");
const buildRoot = resolve(root, "vega/build");
const deviceFlag = process.argv.indexOf("--device");
const device = deviceFlag >= 0 ? process.argv[deviceFlag + 1] : "VirtualDevice";
const virtualArchitecture = process.arch === "arm64" ? "aarch64" : "x86_64";
const packageArchitecture = device === "VirtualDevice" ? virtualArchitecture : "armv7";
const { command: vegaCommand } = resolveVegaSdk();

if (!device) {
  throw new Error("Pass a device after --device, for example --device VirtualDevice");
}

async function findPackages(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const packages = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return findPackages(path);
    return entry.isFile() && entry.name.endsWith(".vpkg") ? [path] : [];
  }));
  return packages.flat();
}

const packages = (await findPackages(buildRoot))
  .filter((path) => !path.includes(`${buildRoot}/private/`))
  .filter((path) => path.includes(packageArchitecture))
  .sort();
const packagePath = packages.at(-1);

if (!packagePath) {
  throw new Error(
    `No ${packageArchitecture} .vpkg found under ${buildRoot}. Run npm run vega:build first.`,
  );
}

console.log(`Launching ${packagePath} on ${device}`);
const child = spawn(
  vegaCommand,
  ["run-app", packagePath, "com.giolaq.giojump.main", "-d", device],
  { stdio: "inherit" },
);

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
