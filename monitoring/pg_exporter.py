"""Serves how many statements Postgres has run (pg_stat_statements) as pg_statements_total for Prometheus.
usage: pg_exporter.py <port>"""
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

QUERY = "SELECT coalesce(sum(calls), 0)::bigint FROM pg_stat_statements WHERE dbid = (SELECT oid FROM pg_database WHERE datname = 'bench')"


def statements() -> int:
    out = subprocess.run(["psql", "-d", "bench", "-tAc", QUERY], capture_output=True, text=True, timeout=0.8)
    if out.returncode != 0:
        raise RuntimeError(out.stderr.strip())
    return int(out.stdout.strip())


class Metrics(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        try:
            body = f"# TYPE pg_statements_total counter\npg_statements_total {statements()}\n".encode()
            self.send_response(200)
        except (RuntimeError, subprocess.TimeoutExpired, ValueError) as err:
            body = f"pg_exporter: {err}\n".encode()
            self.send_response(500)
        self.send_header("content-type", "text/plain; version=0.0.4")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args) -> None:
        pass


if __name__ == "__main__":
    HTTPServer(("127.0.0.1", int(sys.argv[1])), Metrics).serve_forever()
