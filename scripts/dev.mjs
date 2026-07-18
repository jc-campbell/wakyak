import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const tailscaleTarget = "http://127.0.0.1:5173";
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

async function findTailscaleHost() {
  try {
    const { stdout } = await execFileAsync("tailscale", ["status", "--json"]);
    const status = JSON.parse(stdout);
    if (status.BackendState !== "Running") return undefined;
    return status.Self?.DNSName?.replace(/\.$/, "") || undefined;
  } catch {
    return undefined;
  }
}

const tailscaleHost = await findTailscaleHost();
const childEnvironment = {
  ...process.env,
  ...(tailscaleHost ? { VITE_TAILSCALE_HOST: tailscaleHost } : {}),
};
const children = new Set();
let shuttingDown = false;

function start(command, args) {
  const child = spawn(command, args, {
    env: childEnvironment,
    stdio: "inherit",
  });
  children.add(child);
  child.once("exit", () => children.delete(child));
  return child;
}

function shutdown(signal, exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;
  process.exitCode = exitCode;
  for (const child of children) child.kill(signal);
}

process.once("SIGINT", () => shutdown("SIGINT", 130));
process.once("SIGTERM", () => shutdown("SIGTERM", 143));

const apps = start(pnpmCommand, ["run", "dev:apps"]);

if (tailscaleHost) {
  process.stdout.write(
    `[dev] Tailnet URL: https://${tailscaleHost} (private to your tailnet)\n`,
  );
  const tailscale = start("tailscale", [
    "serve",
    "--https=443",
    tailscaleTarget,
  ]);
  tailscale.once("exit", (code) => {
    if (!shuttingDown && code !== 0) {
      process.stderr.write(
        "[dev] Tailscale Serve stopped; localhost development is still running.\n",
      );
    }
  });
} else {
  process.stdout.write(
    "[dev] Tailscale is unavailable or disconnected; starting localhost only.\n",
  );
}

apps.once("exit", (code, signal) => {
  const exitCode = code ?? (signal ? 1 : 0);
  shutdown("SIGTERM", exitCode);
});
