import { delimiter } from "node:path";
import { spawn } from "node:child_process";
import { resolveVegaSdk } from "./vega-sdk.mjs";

const [command, ...args] = process.argv.slice(2);

if (!command) {
  throw new Error("Pass the command to run with the active Vega SDK");
}

const { binDirectory, sdkPath } = resolveVegaSdk();
const environment = { ...process.env };

if (binDirectory) {
  environment.PATH = `${binDirectory}${delimiter}${environment.PATH ?? ""}`;
}
if (sdkPath) {
  environment.KEPLER_SDK_PATH = sdkPath;
}

const child = spawn(command, args, {
  env: environment,
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(`Unable to start ${command}: ${error.message}`);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
