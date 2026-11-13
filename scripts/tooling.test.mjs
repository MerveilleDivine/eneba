import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import test from "node:test";
import { ESLint } from "eslint";

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
