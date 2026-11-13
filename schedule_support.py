#!/usr/bin/env python3
"""Optional scheduling and notification support; no automatic cron installation."""
import json
import os
from pathlib import Path
import re
import shlex
import sys
import subprocess
from urllib.parse import urlsplit

PROJECT = Path(__file__).resolve().parent

def validate_schedule(schedule):
    fields = schedule.split(' ')
    if len(fields) != 5 or ' '.join(fields) != schedule:
        raise ValueError('schedule must contain five fields separated by single spaces')
    for field, (low, high) in zip(fields, ((0,59),(0,23),(1,31),(1,12),(0,7))):
        for item in field.split(','):
            match = re.fullmatch(r'(\*|\d+|\d+-\d+)(?:/(\d+))?', item, flags=re.ASCII)
            if not match: raise ValueError('invalid cron field')
            base, step = match.groups()
            if step is not None and (int(step) == 0 or int(step) > high-low+1): raise ValueError('invalid cron step')
            if base != '*':
                values = [int(x) for x in base.split('-')]
                if any(x < low or x > high for x in values) or values != sorted(values): raise ValueError('cron value out of range')
    return schedule

def validate_webhook(url):
    if not isinstance(url, str) or not re.fullmatch(r'https://discord(?:app)?\.com/api/webhooks/[0-9]+/[A-Za-z0-9_-]+', url, re.ASCII):
        raise ValueError('invalid Discord webhook URL')
    return url

def create_config(path, schedule, arguments, webhook):
    schedule = validate_schedule(schedule)
    webhook = validate_webhook(webhook)
    path = Path(path).absolute()
    parent = path.parent.resolve(strict=True)
    if parent == PROJECT or PROJECT in parent.parents or any((p / '.git').exists() for p in (parent, *parent.parents)):
        raise ValueError('configuration must be outside a git working tree')
    if parent.stat().st_uid != os.getuid() or parent.stat().st_mode & 0o077:
        raise ValueError('configuration directory must be owned by you and private (0700)')
    path = parent / path.name
    command = [sys.executable, str(Path(__file__).resolve()), 'run', '--config', str(path)]
    if any('%' in part or '\n' in part or '\r' in part for part in command): raise ValueError('cron paths may not contain percent signs or newlines')
    preview = schedule + ' ' + shlex.join(command)
    data = {'arguments': arguments, 'webhook': webhook, 'schedule': schedule}
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, 'O_NOFOLLOW', 0), 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(data, f)
    return preview

def send_notification(webhook, content, post=None):
    validate_webhook(webhook)
    if post is None:
        import requests
        post = requests.post
    # Discord counts UTF-16 code units. Do not split surrogate pairs.
    units = 0
    chars = []
    for char in content:
        size = 2 if ord(char) > 0xffff else 1
        if units + size > 1960:
            chars.append('\n[truncated; inspect local run]')
            break
        chars.append(char)
        units += size
    try:
        response = post(webhook, json={'content': ''.join(chars) or 'No output', 'allowed_mentions': {'parse': []}}, timeout=(5, 10), allow_redirects=False)
        if not 200 <= response.status_code < 300:
            raise RuntimeError('Discord notification failed')
    except Exception:
        raise RuntimeError('Discord notification failed or timed out') from None

def run_check(config, runner=subprocess.run, notify=send_notification):
    try:
        result = runner([sys.executable, str(PROJECT / 'dticket_monitor.py'), *config['arguments'], '--json'], capture_output=True, text=True, timeout=180, check=False)
        status = result.returncode
        heading = 'Check completed' if status == 0 else 'Check partial or unknown (monitor failed)'
        content = heading + '\n' + result.stdout
    except (subprocess.TimeoutExpired, OSError):
        status = 1
        content = 'Check partial or unknown (monitor failed or timed out)'
    try:
        notify(config['webhook'], content)
    except Exception:
        print('Discord notification failed or timed out', file=sys.stderr)
        return 1
    return 0 if status == 0 else 1

def load_config(path):
    fd = os.open(path, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0))
    with os.fdopen(fd, encoding='utf-8') as f:
        st = os.fstat(f.fileno())
        if st.st_uid != os.getuid() or st.st_mode & 0o077: raise ValueError('config must be owned by you with mode 0600')
        config = json.load(f)
    validate_webhook(config['webhook'])
    return config

def main(argv=None):
    import argparse
    import datetime
    import getpass
    import warnings
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='action', required=True)
    setup = sub.add_parser('setup', help='create private configuration and print cron preview; never installs')
    setup.add_argument('--config', required=True)
    setup.add_argument('--schedule', required=True)
    setup.add_argument('--origin', required=True)
    setup.add_argument('--destination', required=True)
    setup.add_argument('--date', required=True, action='append')
    setup.add_argument('--train', action='append', default=[])
    run = sub.add_parser('run', help='run monitor and send Discord notification')
    run.add_argument('--config', required=True)
    args = parser.parse_args(argv)
    try:
        if args.action == 'setup':
            validate_schedule(args.schedule)
            for date in args.date: datetime.date.fromisoformat(date)
            arguments = ['--origin', args.origin, '--destination', args.destination]
            for date in args.date: arguments += ['--date', date]
            for train in args.train: arguments += ['--train', train]
            with warnings.catch_warnings():
                warnings.simplefilter('error', getpass.GetPassWarning)
                webhook = getpass.getpass('Discord webhook URL (input hidden): ')
            preview = create_config(args.config, args.schedule, arguments, webhook)
            print('Preview only; no cron changed. Obtain explicit approval before installing:')
            print(preview)
            return 0
        config = load_config(args.config)
        return run_check(config)
    except (ValueError, OSError, KeyError, getpass.GetPassWarning, EOFError):
        print('Invalid configuration, input, or inaccessible private file; setup/run aborted.', file=sys.stderr)
        return 2

if __name__ == '__main__':
    sys.exit(main())
