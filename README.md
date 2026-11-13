# D-Ticket monitor

**EN** | [ไทย](README.th.md)

A read-only Node.js CLI for finding Thai railway stations and checking general-passenger sleeper category counts and fares on [D-Ticket](https://dticket.railway.co.th/DTicketPublicWeb/). It does not log in, reserve, select seats, or pay. The site's undocumented endpoints can change. A category count or fare does **not** confirm that a particular berth is available or bookable; verify on the website before making plans.

## Windows PowerShell: getting started

Install Node.js 20 or newer from its official source and obtain a reviewed local copy of this project. Internet access is required for searches; there are no npm dependencies. The package is private and not published on npm; do not assume `npx` can download it.

Open PowerShell, replace the example path with your actual project folder, and run:

```powershell
cd 'C:\path\to\dticket-monitor'
node --version
node .\dticket-cli.cjs --help
node .\dticket-cli.cjs station 'เชียงใหม่'
node .\dticket-cli.cjs station 'Bangkok'
```

`station` searches partial Thai or English names case-insensitively. No matches means no output and exit code 0. Check the exact name in the results before using it. The output also shows `station_id` and `station_no`, which are different.

```powershell
node .\dticket-cli.cjs check --origin 'กรุงเทพอภิวัฒน์' --destination 'เชียงใหม่' --date '2027-01-01'
```

Replace station names and the Gregorian date with your own, using exact names returned by `station`. Names are case-insensitive; if ambiguous, use the confirmed `station_id`, not `station_no`. Repeat `--date` or `--train` to specify multiple dates or train numbers. Without `--train`, every returned train is checked and this may make many requests. Add `--json` for JSON Lines; `--timeout 25` sets seconds per HTTP request, not for the whole check.

## Results and troubleshooting

`category_available_count` is a category-level count, not availability of an individual berth. The CLI cannot infer seat selectability or waiting-list availability. A missing train or category, malformed response, or failed request is not proof of sold out. An empty trip list without a requested train yields an empty-trains record. Inspect every row: some checks can succeed alongside errors. Exit code 0 means no reported errors, 1 a failure, and 2 invalid arguments. In PowerShell, inspect `$LASTEXITCODE` after a command.

If station search finds nothing, try a partial or English name. If availability is unknown, check connectivity or use the website directly. Results and site behavior can change.

## Tests

From the project folder, run `npm test`. Tests use a local HTTP server; they do not establish that the live site works. Windows execution has not been verified in this environment.

## Security and privacy

Searches send station and travel-date data to D-Ticket. Route arguments may appear in process listings, shell history, or logs; protect private data and review the code before use. A static SkillSpector 2.12.0 scan of an earlier Node development snapshot reported 44/100 (MEDIUM / CAUTION), including a HIGH finding in documentation that has since been removed. It was not a security guarantee, and the current revision has not been rescanned.

## AI agents

An agent may use this CLI after reviewing the code and `SKILL.md`; compatibility with individual agents has not been verified. The skill is instructions only, not the application. Ask before installing or copying it.

[MIT License](LICENSE)
