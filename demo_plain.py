"""The working copy the recordings show and run: the bench's sources without what the measured session needs to serve
every setup from one build (ORM=drizzle-prep, ORM=prisma-join). What's left is what ORM=drizzle and ORM=prisma ran.

usage: demo_plain.py [apps folder]   (default apps/, in place; rewrites drizzle.ts, prisma.ts, server.ts)
"""
import re
import sys
from pathlib import Path


def swap(text: str, old: str, new: str, where: str) -> str:
    assert text.count(old) >= 1, f"{where}: {old!r} not found"
    return text.replace(old, new)


def drizzle(text: str) -> str:
    text, cut = re.subn(r'// ORM=drizzle-prep:.*?const prepared = \{.*?\n\};\n\n', "", text, flags=re.S)
    assert cut == 1, "drizzle.ts: the prepared block moved"
    text, cut = re.subn(r'  const queries = \{.*?\n    : queries;\n', "  return { getUser, listUsers, getFeed, getFeedLoop, createUser };\n", text, flags=re.S)
    assert cut == 1, "drizzle.ts: connect() moved"
    return text


def prisma(text: str) -> str:
    text = swap(text, '// ORM=prisma-join loads relations with one JOIN query instead of one query per level.\nconst strategy = process.env.ORM === "prisma-join" ? "join" : "query";\n\n', "", "prisma.ts")
    return swap(text, "relationLoadStrategy: strategy", 'relationLoadStrategy: "query"', "prisma.ts")


def server(text: str) -> str:
    text = swap(text, '  "prisma-join": 8314,\n  "drizzle-prep": 8313,\n', "", "server.ts")
    text = swap(text, 'await import(`./${orm.replace(/-(join|prep)$/, "")}.js`)', "await import(`./${orm}.js`)", "server.ts")
    # A normal exit on Ctrl-C, so node --cpu-prof writes its file (exit-on-signal.ts in the measured profiles).
    return text + 'process.on("SIGINT", () => process.exit(0));\n'


def main() -> None:
    apps = Path(sys.argv[1] if len(sys.argv) > 1 else "apps")
    for name, change in (("drizzle.ts", drizzle), ("prisma.ts", prisma), ("server.ts", server)):
        (apps / name).write_text(change((apps / name).read_text()))


if __name__ == "__main__":
    main()
