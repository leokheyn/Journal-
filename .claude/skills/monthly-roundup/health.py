#!/usr/bin/env python3
"""Pull one month's health figures out of an Apple Health daily export.

The export holds every day on record, not just the month wanted, so this
slices out the month, reports how complete it is, and derives only what the
page draws. It never guesses at a missing day: a gap stays null, and the
coverage count says how many days actually carried a reading.

    python3 .claude/skills/monthly-roundup/health.py \\
        --csv <export>/daily.csv --key 2026-09 --out <scratchpad>/health.json

Columns used: date, steps, distance_mi, sleep_h, in_bed_h, sleep_deep_h,
sleep_rem_h. Workout columns are deliberately ignored — `workout_count` logs
every auto-detected activity (101 in September, up to 8 in a day), which is
not the same thing as the gym sessions the form asks for.
"""

import argparse
import calendar
import csv
import datetime as dt
import json
import statistics as st

WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def mean(xs):
    xs = [x for x in xs if x is not None]
    return st.mean(xs) if xs else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", required=True)
    ap.add_argument("--key", required=True, help="month to extract, YYYY-MM")
    ap.add_argument("--out", required=True)
    ap.add_argument("--baseline-months", type=int, default=12,
                    help="months before this one to compare against")
    args = ap.parse_args()

    year, month = (int(p) for p in args.key.split("-"))
    days = calendar.monthrange(year, month)[1]

    with open(args.csv, newline="") as fh:
        rows = list(csv.DictReader(fh))
    for r in rows:
        r["_d"] = dt.date.fromisoformat(r["date"])

    by_date = {r["_d"]: r for r in rows}
    month_days = [dt.date(year, month, d + 1) for d in range(days)]
    picked = [by_date.get(d) for d in month_days]
    if not any(picked):
        raise SystemExit(f"no rows for {args.key} in {args.csv}")

    steps = [num(r["steps"]) if r else None for r in picked]
    sleep = [num(r["sleep_h"]) if r else None for r in picked]
    in_bed = [num(r["in_bed_h"]) if r else None for r in picked]
    deep = [num(r["sleep_deep_h"]) if r else None for r in picked]
    rem = [num(r["sleep_rem_h"]) if r else None for r in picked]
    dist = [num(r["distance_mi"]) if r else None for r in picked]

    got_steps = [x for x in steps if x is not None]
    got_sleep = [x for x in sleep if x is not None]
    asleep, abed = sum(got_sleep), sum(x for x in in_bed if x is not None)

    best_i = steps.index(max(got_steps)) if got_steps else None
    worst_i = sleep.index(min(got_sleep)) if got_sleep else None
    long_i = sleep.index(max(got_sleep)) if got_sleep else None

    # weekday shape, this month: the mean, plus every individual night, so the
    # page can scatter the actual nights instead of only their average
    wd = []
    for i, name in enumerate(WEEKDAYS):
        idx = [j for j, d in enumerate(month_days) if d.weekday() == i]
        nights = sorted(sleep[j] for j in idx if sleep[j] is not None)
        wd.append({
            "day": name,
            "n": len(nights),
            "sleep": mean(nights),
            "values": [round(v, 2) for v in nights],
            "steps": mean([steps[j] for j in idx]),
        })

    # the same weekday shape over the trailing baseline, to show whether a
    # pattern in this month is actually this month's, or just how the week goes
    start = dt.date(year, month, 1)
    back = start
    for _ in range(args.baseline_months):
        back = (back.replace(day=1) - dt.timedelta(days=1)).replace(day=1)
    base = [r for r in rows if back <= r["_d"] < start]
    base_wd = []
    for i, name in enumerate(WEEKDAYS):
        vals = sorted(v for v in (num(r["sleep_h"]) for r in base
                                  if r["_d"].weekday() == i) if v is not None)
        box = None
        if len(vals) >= 5:
            # quartiles over the whole baseline, which is what makes a box
            # worth drawing at all — a single month gives 4 nights a weekday
            q1, med, q3 = (round(q, 2) for q in st.quantiles(vals, n=4))
            iqr = q3 - q1
            inside = [v for v in vals if q1 - 1.5 * iqr <= v <= q3 + 1.5 * iqr]
            box = {"q1": q1, "med": med, "q3": q3,
                   "lo": round(min(inside), 2), "hi": round(max(inside), 2)}
        base_wd.append({"day": name, "n": len(vals), "sleep": mean(vals), "box": box})
    base_steps = mean([num(r["steps"]) for r in base])
    base_sleep = mean([num(r["sleep_h"]) for r in base])

    out = {
        "key": args.key,
        "daysInMonth": days,
        "steps": {
            "total": int(sum(got_steps)),
            "mean": round(mean(got_steps), 1) if got_steps else None,
            "recorded": len(got_steps),
            "series": [None if s is None else int(s) for s in steps],
            "best": None if best_i is None else {"day": best_i + 1, "value": int(steps[best_i])},
            "milesWalked": round(sum(x for x in dist if x is not None), 1),
        },
        "sleep": {
            "totalH": round(asleep, 1),
            "meanH": round(mean(got_sleep), 2) if got_sleep else None,
            "recorded": len(got_sleep),
            "nightsOver6": sum(1 for x in got_sleep if x > 6),
            "nightsOver7": sum(1 for x in got_sleep if x > 7),
            "efficiencyPct": round(100 * asleep / abed, 1) if abed else None,
            "deepPct": round(100 * sum(x for x in deep if x is not None) / asleep, 1) if asleep else None,
            "remPct": round(100 * sum(x for x in rem if x is not None) / asleep, 1) if asleep else None,
            "series": [None if s is None else round(s, 2) for s in sleep],
            "shortest": None if worst_i is None else {"day": worst_i + 1, "value": sleep[worst_i]},
            "longest": None if long_i is None else {"day": long_i + 1, "value": sleep[long_i]},
        },
        "weekday": wd,
        "baseline": {
            "months": args.baseline_months,
            "stepsPerDay": round(base_steps, 1) if base_steps else None,
            "sleepPerNight": round(base_sleep, 2) if base_sleep else None,
            "weekday": base_wd,
        },
    }

    with open(args.out, "w") as fh:
        json.dump(out, fh, indent=2)

    s, sl = out["steps"], out["sleep"]
    print(f"  {args.key}: {s['recorded']}/{days} days of steps, {sl['recorded']}/{days} nights of sleep")
    if sl["recorded"] < days:
        gaps = [month_days[i].isoformat() for i, v in enumerate(sleep) if v is None]
        print(f"  ! sleep missing on {len(gaps)} night(s): {gaps[0]} … {gaps[-1]}")
    print(f"  steps {s['total']:,} (avg {s['mean']:,.0f}/day) · "
          f"sleep {sl['totalH']}h over {sl['recorded']} nights, {sl['nightsOver6']} over 6h")
    worst = min(wd, key=lambda w: w["sleep"] if w["sleep"] is not None else 99)
    best = max(wd, key=lambda w: w["sleep"] if w["sleep"] is not None else -1)
    print(f"  shortest night {worst['day']} {worst['sleep']:.2f}h · longest {best['day']} {best['sleep']:.2f}h")
    print(f"  wrote {args.out}")


if __name__ == "__main__":
    main()
