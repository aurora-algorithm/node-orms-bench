"""Writes the live Grafana dashboard. Run inside the rig: python3 monitoring/make_dashboard.py

live.json   the last minute, refreshed every second, while a demo run loads one app: requests per second (counted by
            the demo server), statements per second Postgres runs, CPU of Node and of Postgres, and Node's memory.
live2.json  the same requests per second over CPU, two full-width panels: readable in a tile of the race grid.
"""

import json
from pathlib import Path

HERE = Path(__file__).parent
RATE = "3s"
NODE = "#8CC84B"
POSTGRES = "#4F8FD6"


def panel(pid: int, title: str, x: int, y: int, targets: list[tuple[str, str, str]], unit: str, decimals: int, w: int = 12, h: int = 11) -> dict:
    return {
        "id": pid,
        "type": "timeseries",
        "title": title,
        "gridPos": {"x": x, "y": y, "w": w, "h": h},
        "datasource": {"type": "prometheus", "uid": "prom"},
        "targets": [
            {"refId": chr(65 + i), "expr": expr, "legendFormat": legend, "range": True}
            for i, (expr, legend, _) in enumerate(targets)
        ],
        "fieldConfig": {
            "defaults": {
                "unit": unit,
                "decimals": decimals,
                "min": 0,
                "custom": {"lineWidth": 4, "fillOpacity": 8, "showPoints": "never", "spanNulls": False},
            },
            "overrides": [
                {
                    "matcher": {"id": "byName", "options": legend},
                    "properties": [{"id": "color", "value": {"mode": "fixed", "fixedColor": color}}],
                }
                for _, legend, color in targets
            ],
        },
        "options": {
            "legend": {"displayMode": "list", "placement": "bottom", "showLegend": True},
            "tooltip": {"mode": "multi"},
        },
    }


def main() -> None:
    cpu = 'sum(rate(namedprocess_namegroup_cpu_seconds_total{{groupname="{g}"}}[{r}])) or vector(0)'
    panels = [
        panel(1, "Requests per second", 0, 0, [(f"sum(rate(requests_total[{RATE}])) or vector(0)", "API", NODE)],
              "none", 0),
        panel(2, "SQL statements per second", 12, 0,
              [(f"sum(rate(pg_statements_total[{RATE}])) or vector(0)", "Postgres", POSTGRES)], "none", 0),
        panel(3, "CPU (cores)", 0, 11,
              [(cpu.format(g="server", r=RATE), "Node", NODE), (cpu.format(g="postgres", r=RATE), "Postgres", POSTGRES)],
              "none", 1),
        panel(4, "Node memory", 12, 11,
              [('sum(namedprocess_namegroup_memory_bytes{groupname="server",memtype="resident"}) or vector(0)',
                "Node", NODE)], "bytes", 0),
    ]
    two = [
        panel(1, "Requests per second", 0, 0, [(f"sum(rate(requests_total[{RATE}])) or vector(0)", "API", NODE)],
              "none", 0, w=24, h=9),
        panel(2, "CPU (cores)", 0, 9,
              [(cpu.format(g="server", r=RATE), "Node", NODE), (cpu.format(g="postgres", r=RATE), "Postgres", POSTGRES)],
              "none", 1, w=24, h=9),
    ]
    for uid, title, shown in (("live", "Live: ORM under load", panels), ("live2", "Live: requests and CPU", two)):
        dashboard = {
            "uid": uid,
            "title": title,
            "editable": False,
            "graphTooltip": 1,
            "time": {"from": "now-1m", "to": "now"},
            "refresh": "1s",
            "timezone": "utc",
            "schemaVersion": 41,
            "timepicker": {"refresh_intervals": ["1s", "5s", "10s", "30s"]},
            "panels": shown,
        }
        out = HERE / "grafana" / "dashboards" / f"{uid}.json"
        out.write_text(json.dumps(dashboard, indent=1))
        print(f"wrote {out}")


if __name__ == "__main__":
    main()
