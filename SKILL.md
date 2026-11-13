---
name: dticket-monitor
description: Check D-Ticket sleeper category availability.
version: 0.2.0
---

# D-Ticket monitor

Use the Node.js CLI for read-only Thai railway station and general-passenger sleeper category searches. Do not reserve, pay, or promise individual berth availability. This skill does not include the application.

## Procedure

1. Obtain the project directory and inspect the READMEs, `package.json`, and the CLI. Ask approval before cloning, installing packages, or copying this skill. Node.js 20+ is required; no npm dependencies are declared. The package is private and not published on npm.
2. On Windows PowerShell, `cd 'C:\path\to\dticket-monitor'` using the actual path. Run `node .\dticket-cli.cjs station 'เชียงใหม่'` to find a station; Thai and English partial names match case-insensitively. No matches produce no output with exit 0. Confirm exact names; if ambiguous use the confirmed `station_id`, not `station_no`.
3. Obtain station names, Gregorian dates, and optional train numbers. For example, `node .\dticket-cli.cjs check --origin 'กรุงเทพอภิวัฒน์' --destination 'เชียงใหม่' --date '2027-01-01'`. Replace values with confirmed ones. Repeat `--date` or `--train`; omitting train checks every returned train and can make many requests. `--json` emits JSON Lines. `--timeout` is seconds per HTTP request.
4. Read every result and exit code (PowerShell: `$LASTEXITCODE`): 0 means no reported errors, 1 indicates failure, and 2 invalid arguments. Report errors as unknown, not sold out. Category counts and fares do not guarantee a specific berth or booking. Do not infer seat selectability or waiting-list availability.

## Verification, security, and limits

Run `npm test` in the project directory. Tests use local HTTP and do not verify the live site; Windows execution has not been verified in this environment. A live read-only check is separate and cannot guarantee future site compatibility. Undocumented endpoints can change; missing categories, trains or fields, and failed requests are not proof of no availability. Searches send station and travel-date data to D-Ticket; route arguments may appear in process listings, shell history, or logs. Protect private data. See the READMEs for the earlier static scan's limitations; it is not a security guarantee.
