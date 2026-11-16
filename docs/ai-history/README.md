# Conversation history

The assignment requires complete prompts and responses. This directory contains reviewed user/assistant transcript exports, not reconstructed summaries.

Use:

~~~powershell
npm run history:export -- "C:\path\to\a\Codex\rollout.jsonl"
~~~

The exporter preserves user text and visible assistant commentary/final answers. User-input tool questions and their returned answers are included because they contain project decisions. Internal system/developer instructions, hidden reasoning, and unrelated tool internals are excluded.

Known local credentials and recognizable secret tokens are redacted before writing, with counts in an adjacent manifest. No redacted value is recorded. Review every export before publication; automated detection is not proof that all sensitive information has been removed.

Exports are snapshots. Refresh after a session ends so its final response is included. The manifest records the source message count and last included timestamp; it does not claim that an active conversation or all earlier chats are complete.

**Coverage limit at 16 November 2026:** the available genuine Codex snapshot contains 89 visible entries from 12 November 13:07 UTC through 13 November 11:50 UTC. It is not the entire 12–16 November agent conversation. Later Codex sessions and earlier blueprint-planning conversations still require local original exports; their dialogue must not be invented. Preserve exports or accessible conversation links rather than inventing missing exchanges. Raw incoming material can be placed in ignored incoming/ for review. Do not commit raw secret-bearing logs.

