import json
import subprocess
import sys
import unittest
from unittest.mock import patch
import requests
import dticket_monitor as monitor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.parse import parse_qs

ROOT = Path(__file__).resolve().parents[1]

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args): pass
    def do_GET(self):
        self.send_response(200); self.end_headers()
        self.wfile.write(b'SmartUtil.hiddenParams.viewStateHolder = "token"')
    def do_POST(self):
        body = parse_qs(self.rfile.read(int(self.headers['Content-Length'])).decode(), keep_blank_values=True)
        if self.path.endswith('getStation'):
            if self.path != '/home/Home/getStation' or body.get('LineId') != [''] or body.get('viewStateHolder') != ['token']:
                self.send_response(400); self.end_headers(); return
            data = [{'stationId':'174', 'stationNo':'3035', 'stationNameTh':'เขาพระบาท', 'stationNameEn':'Khao Phrabat'}]
        elif self.path.endswith('getTrip'):
            data = [{'trainNo':'42', 'tripId':'t', 'departureDate':'2026-12-25', 'departureTime':'20:00', 'arrivalDate':'2026-12-26', 'arrivalTime':'06:00'}]
        else:
            data = {'results':[{'coachSeatType':'1', 'coachDesc':'ผู้โดยสารทั่วไป sleeper', 'coachClass':'2', 'availableSeatCount':2, 'coachSeats':[{'seatTypNameEn':'Lower Berth', 'seatFeeAmt':800}, {'seatTypNameEn':'Upper Berth', 'seatFeeAmt':700}]}], 'waitingListEnabled':False}
        payload = json.dumps({'errorCode':'S_SUCCESS','viewStateHolder':'token','data':data}).encode()
        self.send_response(200); self.end_headers(); self.wfile.write(payload)

class MonitorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        cls.thread = Thread(target=cls.server.serve_forever, daemon=True); cls.thread.start()
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown(); cls.server.server_close(); cls.thread.join()
    def run_cli(self, *args):
        return subprocess.run([sys.executable, str(ROOT/'dticket_monitor.py'), '--origin', '101', '--destination', '202', '--date', '2026-12-25', '--base-url', f'http://127.0.0.1:{self.server.server_port}/', *args], text=True, capture_output=True)
    def test_help_documents_route_names(self):
        result = subprocess.run([sys.executable, str(ROOT/'dticket_monitor.py'), '--help'], text=True, capture_output=True)
        self.assertIn('origin station ID or exact name', result.stdout)
        self.assertIn('destination station ID or exact name', result.stdout)

    def test_malformed_station_id_does_not_reach_trip_search(self):
        stations = [{'stationId':'', 'stationNo':'11', 'stationNameTh':'หนึ่ง', 'stationNameEn':'One'}]
        with patch.object(monitor.Client, '__init__', return_value=None), patch.object(monitor.Client, 'post', return_value=stations) as post, patch('sys.stderr', new_callable=__import__('io').StringIO) as err:
            code = monitor.main(['--origin','One','--destination','202','--date','2026-12-25'])
        self.assertEqual(code, 1)
        self.assertIn('malformed', err.getvalue())
        self.assertEqual(post.call_count, 1)

    def test_unknown_partial_name_suggests_matches_without_searching_trips(self):
        result = self.run_cli('--origin', 'Phrabat', '--json')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, '')
        self.assertIn('unknown', result.stderr.lower())
        self.assertIn('174', result.stderr)
        self.assertIn('Khao Phrabat', result.stderr)

    def test_ambiguous_name_reports_choices_without_querying_trips(self):
        stations = [
            {'stationId':'1', 'stationNo':'11', 'stationNameTh':'หนึ่ง', 'stationNameEn':'Same'},
            {'stationId':'2', 'stationNo':'22', 'stationNameTh':'สอง', 'stationNameEn':'Same'},
        ]
        with patch.object(monitor.Client, '__init__', return_value=None), patch.object(monitor.Client, 'post', return_value=stations) as post, patch('sys.stderr', new_callable=__import__('io').StringIO) as err:
            code = monitor.main(['--origin','Same','--destination','202','--date','2026-12-25'])
        self.assertEqual(code, 1)
        self.assertIn('ambiguous', err.getvalue().lower())
        self.assertIn('1', err.getvalue())
        self.assertIn('2', err.getvalue())
        self.assertIn('หนึ่ง', err.getvalue())
        self.assertEqual(post.call_count, 1)

    def test_route_names_resolve_to_station_ids(self):
        result = self.run_cli('--origin', ' KHAO PHRABAT ', '--destination', 'เขาพระบาท', '--json')
        self.assertEqual(result.returncode, 0, result.stderr)
        row = json.loads(result.stdout)
        self.assertEqual((row['origin_id'], row['destination_id']), ('174', '174'))

    def test_station_search_finds_case_insensitive_english_name(self):
        result = subprocess.run([sys.executable, str(ROOT/'dticket_monitor.py'), '--station', 'PHRABAT', '--json', '--base-url', f'http://127.0.0.1:{self.server.server_port}/'], text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout), {'station_id':'174', 'station_no':'3035', 'name_th':'เขาพระบาท', 'name_en':'Khao Phrabat'})

    def test_station_initialization_failure_is_reported_as_lookup_error(self):
        with patch.object(monitor, 'Client', side_effect=ValueError('offline')), patch('sys.stderr', new_callable=__import__('io').StringIO) as err:
            code = monitor.main(['--station', 'Chiang Mai'])
        self.assertEqual(code, 1)
        self.assertIn('station lookup failed', err.getvalue())

    def test_partial_train_failure_does_not_hide_success(self):
        result = self.run_cli('--json', '--train', 'missing', '--train', '42')
        self.assertEqual(result.returncode, 1)
        rows = [json.loads(line) for line in result.stdout.splitlines()]
        self.assertIn('availability unknown', rows[0]['error'])
        self.assertEqual(rows[1]['sleepers'][0]['category_available_count'], 2)

    def test_repeated_dates_and_default_all_trains(self):
        result = self.run_cli('--json', '--date', '2026-12-26')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual([json.loads(x)['date'] for x in result.stdout.splitlines()], ['2026-12-25', '2026-12-26'])

    def test_rejects_nonfinite_timeout(self):
        result = self.run_cli('--timeout', 'nan')
        self.assertEqual(result.returncode, 2)
        self.assertIn('timeout must be', result.stderr)

    def test_human_output_explains_category_semantics(self):
        result = self.run_cli('--train', '42')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('category count', result.stdout.lower())
        self.assertIn('not individual', result.stdout.lower())

    def test_json_reports_category_count_not_individual_berths(self):
        result = self.run_cli('--json', '--train', '42')
        self.assertEqual(result.returncode, 0, result.stderr)
        row = json.loads(result.stdout)
        self.assertEqual(row['sleepers'][0]['category_available_count'], 2)
        self.assertNotIn('selectable', row['sleepers'][0])
        self.assertNotIn('waiting_list_offered', row['sleepers'][0])
        self.assertNotIn('lower_available', row['sleepers'][0])

    def test_human_output_does_not_claim_selectability_or_waiting_list(self):
        result = self.run_cli('--train', '42')
        self.assertEqual(result.returncode, 0)
        self.assertNotIn('selectable', result.stdout.lower())
        self.assertNotIn('waiting list', result.stdout.lower())

    def test_malformed_coach_entry_makes_status_unknown(self):
        with patch.object(monitor.Client, '__init__', return_value=None), patch.object(monitor.Client, 'post', side_effect=[
            [{'trainNo':'42', 'tripId':'t', 'departureDate':'2026-12-25', 'departureTime':'20:00', 'arrivalDate':'2026-12-26', 'arrivalTime':'06:00'}],
            {'results':[None, {'coachSeatType':'1', 'coachDesc':'ผู้โดยสารทั่วไป sleeper', 'coachClass':'2', 'availableSeatCount':2, 'coachSeats':[{'seatTypNameEn':'Lower Berth','seatFeeAmt':800},{'seatTypNameEn':'Upper Berth','seatFeeAmt':700}]}]}]), patch('sys.stdout', new_callable=__import__('io').StringIO) as out:
            code = monitor.main(['--origin','101','--destination','202','--date','2026-12-25','--json'])
        self.assertEqual(code, 1)
        row = json.loads(out.getvalue())
        self.assertIn('unknown', row['error'])
        self.assertNotIn('sleepers', row)

    def test_request_failures_are_unknown(self):
        for exc in (requests.ConnectionError('offline'), requests.Timeout('timed out'), requests.HTTPError('503')):
            with self.subTest(exc=exc), patch.object(monitor.Client, '__init__', return_value=None), patch.object(monitor.Client, 'post', side_effect=exc), patch('sys.stdout', new_callable=__import__('io').StringIO) as out:
                code = monitor.main(['--origin','101','--destination','202','--date','2026-12-25','--json'])
            self.assertEqual(code, 1)
            row = json.loads(out.getvalue())
            self.assertIn('unknown', row['error'])
            self.assertNotIn('sleepers', row)

    def test_upstream_redirects_are_not_followed_and_report_unknown(self):
        for method in ('GET', 'POST'):
            for status in (300, 302, 304, 307, 308):
                with self.subTest(method=method, status=status):
                    seen = []
                    class RedirectHandler(Handler):
                        def do_GET(self):
                            seen.append(('GET', self.path))
                            if method == 'GET' or self.path == '/capture':
                                self.send_response(status); self.send_header('Location', '/capture'); self.end_headers()
                            else:
                                super().do_GET()
                        def do_POST(self):
                            seen.append(('POST', self.path))
                            self.send_response(status); self.send_header('Location', '/capture'); self.end_headers()
                    server = ThreadingHTTPServer(('127.0.0.1', 0), RedirectHandler)
                    thread = Thread(target=server.serve_forever, daemon=True); thread.start()
                    try:
                        result = subprocess.run([sys.executable, str(ROOT/'dticket_monitor.py'), '--origin', '101', '--destination', '202', '--date', '2026-12-25', '--json', '--base-url', f'http://127.0.0.1:{server.server_port}/'], text=True, capture_output=True)
                    finally:
                        server.shutdown(); server.server_close(); thread.join()
                    self.assertEqual(result.returncode, 1)
                    error = json.loads(result.stdout)['error']
                    self.assertIn('unknown', error)
                    self.assertIn('redirect', error.lower())
                    self.assertIn(str(status), error)
                    expected = [('GET', '/home/Home')]
                    if method == 'POST': expected.append(('POST', '/booking/booking/getTrip'))
                    self.assertEqual(seen, expected)

    def test_real_http_failure_is_unknown(self):
        class FailingHandler(Handler):
            def do_POST(self):
                self.send_response(503)
                self.end_headers()
        server = ThreadingHTTPServer(('127.0.0.1', 0), FailingHandler)
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            result = subprocess.run([sys.executable, str(ROOT/'dticket_monitor.py'), '--origin', '101', '--destination', '202', '--date', '2026-12-25', '--json', '--base-url', f'http://127.0.0.1:{server.server_port}/'], text=True, capture_output=True)
        finally:
            server.shutdown(); server.server_close(); thread.join()
        self.assertEqual(result.returncode, 1)
        row = json.loads(result.stdout)
        self.assertIn('unknown', row['error'])
        self.assertIn('503', row['error'])
        self.assertNotIn('sleepers', row)

if __name__ == '__main__': unittest.main()
