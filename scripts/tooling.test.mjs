import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { delimiter, resolve, join, sep } from "node:path";
import test from "node:test";
import { ESLint } from "eslint";

test("commit hook verifies a complete staged snapshot", () => {
  // This disposable repository never changes this project's branch or history.
  const base = resolve(".local/hook-tests");
  mkdirSync(base, { recursive: true });
  const fixture = mkdtempSync(join(base, "snapshot-"));
  assert.ok(fixture.startsWith(base + sep));
  const hooks = join(fixture, ".git/hooks");
  const bin = join(fixture, ".git/test-bin");
  const environment = { ...process.env };
  const pathKey = Object.keys(environment).find((key) => key.toLowerCase() === "path") ?? "PATH";
  environment[pathKey] = bin + delimiter + environment[pathKey];
  const git = (...args) =>
    spawnSync("git", args, {
      cwd: fixture,
      env: environment,
      encoding: "utf8",
      timeout: 30000,
      windowsHide: true,
    });
  try {
    assert.equal(git("init", "--quiet", "--template=").status, 0);
    mkdirSync(hooks, { recursive: true });
    mkdirSync(bin, { recursive: true });
    const hook = join(hooks, "pre-commit");
    writeFileSync(hook, readFileSync(".githooks/pre-commit"));
    chmodSync(hook, 0o755);
    // Only the fixture verifier is a stub. Real project commits run npm verify.
    const verifier = join(bin, "npm");
    writeFileSync(verifier, "#!/bin/sh\nprintf '%s\\n' fixture-verifier-called\n");
    chmodSync(verifier, 0o755);
    writeFileSync(join(fixture, "app.ts"), "import './helper.ts';\n");
    writeFileSync(join(fixture, "helper.ts"), "export const value = 1;\n");
    assert.equal(git("add", "app.ts").status, 0);
    const commit = () =>
      git(
        "-c",
        "user.name=Quality fixture",
        "-c",
        "user.email=quality@example.invalid",
        "-c",
        "commit.gpgsign=false",
        "-c",
        `core.hooksPath=${hooks}`,
        "commit",
        "--allow-empty",
        "-qm",
        "Verify fixture",
      );
    const incomplete = commit();
    assert.notEqual(
      incomplete.status,
      0,
      "untracked source must not make an incomplete snapshot appear verified",
    );
    assert.match(incomplete.stderr, /untracked/i);
    assert.doesNotMatch(incomplete.stdout + incomplete.stderr, /fixture-verifier-called/);
    assert.equal(git("add", "helper.ts").status, 0);
    const complete = commit();
    assert.equal(complete.status, 0, complete.stderr);
    assert.match(complete.stdout + complete.stderr, /fixture-verifier-called/);
    writeFileSync(join(fixture, "helper.ts"), "export const value = 2;\n");
    const unstaged = commit();
    assert.notEqual(unstaged.status, 0);
    assert.match(unstaged.stderr, /unstaged tracked/i);
  } finally {
    assert.ok(resolve(fixture).startsWith(base + sep));
    rmSync(fixture, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(path)
      : /\.(ts|tsx)$/.test(entry.name)
        ? [resolve(path)]
        : [];
  });
}

test("lint discovery covers TypeScript sources and respects build ignores", async () => {
  const web = resolve("web");
  const name = ".quality-" + randomUUID() + ".tsx";
  const source = join(web, "src", name);
  const ignored = join(web, "dist", name);
  mkdirSync(join(web, "dist"), { recursive: true });
  try {
    writeFileSync(
      source,
      "const unused: number = 1;\nexport const QualityProbe = () => <div>Probe</div>;\n",
      { flag: "wx" },
    );
    writeFileSync(ignored, "invalid build artifact", { flag: "wx" });
    const eslint = new ESLint({ cwd: web });
    assert.equal(await eslint.isPathIgnored(source), false);
    assert.equal(await eslint.isPathIgnored(ignored), true);
    const results = await eslint.lintFiles(["src/**/*.{ts,tsx}"]);
    assert.deepEqual(
      results.map((result) => resolve(result.filePath)).sort(),
      sourceFiles(join(web, "src")).sort(),
    );
    assert.ok(
      results
        .find((result) => result.filePath === source)
        ?.messages.some((message) => message.ruleId === "@typescript-eslint/no-unused-vars"),
    );
  } finally {
    rmSync(source, { force: true });
    rmSync(ignored, { force: true });
  }
});

test("shared layout cannot import feature modules", async () => {
  const web = resolve("web");
  const eslint = new ESLint({ cwd: web });
  const probe = join(web, "src", "shared", "layout", "boundary-probe.ts");
  const results = await eslint.lintText(
    `import { catalogHref } from "../../features/catalog/catalog-query";\nvoid catalogHref;\n`,
    { filePath: probe },
  );
  assert.ok(results[0]?.messages.some((message) => message.ruleId === "no-restricted-imports"));
});
