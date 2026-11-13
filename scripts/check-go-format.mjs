import { spawnSync } from "node:child_process";

const result = spawnSync("gofmt", ["-l", "api"], { encoding: "utf8" });
if (result.error || result.status !== 0) {
  console.error("Could not run gofmt. Check the Go toolchain.");
  process.exit(1);
}
if (result.stdout.trim()) {
  console.error("Run gofmt -w api to format:\n" + result.stdout);
  process.exit(1);
}
console.log("Go formatting is clean.");
