#!/usr/bin/env python3
"""Render a month's roundup page from the template.

Splices the month's DATA block and the two photos into template.html and
writes a standalone page ready to publish.  The photos are base64 data URIs
tens of thousands of characters long — this script moves them from the
db export straight into the page so they never pass through the
conversation.

    python3 .claude/skills/monthly-roundup/build.py \
        --data     /tmp/.../september.json \
        --photos   /tmp/.../dbdump/photos \
        --key      2026-09 \
        --out      roundups/2026-09.html
"""

import argparse
import json
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
TEMPLATE = HERE / "template.html"

START = "const DATA = "
END = "/* ====================== end of the editable block ======================= */"

MONTHS = ["January", "February", "March", "April", "May", "June", "July",
          "August", "September", "October", "November", "December"]


def find_data_uri(blob):
    """Pull the first image data URI out of whatever shape the export used."""
    if isinstance(blob, str):
        return blob if blob.startswith("data:image") else None
    if isinstance(blob, dict):
        for value in blob.values():
            found = find_data_uri(value)
            if found:
                return found
    if isinstance(blob, list):
        for value in blob:
            found = find_data_uri(value)
            if found:
                return found
    return None


def load_photo(photos_dir, key, slot):
    if not photos_dir:
        return ""
    path = pathlib.Path(photos_dir) / f"{key}-{slot}.json"
    if not path.exists():
        # tolerate an out_dir that kept the collection folder
        matches = list(pathlib.Path(photos_dir).rglob(f"{key}-{slot}.json"))
        if not matches:
            return ""
        path = matches[0]
    try:
        return find_data_uri(json.loads(path.read_text())) or ""
    except (json.JSONDecodeError, OSError) as exc:
        print(f"  ! could not read {path.name}: {exc}", file=sys.stderr)
        return ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True, help="JSON file holding the DATA object")
    ap.add_argument("--photos", default="", help="directory of photo docs from read_db out_dir")
    ap.add_argument("--key", required=True, help="month key, e.g. 2026-09")
    ap.add_argument("--out", required=True, help="path to write the finished page to")
    args = ap.parse_args()

    data = json.loads(pathlib.Path(args.data).read_text())

    # month/year/daysInMonth are derived from the key so they can't drift
    year, month_num = (int(part) for part in args.key.split("-"))
    data["month"] = MONTHS[month_num - 1]
    data["year"] = year
    if not data.get("daysInMonth"):
        import calendar
        data["daysInMonth"] = calendar.monthrange(year, month_num)[1]
    data["sample"] = False

    family = data.setdefault("family", {})
    for slot, field in (("lilah", "lilahPhoto"), ("activity", "activityPhoto")):
        src = load_photo(args.photos, args.key, slot)
        family.setdefault(field, {})["src"] = src
        print(f"  {slot}: {'photo spliced in (%d KB)' % (len(src) // 1024) if src else 'no photo — frame left empty'}")

    template = TEMPLATE.read_text()
    start = template.index(START)
    end = template.index(END)
    body = json.dumps(data, indent=2, ensure_ascii=False)
    page = template[:start] + "const DATA = " + body + ";\n" + template[end:]

    title = f"{data['month']} {year} Roundup"
    page = re.sub(r"<title>.*?</title>", f"<title>{title}</title>", page, count=1)

    out = pathlib.Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(page)
    print(f"  wrote {out} ({len(page) // 1024} KB) — title: {title}")


if __name__ == "__main__":
    main()
