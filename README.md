# D-Ticket monitor

**EN** | [TH](README.th.md)

A command-line tool for finding stations and checking sleeper train information from [D-Ticket](https://dticket.railway.co.th/DTicketPublicWeb/), useful for looking up trains and fares before booking on the website.

The program is read-only: it **does not log in, select seats, book, or pay**. It does not schedule checks or send alerts.

> Counts apply to a passenger category; they do not confirm that an upper or lower berth is available or guarantee a booking. Check D-Ticket again before deciding.

## Before you start

You need:

- Windows and PowerShell to follow the examples below.
- [Node.js](https://nodejs.org/) version 20 or newer to run the program.
- Internet access to search D-Ticket.
- A local copy of the project: download and extract the ZIP from GitHub, or use Git clone below.

There are no npm dependencies, so you do not need to run `npm install`. The package is not published on npm, so `npx` cannot download it from npm.

## 1. Download the project

If you have Git installed, open PowerShell and run:

```powershell
git clone https://github.com/bkt-cmyk/dticket-monitor.git
cd dticket-monitor
```

Without Git, open the [project page](https://github.com/bkt-cmyk/dticket-monitor), select **Code → Download ZIP**, and extract it. Open PowerShell and use `cd` to enter the extracted folder, for example:

```powershell
cd 'C:\Users\YourName\Downloads\dticket-monitor-main'
```

Replace the path with the one on your computer. `cd` changes folders; if PowerShell cannot find the path, check the folder name and location.

## 2. Check that you can run the program

From the project folder, run:

```powershell
node --version
node .\dticket-cli.cjs --help
```

The first command should show Node.js version 20 or newer. The second shows how to use `station` and `check`. If `node` is not recognized, check that Node.js is installed and try closing and reopening PowerShell.

## 3. Find station names

Before checking tickets, search for the origin and destination. The program accepts partial names, for example:

```powershell
node .\dticket-cli.cjs station 'กรุงเทพอภิวัฒน์'
node .\dticket-cli.cjs station 'อุทุมพรพิสัย'
```

An example origin search result previously returned:

```text
1679  สถานีกลางกรุงเทพอภิวัฒน์ / Krung Thep Aphiwat (station no: 1000)
```

Use the **full name** shown when checking tickets. The number before the name is the `station_id`, which can be used instead of the full name; `station no` is a different value. If names are duplicated, check the name and use the desired station's `station_id`.

## 4. Check trains

This example searches for train 23 from Krung Thep Aphiwat Central Terminal to Uthumphon Phisai on December 25, 2026:

```powershell
node .\dticket-cli.cjs check --origin 'สถานีกลางกรุงเทพอภิวัฒน์' --destination 'อุทุมพรพิสัย' --date '2026-12-25' --train '23'
```

Change the values after each option to match your trip:

- `--origin` is the departure station.
- `--destination` is the arrival station.
- `--date` is the travel date, using a **Gregorian** year in `YYYY-MM-DD` format.
- `--train` is the train number. If omitted, the program checks every train returned, which may send more requests to the site.

For `--origin` and `--destination`, use the full name returned by station search or a verified `station_id`. Partial names work with `station`, but not directly with `check`.

The program sends stations and travel dates to D-Ticket. Command arguments may appear in PowerShell history, process listings, or local logs; review the code and protect private information before use.

### Understanding the results

This partial example came from a previous real check and is **not current**; counts and fares may have changed:

```text
Date: 2026-12-25  Train: 23
  2026-12-25 21:05 -> 2026-12-26 04:51
  ... (class 2): category count 0
  Fares THB: {"Lower Berth":922,"Upper Berth":822}
```

- `Date` and `Train` are the travel date and train number.
- The time line shows departure and arrival; this example arrives the next day.
- `category count 0` means the site reported zero for that category. It **does not explain why** or confirm the status of individual berths.
- `Lower Berth` and `Upper Berth` are fares in Thai baht. A fare does not confirm that the berth is available.

`availability unknown` means the program could not check that information. Do not conclude that tickets are sold out; retry or check the website directly.

## Troubleshooting

**Station search finds nothing:** Try a partial or English name. The program may show no output if nothing matches.

**`check` does not recognize a station:** Search with `station` first, then copy the exact full name or `station_id` for the desired station.

**Results appear alongside errors:** Some trains may have been checked successfully while others failed. Read every line; do not assume the information is complete.

**Information differs from the website:** It may change between searches. The program also uses undocumented internal D-Ticket endpoints that may change. Verify the information on the website before booking.

## Use with an AI agent

If your agent can use a terminal, you can ask it to review the code, install and run the program instead of typing commands yourself, for example:

> Please review the README and code at https://github.com/bkt-cmyk/dticket-monitor and explain how to install it on Windows. Ask for approval before installing, then help me check tickets for the route and date I specify.

`SKILL.md` contains instructions for agents, not the program. Compatibility with individual agents has not been tested.

## For developers

Run the tests from the project folder:

```powershell
npm test
```

The tests use a local HTTP server and do not verify the live website. This version has been tested on Linux, but not on Windows in the development environment.

For JSON Lines output, add `--json` after `station` or `check`. Repeat `--date` or `--train` to check multiple dates or trains. `--timeout 25` sets the timeout per HTTP request, not for all requests combined.

A static SkillSpector 2.12.0 scan of an earlier Node development snapshot reported **44/100 (MEDIUM / CAUTION)** and a HIGH finding in documentation that has since been removed. It was not a scan of the current revision, which has not been rescanned; scanning does not guarantee security.

## License

[MIT License](LICENSE)
