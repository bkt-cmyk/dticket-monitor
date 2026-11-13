---
name: dticket-monitor
description: Check D-Ticket sleeper category availability.
version: 0.1.0
---

# D-Ticket monitor

## When to use
Use for read-only Thai railway trip and general-passenger sleeper category searches. Do not use to reserve, pay, or promise individual berth availability.

## Procedure
1. Obtain the absolute project directory from the user; the skill file is not the application. From that directory, confirm the local installation in README.md. Find station IDs with `.venv/bin/python dticket_monitor.py --station 'NAME' --json`, or use independently verified IDs. Use `station_id`, not `station_no`, and confirm ambiguous matches; never guess IDs. Obtain Gregorian travel dates and optional train numbers.
2. From the project directory, use `terminal` to run `.venv/bin/python dticket_monitor.py --origin ORIGIN_ID --destination DESTINATION_ID --date YYYY-MM-DD --json`, replacing placeholders with supplied or confirmed values. Repeat date/train flags as needed. Omitting train checks every returned train.
3. Check the exit code and every JSON line. Report errors as unknown, not sold out. Report each category count separately and explain that it is not upper/lower berth availability or a booking guarantee. Do not infer selectability or waiting-list availability from counts or flags.
4. Do not schedule, publish, or notify without separate user approval. README.md includes an optional paused, local-only Hermes no-agent setup; its wrapper must reside inside the active profile's scripts directory. Keep route identifiers and logs private.

## Pitfalls and verification
The site is undocumented; missing categories, trains, fields, or failed requests are not proof of no availability. The timeout applies per HTTP operation. Run `.venv/bin/python -m unittest discover -s tests -v` to verify local behavior; a live read-only check is separate and cannot guarantee future site compatibility.
