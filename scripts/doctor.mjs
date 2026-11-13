import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { loadEnvFile } from "node:process";

let failed = false;
function report(name, ok, detail) {
  console.log((ok ? "OK   " : "FAIL ") + name + ": " + detail);
  if (!ok) failed = true;
}
const nodeVersion = readFileSync(".node-version", "utf8").trim();
const goVersion = readFileSync(".go-version", "utf8").trim();
const postgresVersion = readFileSync(".postgres-version", "utf8").trim();
report("Node", process.versions.node === nodeVersion, process.versions.node);
const go = spawnSync("go", ["version"], { encoding: "utf8" });
report(
  "Go",
  go.status === 0 && go.stdout.includes("go" + goVersion + " "),
  go.stdout?.trim() || "load scripts/environment.ps1",
);
report(
  "Dependencies",
  existsSync("node_modules/.package-lock.json"),
  "npm ci restores the root lockfile",
);
const configured = existsSync(".env");
report(
  "Local configuration",
  configured,
  configured ? "present; credentials hidden" : "run npm run db:provision",
);
if (configured) {
  loadEnvFile(".env");
  const keys = [
    "DATABASE_URL",
    "MIGRATION_DATABASE_URL",
    "TEST_DATABASE_URL",
    "TEST_MIGRATION_DATABASE_URL",
  ];
  for (const key of keys)
    report(key, Boolean(process.env[key]), process.env[key] ? "configured" : "missing");
  try {
    const database = new URL(process.env.DATABASE_URL);
    const ready = spawnSync("psql", ["-X", "-w", "-A", "-t", "-c", "SHOW server_version"], {
      encoding: "utf8",
      timeout: 5000,
      env: {
        ...process.env,
        PGHOST: database.hostname,
        PGPORT: database.port || "5432",
        PGUSER: decodeURIComponent(database.username),
        PGPASSWORD: decodeURIComponent(database.password),
        PGDATABASE: database.pathname.slice(1),
        PGCONNECT_TIMEOUT: "3",
        PGSSLMODE: database.searchParams.get("sslmode") || "prefer",
      },
    });
    report(
      "PostgreSQL",
      ready.status === 0 && ready.stdout.trim().split(" ")[0] === postgresVersion,
      ready.status === 0
        ? "authenticated; server " + ready.stdout.trim() + "; expected " + postgresVersion
        : "check the project cluster, credentials and PostgreSQL client PATH",
    );
  } catch {
    report("PostgreSQL", false, "invalid local configuration");
  }
}
process.exitCode = failed ? 1 : 0;
