# Journal

A monthly roundup for the bullet journal: fill in a form at the end of the
month, and Claude looks up the rest and produces a one-page spread sized to
print at 5×7in, trim, and paste in.

## The two pages

| | |
|---|---|
| **[Month-End Intake](https://claude.ai/artifact/3NYA8ayHZTLqNVBJmHgbSX)** | The form. Fill it in across the month or in one sitting. |
| **[Example roundup](https://claude.ai/code/artifact/1a857e22-0563-4579-8abc-0a01c808a7e5)** | What comes out, with sample data. |

## How a month goes

1. **Fill the form.** It saves as you type and remembers each month separately,
   so you can add books as you finish them rather than reconstructing the month
   from memory on the 30th. Pick the month at the top right.
2. **Ask for the roundup** — "Make my September 2026 roundup" — and attach your
   Apple Health `daily.csv` export. The form shows the exact phrase, with a
   copy button.
3. **Claude fills in the rest** and publishes the page as its own link.
4. **Print at actual size.** Scaling to fit the paper is what turns a 5×7 page
   into a 4×6 one.

## What you fill in vs. what Claude finds

You supply only what you alone know. The form deliberately has no field for
anything lookup-able.

| You | Claude |
|---|---|
| Which books you finished, and your score out of 5 | Page counts and each book's Goodreads average |
| Favourite and least favourite, and why | Books read, total pages, both average scores |
| A quote worth keeping | — |
| Gym sessions | Steps, hours slept and nights over 6 hrs, read from your Apple Health export, plus the day-by-day charts and what the steps work out to in miles |
| Lilah's new skill, two photos, the best day out | — |
| Anything worth celebrating | — |
| The work win, and the item you didn't get to | — |

The missed action item is marked `>` on the page — bullet-journal notation for
a task migrating forward — and comes back pre-filled on next month's form.

## Repository layout

```
.claude/skills/monthly-roundup/
    SKILL.md        how Claude builds a month: what to look up, how to map it
    template.html   the 5x7 page. Editable block at the top, layout below
    build.py        splices a month's data, photos and health figures in
    health.py       pulls one month out of the Apple Health daily export
    to_pdf.js       5x7 centred on US Letter, with crop marks
    check_fit.js    renders with the real fonts and reports overflow
intake/
    month-end-intake.html    source of the published form
roundups/
    sample-september-2026.html   the example above
    YYYY-MM.html                 one file per month, as they're generated
```

To change how the page looks, edit `template.html` — every future month picks
it up. It's fixed at 480×672px (5×7in at 96dpi) and must not overflow; after a
layout change, run `node .claude/skills/monthly-roundup/check_fit.js` and look at the PDF.

## Health data

Steps and sleep come from an Apple Health daily export (`daily.csv`), attached
when you ask for the roundup. It isn't kept in this repo — it's a rolling
record of everything, it goes stale, and it's yours. `health.py` slices out the
one month and reports how many days it actually covers; missing nights stay
missing rather than being guessed at.

The gym count is still typed on the form. The export's workout rows log every
auto-detected activity — 101 of them in September — so they can't be filtered
down to gym sessions.

## Photos

The form shrinks each photo in the browser before storing it, to stay under the
256 KiB-per-document limit. `build.py` moves them from the form's store into the
page directly, so the image data never passes through a conversation.
