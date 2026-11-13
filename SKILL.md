---
name: dticket-monitor
description: Check D-Ticket sleeper category availability.
version: 0.2.0
---

# D-Ticket monitor

## When to use

Use the Node.js CLI for read-only Thai railway trip and general-passenger sleeper category searches. Do not reserve, pay, or promise individual berth availability. This skill does not include the application.

## Procedure

1. Obtain the project directory and inspect `README.th.md`, `package.json`, and the Node CLI before running it. Explain proposed changes and ask approval before cloning, installing packages, or copying this skill. Node.js 20 or newer is required; no npm dependencies are declared. The package is private and is not published on npm; do not suggest a published `npx` package or a global install.
2. From the project directory, use `node dticket-cli.cjs --help`. Search names with `node dticket-cli.cjs station 'NAME' --json`. This matches partial Thai or English names case-insensitively. Route arguments accept numeric station IDs or exact case-insensitive names. If an exact name is ambiguous, confirm the station and use `station_id`, not `station_no`; never guess.
3. Obtain Gregorian dates and optional train numbers. Run `node dticket-cli.cjs check --origin ORIGIN --destination DESTINATION --date YYYY-MM-DD --train TRAIN_NUMBER --json`, replacing placeholders with confirmed values. Repeat date or train flags as needed. Omitting train checks every returned train. Read each JSON line and the exit code: 0 means no reported errors, 1 indicates a failure, and 2 invalid arguments. Report errors as unknown, not sold out. Category counts and fares do not guarantee a specific berth or booking. Do not infer seat selectability or waiting-list availability.
4. Do not schedule or send a notification without separate explicit approval. For optional POSIX setup, follow README.th.md. `node dticket-cli.cjs setup` prompts interactively for route, dates, optional train, five-field cron schedule, absolute config path, then a hidden Discord webhook. The parent directory must already exist, be owned by the user, have no group/other access, and be outside all Git working trees. Setup creates a new `0600` config without overwriting and prints a cron preview; it does not install cron or send a notification. Never request or expose a webhook in chat or command arguments; the user must enter it privately in a TTY. Review the Node/CLI/config paths and cron timezone. The user must approve and install any cron entry. `node dticket-cli.cjs run --config PATH` sends to Discord immediately and needs separate approval. Protect config, route data, and logs.

## Verification and limits

Run `npm test` in the project directory. Tests use local HTTP and mocked webhook behavior; actual Discord delivery and cron have not been tested end-to-end. A live read-only check is separate and cannot guarantee future site compatibility. The site's endpoints are undocumented; missing categories, trains or fields, and failed requests are not proof of no availability. The CLI timeout applies per HTTP request; scheduled checks have a 180-second overall timeout. Scheduling uses fixed dates, posts every run, truncates long messages, and has no retry or overlap prevention. See README.md and README.th.md for the limitations of the static scan of a Node development snapshot; it is not a security guarantee.
