"""Self time by function and by package from a .cpuprofile.
usage: analyze_profile.py <file> [top] [--json out.json]   (the JSON keeps the package shares of busy time)"""
import json
import re
import sys
from collections import Counter


def package(url: str) -> str:
    m = re.search(r"node_modules/((?:@[^/]+/)?[^/]+)", url)
    if m:
        return m.group(1)
    if "/dist/apps/" in url:
        return "our app"
    if url.startswith("node:") or not url:
        return "node internals / GC / native"
    return url


def main() -> None:
    prof = json.load(open(sys.argv[1]))
    args = sys.argv[2:]
    out = args[args.index("--json") + 1] if "--json" in args else None
    args = [a for a in args if a != "--json" and a != out]
    top = int(args[0]) if args else 25
    nodes = {n["id"]: n for n in prof["nodes"]}
    dt = prof["timeDeltas"]
    self_us = Counter()
    for sample, delta in zip(prof["samples"], dt):
        self_us[sample] += delta
    by_fn, by_pkg = Counter(), Counter()
    total = sum(self_us.values())
    idle = 0
    for nid, us in self_us.items():
        cf = nodes[nid]["callFrame"]
        name = cf["functionName"] or "(anonymous)"
        if name in ("(idle)", "(program)"):
            idle += us if name == "(idle)" else 0
        by_fn[(name, package(cf["url"]), cf.get("lineNumber", 0))] += us
        by_pkg["(idle)" if name == "(idle)" else ("(garbage collector)" if name == "(garbage collector)" else package(cf["url"]))] += us
    busy = total - idle
    print(f"busy {busy / 1e6:.1f} s of {total / 1e6:.1f} s")
    for pkg, us in by_pkg.most_common():
        if pkg != "(idle)":
            print(f"  {us / busy * 100:5.1f}%  {pkg}")
    if out:
        shares = {pkg: us / busy for pkg, us in by_pkg.items() if pkg != "(idle)"}
        fns = [{"name": n, "package": p, "share": us / busy} for (n, p, _), us in by_fn.most_common(top) if n != "(idle)"]
        json.dump({"busy_s": busy / 1e6, "packages": shares, "functions": fns}, open(out, "w"), indent=1)
    print("top functions (self time):")
    for (name, pkg, line), us in by_fn.most_common(top):
        if name != "(idle)":
            print(f"  {us / busy * 100:5.1f}%  {name}  [{pkg}:{line}]")


if __name__ == "__main__":
    main()
