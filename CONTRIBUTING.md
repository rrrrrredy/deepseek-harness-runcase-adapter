# Contributing

Use Node.js 22.23.2 or another supported Node 22 release. Run `npm ci`, `npm check`, and `npm pack --dry-run` before submitting a change.

Changes to the pinned DeepSeek version must update `upstream.json`, `UPSTREAM.md`, the lockfile, mapping limitations, and all three hosted platform jobs together. Tests must remain keyless and must not commit private prompts, API keys, or user paths.

Keep lifecycle status separate from task correctness. A completed Agent response cannot be mapped to a successful task outcome without independent verification.
