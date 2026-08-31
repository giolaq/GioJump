import { spawn } from "node:child_process";
import { resolveVegaSdk } from "./vega-sdk.mjs";

const { command: vegaCommand } = resolveVegaSdk();

const child = spawn(vegaCommand, process.argv.slice(2), { stdio: "inherit" });

child.on("error", (error) => {
  console.error(
    `Unable to start the Vega CLI: ${error.message}. Source ~/vega/env first.`,
  );
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
