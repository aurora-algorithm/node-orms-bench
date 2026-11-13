"""Summarize the measured session: the middle of 5 runs per configuration.

usage: python3 summarize_session.py [results_dir] > summary.json

Per configuration: requests/s (middle run, plus every run sorted), latency of the middle run, how busy Node's core
was, Node's and Postgres's CPU, Node's memory, SQL statements per request and Postgres execution time per request,
the statements Postgres ran most, and the Mac background CPU of every run.
"""

import json
import sys
from collections import defaultdict
from pathlib import Path

RUNS = 5
# oha must stay well under its three cores, or it would be the limit instead of the app.
MAX_OHA_CPU = 2.4


def load(results: Path) -> dict[tuple[str, str], list[dict]]:
    runs: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for path in sorted(results.glob("*_run[0-9].json")):
        server, route, _ = path.stem.rsplit("_", 2)
        runs[(server, route)].append(json.loads(path.read_text()))
    return runs


def summarize(key: str, runs: list[dict]) -> dict:
    if len(runs) != RUNS:
        raise SystemExit(f"{key}: {len(runs)} runs, expected {RUNS}")
    if max(r["oha_cpu"] for r in runs) > MAX_OHA_CPU:
        raise SystemExit(f"{key}: oha used {max(r['oha_cpu'] for r in runs):.2f} cores")
    ordered = sorted(runs, key=lambda r: r["summary"]["requestsPerSec"])
    mid = ordered[len(ordered) // 2]
    rps = mid["summary"]["requestsPerSec"]
    return {
        "rps": rps,
        "rps_runs": [r["summary"]["requestsPerSec"] for r in ordered],
        "spread_pct": (ordered[-1]["summary"]["requestsPerSec"] - ordered[0]["summary"]["requestsPerSec"]) / rps * 100,
        "p50_ms": mid["latencyPercentiles"]["p50"] * 1000,
        "p99_ms": mid["latencyPercentiles"]["p99"] * 1000,
        "core_busy": mid["core_busy"],
        "node_cpu": mid["server_cpu"],
        "node_cpu_us_per_request": mid["cpu_us_per_request"],
        "postgres_cpu": mid["postgres_cpu"],
        "oha_cpu": mid["oha_cpu"],
        "node_pss_mb": mid["server_pss_mb"],
        "statements_per_request": mid["statements_per_request"],
        "postgres_exec_ms_per_request": mid["postgres_exec_ms_per_request"],
        "statements": mid["statements"],
        "mac_background_cpu_pct": [r.get("mac_background_cpu_pct") for r in runs],
    }


def main() -> None:
    results = Path(sys.argv[1] if len(sys.argv) > 1 else "results")
    configs = {
        f"{server}/{route}": summarize(f"{server}/{route}", runs)
        for (server, route), runs in sorted(load(results).items())
    }
    versions = (results / "versions.txt").read_text().splitlines() if (results / "versions.txt").exists() else []
    json.dump({"versions": versions, "configs": configs}, sys.stdout, indent=1)
    print()


if __name__ == "__main__":
    main()
