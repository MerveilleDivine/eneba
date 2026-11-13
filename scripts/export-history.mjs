import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { parseEnv } from "node:util";

const source = process.argv[2];
if (!source) {
  console.error("Usage: npm run history:export -- <Codex rollout.jsonl>");
  process.exit(1);
}
const records = readFileSync(source, "utf8")
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => JSON.parse(line));
const knownSecrets = new Set();
for (const filename of [".env", ".env.bootstrap.local"]) {
  if (!existsSync(filename)) continue;
  for (const [key, value] of Object.entries(parseEnv(readFileSync(filename, "utf8")))) {
    if (/password|secret|token/i.test(key) && value.length >= 16) knownSecrets.add(value);
    if (/database_url$/i.test(key)) {
      try {
        const password = decodeURIComponent(new URL(value).password);
        if (password.length >= 16) knownSecrets.add(password);
      } catch {
        /* An invalid local URL is not a transcript secret source. */
      }
    }
  }
}
let redactions = 0;
function redact(text) {
  for (const secret of knownSecrets) {
    const occurrences = text.split(secret).length - 1;
    redactions += occurrences;
    if (occurrences) text = text.split(secret).join("[REDACTED]");
  }
  return text
    .replace(/(postgres(?:ql)?:\/\/[^:\s]+:)[^@\s]+(@)/gi, (_match, before, after) => {
      redactions++;
      return before + "[REDACTED]" + after;
    })
    .replace(
      /\b(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
      () => {
        redactions++;
        return "[REDACTED]";
      },
    );
}
const questionCalls = new Set();
const entries = [];
for (const record of records) {
  if (record.type !== "response_item" || !record.payload) continue;
  const item = record.payload;
  if (
    item.type === "message" &&
    (item.role === "user" ||
      (item.role === "assistant" && ["commentary", "final_answer"].includes(item.phase)))
  ) {
    const text = (item.content ?? [])
      .filter((part) => ["input_text", "output_text"].includes(part.type))
      .map((part) => part.text)
      .join("\n\n");
    if (text) entries.push({ timestamp: record.timestamp, role: item.role, text });
  }
  if (
    item.type === "function_call" &&
    ["request_user_input", "request_user_input_async"].includes(item.name)
  ) {
    questionCalls.add(item.call_id);
    entries.push({
      timestamp: record.timestamp,
      role: "assistant questions",
      text: "~~~json\n" + item.arguments + "\n~~~",
    });
  }
  if (item.type === "function_call_output" && questionCalls.has(item.call_id)) {
    const text = typeof item.output === "string" ? item.output : JSON.stringify(item.output);
    if (text.includes('"answers"'))
      entries.push({
        timestamp: record.timestamp,
        role: "user answers",
        text: "~~~json\n" + text + "\n~~~",
      });
  }
}
if (
  !entries.some((entry) => entry.role === "user") ||
  !entries.some((entry) => entry.role === "assistant")
) {
  throw new Error("The source contains no supported user/visible-assistant conversation.");
}
const stem = basename(source, ".jsonl").replace(/[^A-Za-z0-9._-]/g, "_");
const directory = resolve("docs/ai-history");
mkdirSync(directory, { recursive: true });
const counts = {};
for (const entry of entries) counts[entry.role] = (counts[entry.role] ?? 0) + 1;
const body = [
  "# User and visible assistant conversation",
  "",
  "Snapshot export. Refresh after session end; earlier conversations require separate exports.",
  "",
  ...entries.flatMap((entry) => [
    "## " + entry.timestamp + " — " + entry.role,
    "",
    redact(entry.text),
    "",
    "---",
    "",
  ]),
].join("\n");
const manifest = {
  format: "codex-visible-transcript-v1",
  sourceFile: basename(source),
  exportedAt: new Date().toISOString(),
  status: "snapshot",
  includedEntries: entries.length,
  counts,
  firstIncludedTimestamp: entries[0].timestamp,
  lastIncludedTimestamp: entries.at(-1).timestamp,
  redactions,
  excludes: ["system/developer instructions", "hidden reasoning", "unrelated tool internals"],
};
writeFileSync(join(directory, stem + ".md"), body);
writeFileSync(join(directory, stem + ".manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(
  "Exported " +
    entries.length +
    " conversation entries; " +
    redactions +
    " redaction(s). Review the snapshot before publication.",
);
