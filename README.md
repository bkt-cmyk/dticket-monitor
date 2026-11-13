# D-Ticket monitor

**EN** | [TH](README.th.md)

A Node.js CLI that searches stations and reads general-passenger sleeper category counts and fares from Thailand's D-Ticket website. It does not log in, select seats, reserve, or pay. The website's internal endpoints are undocumented and can change. A category count or fare does not confirm that a particular berth is available or bookable; check [D-Ticket](https://dticket.railway.co.th/DTicketPublicWeb/) before making plans.

## Requirements and local use

Node.js 20 or newer is required. The project declares no npm dependencies. Internet access is needed for real searches; npm is needed to run the tests or install the local command. The package is private and has not been published to npm: do not assume `npx` can download it.

From a reviewed local copy:

```sh
node --version
node dticket-cli.cjs --help
node dticket-cli.cjs station 'Chiang Mai' --json
```

Station search matches partial Thai or English names without case sensitivity. Each JSON line contains `station_id`, `station_no`, `name_th`, and `name_en`. No matches produce no output and exit 0. Check the station before using it: `station_id` and `station_no` are different.

```sh
node dticket-cli.cjs check --origin ORIGIN_ID --destination DESTINATION_ID --date YYYY-MM-DD --train TRAIN_NUMBER --json
```

Replace the placeholders with confirmed values. Origin and destination also accept exact case-insensitive station names; use the ID if a name is ambiguous. Dates use the Gregorian calendar. Repeat `--date` or `--train` for multiple values; omitting `--train` checks every returned train and can make many requests. `--json` emits JSON Lines; without it, output is human-readable. `--timeout 25` sets the timeout in seconds per HTTP request, not for the whole check.

The following is an example from a test server, not live railway data:

```json
{"date":"2026-12-25","train":"42","origin_id":"174","destination_id":"174","departure":"2026-12-25 20:00","arrival":"2026-12-26 06:00","sleepers":[{"description":"ผู้โดยสารทั่วไป sleeper","class":"2","category_available_count":2,"fares_thb":{"Lower Berth":800,"Upper Berth":700}}]}
```

`category_available_count` is a category-level count, not availability of an individual berth. The CLI does not infer seat selectability or waiting-list availability. A missing train or category, malformed response, or request failure means availability is unknown, not sold out. An empty trip list without a requested train produces an empty-trains record. Some checks may succeed alongside errors; inspect every row. Exit status is 0 when checks complete without errors, 1 on a failure, and 2 for invalid arguments.

### Optional local command install

Direct `node` invocation needs no install. To install the `dticket` command into a separate local directory, replace the source path with the absolute path to your reviewed copy:

```sh
mkdir -p "$HOME/dticket-local"
npm install --prefix "$HOME/dticket-local" --offline --ignore-scripts --no-audit --no-fund /path/to/dticket-monitor
"$HOME/dticket-local/node_modules/.bin/dticket" --help
```

This writes to `dticket-local`; inspect the destination first. Do not use `sudo`. Reinstall and check the command if you move or remove the source.

## Optional setup and Discord notifications

Run a manual check before scheduling. On a POSIX system with cron, create a private directory outside all Git working trees, then run setup in a TTY:

```sh
mkdir -m 700 "$HOME/dticket-private"
node dticket-cli.cjs setup
```

If the directory already exists, inspect its owner and permissions instead. Setup asks for origin, destination, comma-separated dates, an optional train, a five-field cron schedule, an absolute config path such as `/home/USER/dticket-private/config.json`, and a Discord webhook in a hidden prompt. Replace `USER` with your account name. Enter the webhook yourself; do not put it in chat, shell arguments, history, or Git.

The parent directory must already exist, be owned by the executing user, and have no group or other access. Setup creates a new owner-only `0600` config and refuses to overwrite an existing file. The config contains the webhook and route data; protect it and any logs. Setup prints a cron preview only: it does not install cron or send a message. Review the Node, CLI, and config paths, cron timezone, frequency, and service terms. Only after separate approval should the user install the reviewed entry while preserving existing cron jobs.

`node dticket-cli.cjs run --config "$HOME/dticket-private/config.json"` checks and sends to Discord immediately; obtain separate approval before running it. Dates are fixed, and a message is sent on every run even if nothing changed. Output can be truncated; there is no retry or overlap prevention. The check has a 180-second overall timeout and Discord delivery a separate timeout. Monitor failures and logs. Tests mock webhook delivery and cron-related behavior; real Discord delivery and cron have not been tested end-to-end.

## Tests and troubleshooting

```sh
npm test
```

Tests use a local HTTP server and mocked webhook behavior; they do not establish that the live site or Discord works. If station search finds nothing, try a partial or English name. If the CLI reports `availability unknown`, check connectivity or use the website directly; do not treat it as sold out. Live service responses can change.

## AI agent use

An agent with terminal access can use the CLI after reviewing the code and `SKILL.md`; compatibility with individual agents has not been verified. For example:

> Inspect README.md, SKILL.md and the code in `/path/to/dticket-monitor`. Explain the steps and ask before installing or copying a skill. Do not schedule or send a message without separate approval. Do not ask for the webhook in chat; let me enter it in the hidden terminal prompt.

The skill contains instructions, not the application. Consult your agent's skill installation documentation before copying it.

## Security and privacy

Searches send station and travel-date data to D-Ticket. `run` also sends results to Discord. Route arguments may be visible in process listings, shell history, or logs. Use the least access needed and protect private files. Static scanning of a Node development snapshot with SkillSpector 2.12.0 reported 44/100 (MEDIUM / CAUTION), including one HIGH finding on a cron example in documentation. That scan is not a security guarantee or an end-to-end test of cron or Discord.

## License

[MIT License](LICENSE)
