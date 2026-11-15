import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const prettier = join("node_modules", "prettier", "bin", "prettier.cjs");
const maxBuffer = 10 * 1024 * 1024;
const list = spawnSync(process.execPath, [prettier, "--list-different", "."], {
  encoding: "utf8",
  maxBuffer,
});

if (list.error || (list.status !== 0 && list.status !== 1)) {
  console.error(list.stderr || list.error || "Could not run Prettier.");
  process.exit(1);
}
if (list.status === 0) {
  console.log("Prettier formatting is clean.");
  process.exit(0);
}

const files = list.stdout.trim().split(/\r?\n/).filter(Boolean);
if (files.length === 0) {
  console.error(list.stderr || "Prettier failed without identifying a file.");
  process.exit(1);
}

const directory = mkdtempSync(join(tmpdir(), "eneba-format-"));
try {
  for (const [index, path] of files.entries()) {
    const source = readFileSync(path, "utf8");
    const formatted = spawnSync(
      process.execPath,
      [prettier, "--stdin-filepath", path],
      { input: source, encoding: "utf8", maxBuffer },
    );
    if (formatted.error || formatted.status !== 0) {
      console.error(formatted.stderr || formatted.error || "Could not format " + path);
      process.exitCode = 1;
      continue;
    }
    const before = join(directory, "before-" + index + ".txt");
    const after = join(directory, "after-" + index + ".txt");
    writeFileSync(before, source);
    writeFileSync(after, formatted.stdout);
    const diff = spawnSync("git", ["--no-pager", "diff", "--no-index", "--", before, after], {
      encoding: "utf8",
      maxBuffer,
    });
    console.error("Formatting mismatch: " + path);
    if (diff.status === 1) {
      console.error(diff.stdout);
    } else {
      console.error(diff.stderr || "Could not produce a formatting diff.");
    }
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}

console.error("Run npm run format before committing.");
process.exitCode = 1;
