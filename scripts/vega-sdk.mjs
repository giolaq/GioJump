import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";

export function resolveVegaSdk() {
  const managerCommand = resolve(homedir(), "vega/bin/vega");

  if (existsSync(managerCommand)) {
    try {
      const installed = JSON.parse(
        execFileSync(managerCommand, ["sdk", "list-installed", "--json"], {
          encoding: "utf8",
        }),
      );
      const active = installed.versions?.find((version) => version.isActive);
      const command = active?.sdkPath
        ? resolve(active.sdkPath, "bin/vega")
        : null;

      if (command && existsSync(command)) {
        return { command, sdkPath: active.sdkPath, binDirectory: dirname(command) };
      }
    } catch {
      // Fall through to the environment or PATH for older SDK managers.
    }
  }

  const sdkPath = process.env.KEPLER_SDK_PATH;
  const command = sdkPath ? resolve(sdkPath, "bin/vega") : null;
  if (command && existsSync(command)) {
    return { command, sdkPath, binDirectory: dirname(command) };
  }

  return { command: "vega", sdkPath: null, binDirectory: null };
}
