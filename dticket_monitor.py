#!/usr/bin/env python3
"""Read-only D-Ticket category search."""
import argparse
import datetime as dt
import json
import math
import re
import sys
import requests

BASE = 'https://dticket.railway.co.th/DTicketPublicWeb/'

class Client:
    def __init__(self, base, timeout):
        self.base, self.timeout = base.rstrip('/') + '/', timeout
        self.session = requests.Session()
        self.session.headers.update({'User-Agent':'Mozilla/5.0 (compatible; DTicketReadOnly/1.0)'})
        response = self.session.get(self.base + 'home/Home', timeout=timeout, allow_redirects=False)
        self.check_status(response)
        match = re.search(r'SmartUtil\.hiddenParams\.viewStateHolder\s*=\s*"([^"]+)"', response.text)
        if not match: raise ValueError('home page missing viewStateHolder')
        self.token = match.group(1)
    @staticmethod
    def check_status(response):
        if 300 <= response.status_code < 400:
            raise requests.HTTPError(f'upstream redirect rejected: HTTP {response.status_code}')
        response.raise_for_status()
    def post(self, endpoint, data):
        path = 'home/Home/getStation' if endpoint == 'getStation' else 'booking/booking/' + endpoint
        response = self.session.post(self.base + path, data={**data, 'viewStateHolder':self.token}, timeout=self.timeout, allow_redirects=False)
        self.check_status(response)
        payload = response.json()
        if not isinstance(payload, dict) or payload.get('errorCode') != 'S_SUCCESS':
            raise ValueError(f'{endpoint}: unsuccessful response')
        token = payload.get('viewStateHolder')
        if not isinstance(token, str) or not token: raise ValueError(f'{endpoint}: missing refreshed viewStateHolder')
        self.token = token
        return payload.get('data')

def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--station', help='search station names (Thai or English)')
    parser.add_argument('--origin', help='origin station ID or exact name')
    parser.add_argument('--destination', help='destination station ID or exact name')
    parser.add_argument('--date', action='append', help='departure date YYYY-MM-DD; repeatable')
    parser.add_argument('--train', action='append', help='train number; repeatable, defaults to all trains')
    parser.add_argument('--json', action='store_true', help='JSON Lines output')
    parser.add_argument('--timeout', type=float, default=25, help='timeout per HTTP operation in seconds')
    parser.add_argument('--base-url', default=BASE, help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    if args.station is not None:
        if not args.station.strip() or args.origin or args.destination or args.date or args.train: parser.error('--station needs a nonempty name and cannot be combined with route options')
    elif not args.origin or not args.destination or not args.date:
        parser.error('--origin, --destination and --date are required for trip search')
    try:
        dates = [dt.date.fromisoformat(s) for s in (args.date or [])]
        if not math.isfinite(args.timeout) or args.timeout <= 0: raise ValueError('timeout must be positive and finite')
    except ValueError as exc: parser.error(str(exc))
    def emit(row):
        if args.json: print(json.dumps(row, ensure_ascii=False), flush=True)
        else:
            print(f"Date: {row.get('date', 'unknown')}  Train: {row.get('train', '-')}")
            if 'error' in row: print(f"  ERROR: {row['error']}")
            elif 'trains' in row: print('  No trains returned.')
            else:
                print(f"  {row['departure']} -> {row['arrival']}")
                for sleeper in row['sleepers']:
                    print(f"  {sleeper['description']} (class {sleeper['class']}): category count {sleeper['category_available_count']}")
                    print(f"  Fares THB: {sleeper['fares_thb']}")
                print('  Category count is not individual berth availability.')
    try: api = Client(args.base_url, args.timeout)
    except Exception as exc:
        if args.station is not None: print(f'station lookup failed: {exc}', file=sys.stderr)
        else: emit({'error':f'availability unknown: {exc}'})
        return 1
    if args.station is not None:
        try:
            stations = api.post('getStation', {'LineId':''})
            fields = ('stationId', 'stationNo', 'stationNameTh', 'stationNameEn')
            if not isinstance(stations, list) or any(not isinstance(s, dict) or any(not isinstance(s.get(f), str) or not s[f] for f in fields) for s in stations):
                raise ValueError('malformed station list')
            for s in stations:
                if args.station.strip().casefold() in s['stationNameTh'].casefold() or args.station.strip().casefold() in s['stationNameEn'].casefold():
                    row = dict(zip(('station_id', 'station_no', 'name_th', 'name_en'), (s[f] for f in fields)))
                    print(json.dumps(row, ensure_ascii=False) if args.json else f"{row['station_id']}  {row['name_th']} / {row['name_en']} (station no: {row['station_no']})")
            return 0
        except Exception as exc:
            print(f'station lookup failed: {exc}', file=sys.stderr); return 1
    if not (args.origin.isascii() and args.origin.isdigit() and args.destination.isascii() and args.destination.isdigit()):
        try:
            stations = api.post('getStation', {'LineId':''})
            fields = ('stationId', 'stationNameTh', 'stationNameEn')
            if not isinstance(stations, list) or any(not isinstance(s, dict) or any(not isinstance(s.get(f), str) or not s[f].strip() for f in fields) or not s['stationId'].isascii() or not s['stationId'].isdigit() for s in stations):
                raise ValueError('malformed station list')
            for field in ('origin', 'destination'):
                value = getattr(args, field)
                if value.isascii() and value.isdigit(): continue
                matches = [s for s in stations if value.strip().casefold() in (s['stationNameTh'].strip().casefold(), s['stationNameEn'].strip().casefold())]
                if len(matches) > 1:
                    choices = '; '.join(f"{s['stationId']} {s['stationNameTh']} / {s['stationNameEn']}" for s in matches)
                    raise ValueError(f'{field}: ambiguous station name {value!r}; choose an ID: {choices}')
                if not matches:
                    needle = value.strip().casefold()
                    suggestions = [s for s in stations if needle and (needle in s['stationNameTh'].casefold() or needle in s['stationNameEn'].casefold())]
                    choices = '; '.join(f"{s['stationId']} {s['stationNameTh']} / {s['stationNameEn']}" for s in suggestions[:20])
                    hint = f'; possible choices: {choices}' if choices else '; use --station to search names'
                    raise ValueError(f'{field}: unknown station name {value!r}{hint}')
                setattr(args, field, matches[0]['stationId'])
        except Exception as exc:
            print(f'station lookup failed: {exc}', file=sys.stderr); return 1
    failed = False
    for date in dates:
        day = date.isoformat()
        try:
            trips = api.post('getTrip', {'tripType':'1','provinceStartId':args.origin,'provinceEndId':args.destination,'dateStart':date.strftime('%d/%m/%Y'),'dateEnd':''})
            if not isinstance(trips, list) or any(not isinstance(t, dict) for t in trips): raise ValueError('unexpected trip list')
        except Exception as exc:
            failed = True; emit({'date':day, 'error':f'availability unknown: {exc}'}); continue
        trains = args.train if args.train else [str(t.get('trainNo', '')) for t in trips]
        if not trains:
            emit({'date':day, 'origin_id':args.origin, 'destination_id':args.destination, 'trains':[]})
        for train in trains:
            row = {'date':day, 'train':train, 'origin_id':args.origin, 'destination_id':args.destination}
            try:
                matching = [t for t in trips if str(t.get('trainNo')) == train]
                if len(matching) != 1: raise ValueError(f'expected one matching train, got {len(matching)}; availability unknown')
                trip = matching[0]
                row['departure'] = trip['departureDate'][:10] + ' ' + trip['departureTime']
                row['arrival'] = trip['arrivalDate'][:10] + ' ' + trip['arrivalTime']
                data = api.post('getTrainCoach', {'tripId':trip['tripId'], 'provinceStartId':args.origin, 'provinceEndId':args.destination})
                if not isinstance(data, dict) or not isinstance(data.get('results'), list): raise ValueError('unexpected coach response')
                if any(not isinstance(c, dict) or not isinstance(c.get('coachSeatType'), str) or not isinstance(c.get('coachDesc'), str) for c in data['results']): raise ValueError('malformed coach entry')
                coaches = [c for c in data['results'] if isinstance(c, dict) and c.get('coachSeatType') == '1' and 'ผู้โดยสารทั่วไป' in c.get('coachDesc','')]
                if not coaches: raise ValueError('no general-passenger sleeper category returned; availability unknown')
                row['sleepers'] = []
                for coach in coaches:
                    count, seats = coach.get('availableSeatCount'), coach.get('coachSeats')
                    if type(count) is not int or count < 0 or not isinstance(seats,list) or not seats: raise ValueError('missing or invalid availability/fare fields')
                    fares = {s['seatTypNameEn']:s['seatFeeAmt'] for s in seats if isinstance(s,dict) and s.get('seatTypNameEn') and type(s.get('seatFeeAmt')) in (int,float)}
                    if 'Lower Berth' not in fares or 'Upper Berth' not in fares: raise ValueError('missing berth fares')
                    row['sleepers'].append({'description':coach['coachDesc'], 'class':coach['coachClass'], 'category_available_count':count, 'fares_thb':fares})
            except Exception as exc:
                failed = True; row.pop('sleepers', None); row['error'] = f'availability unknown: {exc}'
            emit(row)
    return int(failed)

if __name__ == '__main__': sys.exit(main())
