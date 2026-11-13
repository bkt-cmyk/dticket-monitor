import unittest
import tempfile
import os
from pathlib import Path
import schedule_support as s

class ScheduleTests(unittest.TestCase):
    def test_schedule_validation(self):
        self.assertEqual(s.validate_schedule('0 */6 * * *'), '0 */6 * * *')
        for value in ('@daily', '* * * * *\nmalicious', '60 * * * *', '*/0 * * * *'):
            with self.subTest(value=value), self.assertRaises(ValueError):
                s.validate_schedule(value)

    def test_preview_simulated_crontab_and_local_webhook(self):
        import http.server, threading, json, requests
        from types import SimpleNamespace
        received = []
        class Handler(http.server.BaseHTTPRequestHandler):
            def do_POST(self):
                received.append(json.loads(self.rfile.read(int(self.headers['Content-Length']))))
                self.send_response(204); self.end_headers()
            def log_message(self, *args): pass
        server = http.server.HTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
        try:
            with tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp)/'config'
                preview = s.create_config(path, '0 */6 * * *', ['--origin','1'], 'https://discord.com/api/webhooks/123/token')
                cron = Path(tmp)/'crontab'; cron.write_text(preview + '\n')
                config = s.load_config(path)
                def runner(*a, **kw): return SimpleNamespace(returncode=0, stdout='{"trains": []}\n')
                def post(url, **kw): return requests.post('http://127.0.0.1:%d/' % server.server_port, **kw)
                status = s.run_check(config, runner=runner, notify=lambda url, text: s.send_notification(url, text, post=post))
                self.assertEqual(status, 0)
                self.assertIn('Check completed', received[0]['content'])
                self.assertNotIn('token', cron.read_text())
        finally:
            server.shutdown(); thread.join(); server.server_close()

    def test_setup_cli_prompts_and_previews_without_installing(self):
        from unittest.mock import patch
        import io
        from contextlib import redirect_stdout
        with tempfile.TemporaryDirectory() as tmp, patch('getpass.getpass', return_value='https://discord.com/api/webhooks/123/token'):
            out = io.StringIO()
            with redirect_stdout(out):
                code = s.main(['setup', '--config', str(Path(tmp)/'config'), '--schedule', '0 */6 * * *', '--origin', '1', '--destination', '2', '--date', '2027-01-01'])
            self.assertEqual(code, 0)
            self.assertIn('approval', out.getvalue().lower())
            self.assertNotIn('token', out.getvalue())
            self.assertTrue((Path(tmp)/'config').exists())

    def test_run_reports_partial_failure_and_preserves_exit_status(self):
        from types import SimpleNamespace
        sent = []
        def runner(*args, **kwargs):
            return SimpleNamespace(returncode=1, stdout='{"date":"2027-01-01","sleepers":[]}\n{"error":"availability unknown"}\n', stderr='')
        status = s.run_check({'arguments': ['--origin','1'], 'webhook': 'https://discord.com/api/webhooks/123/x'}, runner=runner, notify=lambda url, text: sent.append(text))
        self.assertEqual(status, 1)
        self.assertIn('partial or unknown', sent[0])
        self.assertIn('availability unknown', sent[0])

    def test_notification_blocks_mentions_and_limits_length(self):
        calls = []
        class Response:
            status_code = 204
        def post(url, **kwargs):
            calls.append(kwargs)
            return Response()
        s.send_notification('https://discord.com/api/webhooks/123456/tokenABC', '@everyone ' + '😀' * 3000, post=post)
        payload = calls[0]['json']
        self.assertEqual(payload['allowed_mentions'], {'parse': []})
        self.assertLessEqual(len(payload['content'].encode('utf-16-le')) // 2, 2000)
        self.assertFalse(calls[0]['allow_redirects'])
        self.assertEqual(calls[0]['timeout'], (5, 10))

    def test_setup_writes_private_config_and_preview_without_secret(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = Path(tmp) / 'config.json'
            secret = 'https://discord.com/api/webhooks/123456/tokenABC'
            preview = s.create_config(config, '0 */6 * * *', ['--origin', '1', '--destination', '2', '--date', '2027-01-01'], secret)
            self.assertNotIn(secret, preview)
            self.assertEqual(config.stat().st_mode & 0o777, 0o600)
            self.assertIn('0 */6 * * *', preview)
            self.assertIn('run', preview)
            self.assertIn(secret, config.read_text())
            with self.assertRaises(FileExistsError):
                s.create_config(config, '0 */6 * * *', [], secret)
