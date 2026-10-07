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
import base64
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
    ap.add_argument("--health", default="", help="JSON from health.py, if the month has an export")
    ap.add_argument("--extra", nargs="*", default=[],
                    help="extra image files to append to the photo strip")
    ap.add_argument("--key", required=True, help="month key, e.g. 2026-09")
    ap.add_argument("--out", required=True, help="path to write the finished page to")
    args = ap.parse_args()

    data = json.loads(pathlib.Path(args.data).read_text())

    # Health figures come from the export when there is one. Only the numbers
    # the export actually measures are overwritten: the gym count stays as
    # entered, because the export's workout rows log every auto-detected
    # activity and cannot be filtered down to gym sessions.
    if args.health:
        hx = json.loads(pathlib.Path(args.health).read_text())
        health = data.setdefault("health", {})
        health["steps"] = hx["steps"]["total"]
        health["stepSeries"] = hx["steps"]["series"]
        health["stepMean"] = hx["steps"]["mean"]
        health["hoursSlept"] = hx["sleep"]["totalH"]
        health["nightsOver6"] = hx["sleep"]["nightsOver6"]
        health["nightsRecorded"] = hx["sleep"]["recorded"]
        health["weekday"] = [{"day": w["day"], "sleep": w["sleep"],
                              "values": w.get("values", [])} for w in hx["weekday"]]
        health["weekdayBase"] = [{"day": b["day"], "box": b.get("box")}
                                 for b in hx["baseline"]["weekday"]]
        print(f"  health: {hx['steps']['total']:,} steps, {hx['sleep']['totalH']}h sleep "
              f"over {hx['sleep']['recorded']}/{hx['daysInMonth']} nights")

    # month/year/daysInMonth are derived from the key so they can't drift
    year, month_num = (int(part) for part in args.key.split("-"))
    data["month"] = MONTHS[month_num - 1]
    data["year"] = year
    if not data.get("daysInMonth"):
        import calendar
        data["daysInMonth"] = calendar.monthrange(year, month_num)[1]
    data["sample"] = False

    # Photos become one ordered strip. The two the form collects come first,
    # then any extras handed in on the command line. Everything is embedded as
    # a data URI so the page stays self-contained.
    family = data.setdefault("family", {})
    shots = []
    for slot in ("lilah", "activity"):
        src = load_photo(args.photos, args.key, slot)
        if src:
            shots.append({"src": src, "alt": f"Photo from the form ({slot})"})
            print(f"  {slot}: {len(src) // 1024} KB from the form")
        else:
            print(f"  {slot}: no photo")
    for extra in args.extra or []:
        path = pathlib.Path(extra)
        if not path.exists():
            print(f"  ! missing extra photo {extra}", file=sys.stderr)
            continue
        mime = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
        b64 = base64.b64encode(path.read_bytes()).decode()
        shots.append({"src": f"data:{mime};base64,{b64}", "alt": path.stem})
        print(f"  extra: {path.name}, {len(b64) // 1024} KB")
    if shots:
        family["photos"] = shots

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
