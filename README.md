# D-Ticket monitor

**EN** | [TH](README.th.md)

Read-only category search for Thai State Railway D-Ticket. It retrieves public trip and coach data; it does not log in, select seats, reserve, pay, send notifications, or install a scheduler. The upstream website is undocumented and may change.

## Install locally

Requires Python 3.9+ and `requests`. From this directory:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m unittest discover -s tests -v
```

On Windows use `.venv\Scripts\python.exe`. The test suite uses a local HTTP server and no railway network access.

## Optional Hermes skill installation

The Python app remains in this project directory; the skill is only instructions and does not bundle the app. First complete the local install above. The following copies only `SKILL.md` into the selected Hermes home; it does not install dependencies there, edit configuration, schedule jobs, or send messages. Review the destination and obtain approval before running it. From the project directory, on a POSIX shell:

```sh
HERMES_SKILL_HOME="${HERMES_HOME:-$HOME/.hermes}"
test ! -e "$HERMES_SKILL_HOME/skills/dticket-monitor" || { printf '%s\n' 'Destination already exists; stop and inspect it.'; exit 1; }
mkdir -p "$HERMES_SKILL_HOME/skills/dticket-monitor"
cp SKILL.md "$HERMES_SKILL_HOME/skills/dticket-monitor/SKILL.md"
```

In a new Hermes session, request the `dticket-monitor` skill and give it the absolute project directory. Installed skills are discovered in new sessions; see the [official skill guide](https://hermes-agent.nousresearch.com/docs/guides/work-with-skills). To remove this optional installation, delete only the copied skill directory after confirming its path. For Windows, manually copy `SKILL.md` to the active Hermes home's `skills/dticket-monitor` directory; use the Windows venv interpreter in the project.

## Station lookup

```sh
.venv/bin/python dticket_monitor.py --station 'Chiang Mai' --json
```

This downloads the site's public station list using the same read-only `home/Home/getStation` request as its home page, then matches Thai or English names case-insensitively by substring. Each JSON line contains `station_id`, `station_no`, `name_th`, and `name_en`; use **station_id**, not station_no, for trip searches. Confirm the intended station when names are similar. No matches means no output and exit 0; a failed or malformed lookup exits 1. The undocumented source can change, and lookup does not guarantee a route is served.

## Run

Use station IDs from lookup or independently verify the booking site's selections. Names, station numbers and IDs are not interchangeable. No defaults for a user's route are stored in the project.

```sh
.venv/bin/python dticket_monitor.py --origin ORIGIN_ID --destination DESTINATION_ID --date YYYY-MM-DD --train TRAIN_NUMBER
```

Repeat `--date` and/or `--train` for multiple values. Omitting `--train` checks all trains returned, which can cause many requests. Dates are Gregorian. Add `--json` for newline-delimited JSON records; default is human-readable. `--timeout 25` sets the connect and read timeout for each HTTP request, not a total run deadline. The tool sends a GET for the home page then POSTs only to the site's read-only `getTrip` and `getTrainCoach` search endpoints; it never submits a booking.

`category_available_count` is the reported category count, not availability of a particular berth or a guarantee of a bookable ticket. Listed prices do not establish berth availability. Neither category selectability nor waiting-list availability is inferred or reported. A missing category, missing requested train, malformed response, or failed request is an error/unknown, not sold out. Empty trip lists without an explicit train produce an empty-trains record, not a sold-out verdict. Per-date or per-train errors are emitted and other checks continue. A session initialization failure ends the run. Exit status: 0 all checks completed, 1 at least one failed, 2 invalid arguments. Outputs can contain route IDs and dates; protect logs appropriately.

## Safe scheduling

Run manually first and ensure the upstream service permits your polling. If you later choose to schedule it, use a modest frequency, avoid overlapping executions, account for timezone and request volume, set a bounded runtime, protect log files, and monitor nonzero exit status. Obtain separate approval before creating or changing cron, timers, or notifications. This project does not modify them. No retry or notification is built in.

### Optional Hermes no-agent job (not installed by this project)

The following is a setup example, **not an action already performed**. It uses local-only output; inspect it before enabling anything. Hermes scripts must resolve inside the active profile's `$HERMES_HOME/scripts` directory, and the script setting is a filename, not a command line. A shell wrapper can invoke this project's venv explicitly, avoiding a dependency on Hermes's Python environment. Replace all placeholders and use absolute paths; dates are fixed until you edit the wrapper. For example, after separate approval, create `$HERMES_HOME/scripts/dticket-check.sh` (use `~/.hermes` if `HERMES_HOME` is unset) with:

```bash
#!/bin/bash
exec /ABSOLUTE/PATH/TO/dticket-monitor/.venv/bin/python /ABSOLUTE/PATH/TO/dticket-monitor/dticket_monitor.py --origin ORIGIN_ID --destination DESTINATION_ID --date YYYY-MM-DD --train TRAIN_NUMBER --json --timeout 15
```

Run the wrapper manually with `bash "$HERMES_HOME/scripts/dticket-check.sh"` after setting `HERMES_HOME` to the active profile directory in your shell. Confirm its output and exit status, then, if separately approved, create a paused local job using a Hermes version supporting these flags:

```sh
hermes cron create 'every 6h' --no-agent --script dticket-check.sh --deliver local --name dticket-check --paused
hermes cron list
hermes cron status
```

Review the job and scheduler status before separately approving `hermes cron resume dticket-check`. A running gateway ticks the scheduler; consult the [Hermes cron documentation](https://hermes-agent.nousresearch.com/docs/user-guide/features/cron) for alternatives and version-specific behavior. No-agent mode sends stdout to the configured destination and uses nonzero exit as failure; partial successful rows may coexist with errors. Script timeout and per-request timeout differ; limit date/train count and check scheduler timeout and overlap behavior. Inspect local job output/history and failure status; no end-to-end scheduling or notification was tested here. Don't select a messaging destination without separate approval.
