---
name: dticket-monitor
description: Check D-Ticket sleeper category availability.
version: 0.1.0
---

# D-Ticket monitor

## When to use
Use for read-only Thai railway trip and general-passenger sleeper category searches. Do not reserve, pay, or promise individual berth availability. The application and dependencies are separate from this skill.

## Procedure
1. Obtain the project directory and inspect its code and README.th.md. Explain proposed installation and ask approval before cloning, installing dependencies, or copying the skill. Do not claim compatibility with other agents has been verified.
2. From the project directory, after approval create and activate a virtual environment: `python -m venv .venv`, then `source .venv/bin/activate` on POSIX, or `.venv\Scripts\Activate.ps1` in Windows PowerShell (`.venv\Scripts\activate.bat` in Command Prompt). Run `python -m pip install -r requirements.txt` after activation. A venv is not a sandbox.
3. Obtain Gregorian travel dates and optional train numbers. Use `python dticket_monitor.py --station 'NAME' --json` for case-insensitive partial name searches. Route arguments accept a numeric station ID or an exact Thai/English name (case-insensitive). If an exact name is ambiguous, confirm the intended station and use its `station_id`, not `station_no`; never guess. Partial route names are not accepted, though suggestions may be returned.
4. From the project directory run `python dticket_monitor.py --origin ORIGIN --destination DESTINATION --date YYYY-MM-DD --train TRAIN_NUMBER --json`, replacing placeholders with confirmed values. Repeat date/train flags as needed. Omitting train checks every returned train. Check the exit code and every JSON line; report errors as unknown, not sold out. Report category counts separately and explain they do not guarantee an individual berth or booking. Do not infer selectability or waiting-list availability.
5. Do not schedule, publish, or send a notification without separate explicit user approval. For optional POSIX scheduling, follow README.th.md: an existing owner-only directory outside all Git working trees is required; `python schedule_support.py setup --config PATH --schedule '0 */6 * * *' --origin ORIGIN --destination DESTINATION --date YYYY-MM-DD --train TRAIN_NUMBER` prompts for a hidden webhook, creates a private config without overwriting, and prints a cron preview only. Never request or expose a webhook in chat or command arguments. Let the user enter it privately. The user must review and approve any cron installation; `run --config PATH` sends to Discord immediately and also needs approval. Preserve route data and logs as private.

## Pitfalls and verification
The site is undocumented; missing categories, trains, fields, or failed requests are not proof of no availability. Monitor timeout applies per HTTP operation; scheduled monitor execution has a 180-second overall timeout. Scheduling uses fixed dates, posts every run, truncates long messages, and has no retries or overlap prevention. Tests simulate cron and webhook; real cron and Discord delivery have not been verified end-to-end. Run `python -m unittest discover -s tests -v` after activating the venv to verify local behavior; a live read-only check is separate and cannot guarantee future site compatibility. The SkillSpector findings for commit `6783879` apply only to that older commit, not a scan of the current version; see README.th.md.
