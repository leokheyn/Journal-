---
name: monthly-roundup
description: Generate the one-page bullet-journal roundup for a month — reads the month's entries from the Month-End Intake form, looks up each book's Goodreads rating and page count, works out what the step total adds up to, and publishes a 5x7in printable page. Use when asked to "make my September roundup", "do the month-end roundup", "close out the month", or when handed a month and asked for the journal page.
---

# Monthly roundup

Turns one month of the intake form into a printable 5×7in journal page.

**The form:** https://claude.ai/code/artifact/13341912-6373-4f28-9fd1-80ec404e1268
**Example output:** https://claude.ai/code/artifact/1a857e22-0563-4579-8abc-0a01c808a7e5

The person filling the form supplies only what they alone know: which books
they finished, how they rated them, four health totals, family notes, two
photos, and two work lines. Everything else on the page is yours to find or
work out. Do not ask them for a number you can look up.

## 1. Settle the month

Work out the month key, `YYYY-MM`. "September" with no year means the most
recent September that has passed. If they didn't name a month at all, use the
month that just ended.

## 2. Read the month's entries

```
Artifact  action: "read_db"  url: <form URL above>
          db_op: "get"  collection: "entries"  doc_id: "<YYYY-MM>"
```

If that document doesn't exist, say so and stop — don't invent a month. The
form may have saved only to their browser (it shows "this device only" when the
store is unreachable); if so, ask them to reopen the form so it syncs.

Then pull the photos **to files, never into the conversation** — each is a
base64 data URI worth tens of thousands of tokens:

```
Artifact  action: "read_db"  url: <form URL>
          db_op: "query"  collection: "photos"
          query: {where: [["key", "eq", "<YYYY-MM>"]]}
          out_dir: "<scratchpad>/dbdump"
```

Do not Read the files this writes. `build.py` handles them.

## 3. Look up what the form deliberately leaves blank

**Per book** — for each entry in `books`, find:

- `pages` — the page count. Use the edition they most likely read (the common
  paperback); if the form already carries a `pages` value they typed, that
  one wins.
- `goodreads` — the Goodreads **average** rating, to two decimals. This is the
  crowd's score, not theirs. Their own score is in `mine`, out of 5 — the form
  records it in quarter points, so pass fractional values like `4.25` through
  untouched rather than rounding them to whole stars.

Search for these; don't recall them from memory, since ratings drift. If a
book genuinely can't be found, leave `goodreads` off that entry rather than
guessing — the page averages only the books that have one.

**The step equivalent** — `stepsEquivalent` is one short phrase that makes the
step total mean something. Convert at roughly 2,000 steps to the mile, then
match the distance to something real and nameable:

> `"124 miles — Boston to New York City"`
> `"58 miles — the length of the Grand Canyon"`
> `"31 miles — up Kilimanjaro and back down"`

Pick a comparison with some connection to them or the season where you can.
Keep it under about 45 characters or it will wrap on the page. State the
mileage first, then the comparison after an em dash.

**Do not compute** book count, total pages, average Goodreads score, or average
personal score — the page derives all four from the book rows. Supplying them
by hand is how they end up disagreeing with each other.

## 4. Build the page

Write the DATA object to a JSON file in the scratchpad, shaped exactly like the
block at the top of `template.html`:

```jsonc
{
  "reading": {
    "books": [{"title": "", "author": "", "pages": 0, "goodreads": 0.0, "mine": 0}],
    "favorite":      {"title": "", "note": ""},
    "leastFavorite": {"title": "", "note": ""},
    "quote": {"text": "", "book": ""}
  },
  "health": {"steps": 0, "stepsEquivalent": "", "hoursSlept": 0,
             "nightsOver6": 0, "gymWorkouts": 0},
  "family": {"lilahSkill": "", "lilahPhoto": {"caption": ""},
             "activity": {"title": "", "caption": ""}, "celebration": ""},
  "work": {"accomplishment": "", "carryover": ""},

  // optional — omit the whole key and no weather band is drawn
  "weather": {
    "place": "Melbourne, FL",
    "items": [{"value": "84.5°", "label": "mean, +2.5°", "tone": "warm"}],
    "note": "one italic line under the figures, drawn with a lightning bolt"
  }
}
```

**Weather.** Home is **Melbourne, Florida** (NWS station KMLB) — use that
unless they say otherwise. Report the month's **observed** figures, never the
long-run averages, and make at least one of them a departure from normal:
the contrast is the story, not the raw number. `tone` is `"warm"`, `"wet"`,
or omitted, and only tints the figure.

Keep `label` to about 14 characters — longer ones wrap the row to two lines
and eat the photos below. Four items is the most that fits on one line.
`note` is one short sentence for whatever the figures alone don't say.

weather.gov, the historical weather APIs and weatherandclimate.info are all
blocked by this org's egress policy, so these come from search. Corroborate
anything surprising with a second search before it goes on the page, and if
a figure can't be confirmed, leave it off rather than printing a number that
might be wrong on something they're going to paste into a journal. Monthly
lightning strike counts are not published per-city — do not invent one.

Mapping from the form's fields: `fav`/`favNote` → `favorite`,
`least`/`leastNote` → `leastFavorite`, `quote`/`quoteBook` → `quote`,
`sleep` → `hoursSlept`, `nights` → `nightsOver6`, `gym` → `gymWorkouts`,
`skill` → `lilahSkill`, `capLilah` → `lilahPhoto.caption`,
`activity`/`capActivity` → `activity.title`/`activity.caption`,
`win` → `accomplishment`, `carry` → `carryover`. Leave `month`, `year`,
`daysInMonth`, `sample` and the photo `src` fields out — `build.py` fills them.

Pass their words through as written. Tighten only what overflows: the two
picks and the work lines have about 90 characters before they start crowding
the page, captions about 30. If something must be cut, cut it and mention
what you shortened — don't rewrite their voice into yours.

Then:

```bash
python3 .claude/skills/monthly-roundup/build.py \
  --data   <scratchpad>/<month>.json \
  --photos <scratchpad>/dbdump/photos \
  --key    <YYYY-MM> \
  --out    roundups/<YYYY-MM>.html
```

## 5. Make the PDF

```bash
npm install            # once per checkout
node .claude/skills/monthly-roundup/check_fit.js roundups/<YYYY-MM>.html
node .claude/skills/monthly-roundup/to_pdf.js \
  --in roundups/<YYYY-MM>.html --out roundups/<YYYY-MM>.pdf
```

The PDF centres the 5×7in page on US Letter with corner crop marks to trim
against. Always run `check_fit.js` first — it renders with the real
typefaces, embedded from `node_modules`, because Google Fonts is unreachable
here and the fallback serif has different metrics: a page can measure clean
under the fallback and still clip in print.

Then **look at the PDF**, don't just trust the checker — render a page to an
image (`pypdfium2`) and read the bottom of it. Chromium's PDF layout pass
resolves flexbox differently from its screen layout, so the browser can report
a clean page that the PDF still clips.

## 6. Publish

Publish `roundups/<YYYY-MM>.html` with the Artifact tool — a **new** artifact
each month, so every month keeps its own link. Favicon `📔`, and a description
naming the month.

Each month is a fresh file path, so never pass `url`. Only pass `url` when
correcting a month already published in an earlier session — find it with
`action: "list"`.

## 7. Hand it back

Tell them what you looked up and anything you had to judge: a book you couldn't
find a rating for, a caption you trimmed, a photo slot that came back empty.
Send the PDF with `SendUserFile`. Remind them to print at **actual size** —
"fit to page" is what turns a 5×7 page into a 4×6 one, and it moves the crop
marks off true.

## Checks worth making before publishing

- `nightsOver6` can't exceed the days in the month; if it does, ask.
- The favourite and least favourite should be titles that appear in `books`.
- An empty `celebration` is fine and normal — the page closes up around it.
  Don't invent one.
- The quote belongs to a book they read this month.

## The page itself

`template.html` holds the layout, and the only part meant to be edited is the
DATA block at the top — `build.py` replaces exactly that and nothing else. If
the design needs to change, change `template.html`; every future month picks it
up. Two things there are load-bearing:

- The page is fixed at 480×672px, which is 5×7in at 96dpi, and it must not
  overflow. Verify with `check_fit.js` and by looking at the rendered PDF —
  `scrollHeight === clientHeight` on `#page` proves nothing here, because the
  page has a fixed height and so can never report less.
- `sizePhotos()` measures the leftover space once and pins the photo height in
  pixels. Don't replace it with `flex: 1`: flex slack is distributed
  differently in Chromium's PDF pass, which silently clipped the page.
- The work bullets are real bullet-journal notation: `×` for done, `>` for a
  task migrating to next month. The carryover is deliberately marked as
  migrated, and next month's form opens with it pre-filled.
