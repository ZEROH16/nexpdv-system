import { spawnSync } from "node:child_process";

const isWindows = process.platform === "win32";

process.env.VITE_NEXPDV_API_URL ||= "https://nexpdvapi-production.up.railway.app";

const run = (args) => {
  const command = isWindows ? "cmd.exe" : "npm";
  const commandArgs = isWindows ? ["/d", "/s", "/c", "npm", ...args] : args;
  const result = spawnSync(command, commandArgs, {
    stdio: "inherit",
    env: process.env
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

run(["run", "build", "-w", "@nexpdv/shared"]);
run(["run", "build", "-w", "@nexpdv/admin"]);
