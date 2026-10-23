---
description: Add one or more curated bays/gulfs/seas to the map (SEA_ADD, clipped to the coastline + adjacent sea)
argument-hint: <name>[; <name>; ...]  e.g. "Chesapeake Bay; Bristol Channel"
---
Add the water body/bodies named in `$ARGUMENTS` to the curated marine list so each is
labeled AND clickable on the map. This is a LOCALIZED task — work only in the spot
below, do NOT scan the wider project or start a dev server.

The technique: you draw a **generous, sloppy `ring`** and `enrichSeas` subtracts the real
10m coastline (so coastal edges snap to the true shore) AND, optionally, the adjacent
named sea (so the seaward "mouth" lands exactly on that sea's boundary). You never trace a
coastline or copy a sea's boundary vertices by hand.

For EACH requested water body:

1. From geographic knowledge, sketch a **`ring`** `[[lon,lat],...]` (~6–9 points):
   - **Spill WELL ONTO LAND on every coastal side** — push each shore-side vertex ~10–30 km
     *inland*. Any stretch where the ring edge stays over water near the coast will NOT hug
     (that's the "only partially hugging" bug); when in doubt, go further inland.
   - **The seaward (open-water) side:** decide whether the body opens into a *named* sea/ocean
     already on the map (grep `public/geo/seas.geojson` / `ocean-labels.geojson`):
     - **Yes** (e.g. Norton Sound → Bering Sea): set `openInto: 'Bering Sea'` and draw the
       seaward vertices EXTENDING PAST the mouth INTO that sea. `enrichSeas` subtracts the sea,
       so the mouth is trimmed to the sea's exact boundary and the two abut with no gap. (Only
       works if the body's water is OUTSIDE that sea's polygon — the usual case for a bay off a
       sea; if unsure, point-in-polygon test the label point against the sea.)
     - **No / opens straight to open ocean:** omit `openInto`; the mouth is one straight drawn
       line — keep it near the real entrance (headland to headland, e.g. Cape May–Cape Henlopen).
   - Also choose: `labelAt: [lon,lat]` over the middle of the water; `featurecla`
     (`'bay'` | `'gulf'` | `'sea'` | `'strait'`); `scalerank` (3 = large … 6 = small).

2. Append the entry to the `SEA_ADD` array in `scripts/process-countries.mjs` (grep
   `const SEA_ADD` and read only that array — don't read the whole file).

3. Run `node scripts/process-countries.mjs`.

4. Verify from data (no browser needed):
   - It's in `public/geo/seas.geojson` as a MULTI-vertex clipped polygon (dozens–hundreds of
     verts, NOT your ~6-point ring), with a matching point in `sea-labels.geojson`. Report the
     vertex count and bbox. If the clip returned null/tiny, the ring didn't overlap enough
     water — widen it and re-run. If `openInto` warned "not found", fix the sea name.
   - **If `openInto` was set:** confirm the mouth coincides with that sea — the body's single
     LONGEST edge should equal a boundary edge of the named sea (same two endpoints). If the
     longest edge is short / the seaward side has many vertices floating in open water, the ring
     didn't extend far enough into the sea — push those vertices further in and re-run.

Then tell the user each body was added, its clipped vertex count/bbox, and flag any mouth that
still looks too generous (they can ask to pull it tighter). Background on the technique is in
CLAUDE.md ("Add a named water body NE's 50m marine layer omits") — no need to re-derive it.
