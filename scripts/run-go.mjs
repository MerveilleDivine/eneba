import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const bootstrap = args[0] === "--bootstrap";
if (bootstrap) args.shift();
const envFile = join(root, bootstrap ? ".env.bootstrap.local" : ".env");
if (existsSync(envFile)) loadEnvFile(envFile);
const child = spawn("go", args, { cwd: join(root, "api"), stdio: "inherit" });
child.on("error", (error) => {
  console.error(
    error.code === "ENOENT"
      ? "Go is not on PATH. Run scripts/bootstrap.ps1, then load scripts/environment.ps1."
      : "Could not start Go.",
  );
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
