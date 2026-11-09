# Per-reply usage implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this approved design in the current session. The user approved the design and requested local deployment as well as the repository update.

**Goal:** Display per-turn recorded Token usage beside each final response, with a details popover, and deploy locally plus GitHub.

**Architecture:** An independent Node.js addon tails local rollout metadata, matches visible stable turn IDs directly against recorded turn IDs, and injects an isolated renderer using the existing loopback CDP connection. An independent supervisor and login shortcut preserve it across upstream replacement. No new model calls.

**Tech Stack:** Node.js 24, node:sqlite, node:test, Windows PowerShell and existing upstream CDP endpoint.

**Spec:** ../specs/2026-11-09-per-reply-usage.md

## Global constraints

- Each final response displays the current turn, not whole-thread cumulative usage.
- Never assign usage by visual row index; match turn identity or unique final-answer identity.
- Cache and reasoning are subsets, not additive to the total.
- Account quota deltas are reference observations only; resets/missing data remain unknown.
- No messages, credentials or runtime logs in the published package.
- Preserve upstream vendor files and updater; store addon outside the upstream replacement directory.

## Review focus

- Duplicated token events must not inflate usage.
- Multiple model requests within a turn must accumulate; truncated or reset totals must not invent a baseline.
- Unicode final-answer matching and multiple identical responses must not cross-assign statistics.
- Partial JSONL lines and changing/rotated rollout files must be retried safely.
- Existing unrelated startup shortcuts and user data must be preserved.

## Task 1: Local usage reader

- [x] Write node:test fixtures for multi-request turn aggregation, duplicate events, partial lines, resets, cached/reasoning subsets and missing records; observe failure.
- [x] Implement `UsageTimeline.ingest(record)` and `RolloutReader.read(file)` in `addons/reply-usage/usage-reader.cjs`; retain only turn IDs, usage and model metadata.
- [x] Verify fixtures pass and inspect only metadata from local records.

## Task 2: Renderer and companion agent

- [x] Test stable response identity and duplicate-match rejection before implementation.
- [x] Implement `installReplyUsage()` in `renderer.cjs`, then a loopback-only polling/injection companion `agent.cjs` with bounded discovery and incremental rollout caching.
- [x] Read current response DOM structure; attach next to observed action bars, use safe text nodes, and show clear unavailable/stale states.
- [x] Verify DOM mapping, popover dismissal, repeated injection and navigation with synthetic tests and current-client checks.

## Task 3: Install and deployment

- [x] Add `Manage-ReplyUsage.ps1` supervisor (Start/Run/Stop/Launch), install into a sibling directory, and update launcher/owned startup links without replacing vendor source.
- [x] Verify shortcut ownership, repeat installs, parse checks, all test suites, then backup and install addon locally. Keep the current app running while replacing only the addon.
- [ ] Build v1.1.0 ZIP and checksum, update Chinese README and publish source plus ZIP to the already authorized public repository.
- [ ] Verify remote artifact hashes, installed source hashes, running addon and displayed badges; record any unverified restart scenario.

## Execution ruling

The current workspace contains a packaged source tree rather than a Git checkout. Reuse it and publish through the connected GitHub API. The user's instruction to proceed with the approved design is treated as authorization for implementation, local installation and the already specified GitHub update; no second design gate is introduced.

Stable DOM turn IDs proved available, so no final-answer fingerprint or SQLite access is needed; raw answer text is never retained by the parser. Independent review identified synthetic context counters, missing turn-boundary attribution and an uninstall ownership check; all were fixed with regression tests. Final verification: 15 Node checks, 10 isolated live DOM checks, 8 legacy shortcut checks, 11 addon installation checks. Local source hashes match the package, and two windows are connected. A full application/Windows restart was not forced during the active chat.
