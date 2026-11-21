# Knowledge Map

## What this is

**Douglas's personal atlas: a record of his geographical learning.** It is one map that layers
every aspect of geography he cares about (political boundaries, subdivisions, cities, mountains
and terrain, rivers, lakes, seas and oceans) and he decides what goes on it. It is curated, not a
database dump: a feature is on the map because he chose to learn about it and keep it there.
Membership is a personal selection (the `PERSONAL_*` lists in `scripts/process-countries.mjs`);
there are no editorial tiers. Stories, endonyms and facts attached to features are the notes of
that learning, and they should be clear and objective (UN-based recognition, neutral dispute
write-ups).

Desktop web, Google-Maps-style pan/zoom. Every feature on the map is styled and clickable.
Features are grouped into **toggleable thematic layers** (`src/map/themes.ts`) so it is never an
everything-at-once wall map, and labels follow a **typographic hierarchy**
(`src/map/typography.ts`): same feature class, same lettering. **My atlas · Tables**
(`/#catalog/countries`) lists everything on the map in searchable, sortable tables.

## Tech stack
- **Vite + React 19 + TypeScript** SPA; **MapLibre GL JS** (WebGL vector, per-layer min/max zoom);
  **Zustand** (`src/store/mapStore.ts`, `atlasStore.ts`). Map exposed as `window.__map` in dev.
- **polygon-clipping**: build-time geometry, and at runtime inside the marine editor worker.
- `react-markdown` + `remark-gfm`: reserved for the future markdown content pipeline.
- **Hosting:** an ESM Worker (`worker/`) serves the SPA assets plus an authenticated
  `/api/marine-boundaries` endpoint backed by a D1 `DB` binding (schema in `drizzle/`). Rows are
  keyed by the stable signed-in user ID + water name, with conditional revisions against
  stale-tab overwrites. Vite dev/preview does not emulate account storage; storage tests use SQLite.
- **Cloudflare (moving here from OpenAI Sites):** `wrangler.jsonc` deploys the same Worker as
  `my-cartograph` with the `dist/client` assets and a D1 `DB` (migrations in `drizzle/`).
  Cloudflare Workers Builds deploys every push to `main` and gives other branches preview links.
  There, the site is public to read and saving needs the `EDIT_PASSCODE` secret (rows use the
  fixed user `owner`); the OpenAI user header is ignored whenever that secret is set. Keep
  `.openai/` and `scripts/build-server.mjs` until OpenAI hosting is retired.

## Architecture: build-time pipeline + runtime layer stack

### Data pipeline (the "brain")
All curation lives in **`scripts/process-countries.mjs`**, the single source of truth for every
per-feature decision (membership, colors, disputes, names, focus regions, insets, dissolve,
orography, rivers, seas, marine hierarchy, catalog).
- `bash scripts/download-geodata.sh` fetches **Natural Earth** raws into `data/raw/` (gitignored,
  cached; run it on a fresh clone or when files are missing).
- **After editing the build script, run `node scripts/process-countries.mjs`.** It regenerates
  `public/geo/*`, `docs/my-atlas.md`, `catalog.json` and the packed subdivisions.
- `public/geo/admin1.geojson` is gitignored; it's stored as `data/packed/admin1.geojson.gz` and
  restored by `scripts/prepare-deploy-data.mjs` at build time.
- Reference data: `data/catalog-reference.json` (capitals and measurements with source links;
  refresh with `python scripts/fetch-catalog-reference.py`, needs network), `data/marine-additions.geojson`,
  `data/marine-boundary-edits.json` (replayed edit history; created by the first import).

Generated in `public/geo/`: `countries-{110,50,10}m`; `countries-labels` (ONE point/country:
`NAME,EXTENT,BBOX,FOCUS_BBOX`); `admin1` (~4,000 subdivisions at 4dp; territories excluded via
`STATUS_NOTE`; IT/FR/NO/GB dissolved) + `admin1-labels` (with `EXTENT`); `cities`; `insets.json`;
`{ocean,sea,lake}-labels`; `ranges`/`range-labels`/`peaks`; `rivers` (flow-oriented); `canals`;
`timezones`; `lakes/oceans/seas`; `marine-hierarchy.json`, `marine-selections.geojson`,
`marine-editor.json`, `marine-editor-land.geojson`; `catalog.json`.

### Runtime layer stack
`src/map/MapContainer.tsx` assembles the style. **Order matters** (bottom→top): `background → ocean →
countryLayers → subdivisionBorders → orographyAreaLayers (range tint) → inlandWaterLayers (lakes,
then rivers, ON TOP of land) → countryLabel → subdivisionLabels → cityLayers → waterLabelLayers →
orographyLayers (peak, then range LAST)`.
- Layers: `src/map/layers/{country,subdivision,city,physical,orography,canal,timezone}Layers.ts` ·
  Sources: `mapStyle.ts` · Colors: `colors.ts` · Interactions: `interactions.ts` · Typography:
  `typography.ts` · Themes: `themes.ts` · Ocean click fallback: `oceanLookup.ts`.
- Components: `InfoCard, SidePanel, InsetPanel, PolicyNote, SearchBar, ZoomIndicator, LayerPanel`
  (theme chips), `SpeakButton` (Web Speech endonyms), `CatalogPage` (tables),
  `MarineBoundaryEditor`.
- State: `mapStore.ts` (selectedPoint, focusedCountry+atMainland, zoom, hiddenThemes…).
  `mapRegistry.ts` holds the map singleton + `setHighlightCodes()` / `setFeatureHighlight()`.
  The map stays mounted after first visit so switching back from the catalog keeps the viewport.

## Key design decisions (the "why")

1. **Country color = UN recognition.** NE `MAPCOLOR13` → 13 hues in `colors.ts`, mirrored as
   `COUNTRY_COLORS` in the build script (keep in sync). Disputed areas take the UN parent's color
   (Taiwan→PRC, N.Cyprus→Cyprus, Somaliland→Somalia, W.Sahara→Morocco); Kosovo/Palestine keep their
   own; dependencies inherit the sovereign's; Antarctica/terra nullius gray. Each special case has a
   `STATUS_NOTE`, shown in "About the borders" (`PolicyNote.tsx`).

2. **Resolution tiers swap together.** Fill, border and click-highlight switch at once: 110m (z<4),
   50m (z4–5), 10m (z5+); admin-1 at z5+. Mismatched tiers visibly clash (a recurring bug).

3. **Overseas-territory insets.** A country is a "political container" with a 4-tier model: T1
   core/mainland; T2 integral non-contiguous (Hawaii, DROM, Canaries); T3 inhabited dependent
   (Greenland, HK, Bermuda); T4 uninhabited/remote. Curated in `INSET_COUNTRIES` (14 parents).
   Components come from `adm0:`, `admin1:`, or `clip:`+`flyToFix:`. `buildInsets` emits
   `insets.json` (SVG path, fill, fly-to bbox, legal-status badge, description, `fullExtent`).
   `InsetPanel.tsx`: double-click a country opens it; box single-click = card, double = fly+card;
   the "↩ mainland" box shows only when viewing a territory (`atMainland`). The globe button fits
   the antimeridian-aware full extent and lights all borders.

4. **Default focus.** Countries with detached parts have a curated `DEFAULT_FOCUS` bbox (lower-48,
   metro France…) stored as `FOCUS_BBOX`, so double-click fits the mainland.

5. **Region dissolve.** NE admin-1 is too granular for some countries (Italy 110 provinces, France
   101 départements, Norway 19, UK 232); `DISSOLVE_CONFIG` unions them into first-level regions.

6. **Label de-duplication.** ONE label point per feature (`countries-labels`, `admin1-labels`),
   from NE `LABEL_X/Y` where present; Russia overridden to center.

7. **Names & endonyms.** `NAME_OVERRIDES`, `FORMAL_EN` (subtitle), `NAME_NATIVE`+`NAME_NATIVE_LANG`
   (shown only if different from English; the BCP-47 tag drives `SpeakButton`). Physical features
   and capitals use `{RIVER,LAKE,RANGE,PEAK,CAPITAL}_NATIVE` (rivers need literals; others can pull
   an NE `name_xx` column via `{col:'zh'}`). Policy: **only ONE unambiguous native language**
   (Danube/Alps/Everest get none). `withNativeLine()` adds the endonym as a second label line
   (rivers inline: `Yangtze · 长江`), gated by `NATIVE_ON_MAP`. CJK renders via
   `localIdeographFontFamily`, Latin/Cyrillic/Greek via demotiles glyphs; Arabic/Devanagari etc.
   show only in the InfoCard until glyphs are self-hosted. The speaker button is political-only
   (`NO_SPEAKER` in `InfoCard.tsx`).

8. **Cities & inland water.** Capitals = red stars; cities >1M = dots (red if an admin-1 capital).
   Inland water draws ON TOP of land (NE country polygons don't cut lake holes). Lakes draw first,
   rivers on top, so NE "Lake Centerline" connectors stay visible as one continuous course.

9. **Typography, themes & label priority.** `typography.ts` tokens by class (WATER
   ocean>sea>river>lake; POLITICAL country>subdivision; PHYSICAL range>peak; CITY capital>major).
   Country/subdivision labels scale off per-feature `EXTENT` (cos-lat span). Tier-4 scattered
   territories get no country label. `themes.ts` maps toggles → layer ids; `LayerPanel.tsx` renders
   chips; `mapStore.hiddenThemes` applies visibility. The political base is always on.
   **Collision priority = style order, LATER layer wins**, which is why orography labels go last
   (otherwise the Appalachian label between "Virginia"/"West Virginia" never shows); `rangeLabel`
   comes after `peakLabel`. Reposition a range label with `RANGE_LABEL_POS`. **Lake labels gate on
   `EXTENT`, not NE `scalerank`** (0 for ~75% of lakes): `lakeSizeAt` hides a label until
   `coef·EXTENT` clears a floor. Trade-off: famous-but-tiny lakes (Dead Sea) label late.

10. **Orography.** From NE `geography_regions_polys` (`Range/mtn`, 129 ranges) +
    `geography_regions_elevation_points` (76 peaks). Ranges get a deliberately soft hypsometric tint
    ramped by `max_elev` (peaks-in-polygon join, `RANGE_MAX_ELEV` fallback). Peaks show
    `▲ Name` + elevation past z7. `regions-raw.geojson` also holds deserts/plateaus/isthmuses.

11. **Rivers.** `river-casing` under `river-line`; the `river-flow` dash overlay is stepped ~90 ms
    by a RAF loop in `MapContainer.tsx`. Line-placed names need `generateId:true` or
    `queryRenderedFeatures` throws. **Flow direction is real**: the dash follows coordinate order,
    and `processRivers`/`orientRiverParts` fix NE parts that ship backwards:
    - **Per part, grouped by name.** Parts are pooled, endpoints clustered at ~2 km (NE duplicates
      sit up to ~500 m apart), and each connected component is oriented toward its own terminus
      (the Volga's two chains both reach the Caspian). Whole-feature flips break mixed features.
    - **Mouth = nearest sea, or explicit hint.** `RIVER_REVERSE` maps name → mouth `[lon,lat]` or
      `null` (nearest ocean via `ocean-50m-raw.geojson`). Hints are needed when the source is nearer
      a coast than the mouth (Ohio, Missouri).
    - **Guards.** Auto-flip only when the whole river is decisively backwards toward a coastal
      (<60 km) mouth; leave rivers draining away from their nearest ocean (Amazon tributaries,
      Niger bend).

12. **Marine hierarchy & boundaries.** `PERSONAL_MARINE_EXCLUDED` controls labels, hit targets and
    catalog rows; excluded water stays part of its containing ocean's extent.
    `MARINE_PARENT_OVERRIDES` declares the curated hierarchy (connections alone don't create
    parents; e.g. Black Sea under Mediterranean, with Dardanelles/Marmara/Bosporus as siblings).
    Boundary lines use the same dissolved geometry as highlights, and coastal waters share the
    detailed 10m land coastline (see `docs/marine-coast-audit.md`). Offshore limits are atlas
    extents, not legal maritime boundaries. Ocean fallback clicks use basin containment +
    distance to water boundaries, with antimeridian handling.

13. **Marine boundary editor.** "Edit water boundaries": drag/add/remove offshore handles; endpoints
    touching land snap to the 10m coastline, which is never editable. Saves go to the user's
    account via the Worker API and apply on the normal map immediately. One geometry engine
    (`scripts/lib/marine-*.mjs`) rebuilds previews and map sources; stale baseline fingerprints are
    surfaced, never silently applied. Coastline data loads on demand in
    `src/map/marineEditor.worker.ts`. Optional export → `node scripts/import-marine-edits.mjs
    <file>` appends to `data/marine-boundary-edits.json`, replayed by every build.

## Conventions & gotchas
- **Regenerate after data changes:** edit `process-countries.mjs` → run it.
- **Map handlers don't hot-reload** (`setupInteractions` runs once); test with a full page reload.
- **Preview cold-loads slowly** (~35 MB+ GeoJSON + remote glyphs, 30–60 s). Prefer `window.__map`
  `getBounds()`/`queryRenderedFeatures`/DOM checks over screenshots, and poll `isStyleLoaded()` +
  non-empty `queryRenderedFeatures` before asserting.
- **Antimeridian:** `countryBbox`, `geomToSvg`, `unionBoxes` handle the 180° wrap (Russia,
  US/Alaska, Fiji, NZ). Check lon signs on `clip` bboxes near the dateline.
- **Two color tables must match:** `colors.ts` and `COUNTRY_COLORS`.
- **A code can be a territory's yet look like a parent's:** Clipperton is NE `ISO_A2="FR"`, so
  territory logic must check that no sovereign already claims the code.

## Common tasks
- Add/remove a feature from my atlas → edit the `PERSONAL_*` selections, re-run the build script.
- Rename a country → `NAME_OVERRIDES` (+ `NATIVE_*`), re-run.
- Add an overseas territory → `INSET_COUNTRIES`; for a new parent also `DEFAULT_FOCUS`,
  `HOME_LABEL`, `HOME_DESC`, `PARENT_LABEL` (`InsetPanel.tsx`); re-run; hard-reload.
- Dissolve subdivisions → add `DISSOLVE_CONFIG` only if NE admin-1 is too granular.
- Recolor → `colors.ts` AND the build-script mirror.
- New toggleable theme → register ids in `themes.ts`, build layers from `typography.ts` tokens,
  insert at the right position in the `MapContainer.tsx` stack.
- River/lake facts → `RIVER_INFO`/`LAKE_INFO` (keyed by NE `name`); `enrichLakes` computes top-10
  area/depth ranks (Caspian excluded) → `RankMedal` badge in `InfoCard.tsx`.
- Endonym → `{RIVER,LAKE,RANGE,PEAK}_NATIVE` (`{col:'zh'}` or literal `{native,lang}`, required for
  rivers), re-run, hard-reload. Capitals auto via `NATIVE_LANG_COLUMN`; fix artifacts
  (東京都→東京) in `CAPITAL_NATIVE`.
- Mountain names → standalone nouns bare (Alps/Andes/Pyrenees); exonyms/typos →
  `RANGE_NAME_OVERRIDES`; label position → `RANGE_LABEL_POS`.
- River direction → `RIVER_REVERSE`. Missing estuary reach (St. Lawrence below Montreal) →
  downstream-ordered centerline in `RIVER_ADD` (also pin it in `RIVER_REVERSE`).
- Name-changing river (Lancang→Mekong; Yarlung→Brahmaputra) → `RIVER_SYSTEM` (members source→mouth
  + `note`); the map keeps local labels, a click reports and highlights the whole system.
- Add a water body NE omits (Sea of Azov, Gulf of Martaban, Delaware Bay, Norton Sound) → `SEA_ADD`
  with a **generous, sloppy `ring`** that spills well onto land on every coastal side, plus a
  `labelAt` point. `enrichSeas` subtracts the 10m coastline so coasts snap and only the seaward
  mouth stays drawn. Optional `openInto: '<adjacent sea>'` subtracts that sea too (draw the ring
  extending into it) so the two abut with no gap; the body's water must sit outside that sea's
  polygon. Slivers <5% are dropped; idempotent via `curated:true`. Tighten a too-wide mouth by
  pulling water-side vertices toward the real entrance. Smallest overlapping sea wins a click.
  The `/add-bay` command (`.claude/commands/add-bay.md`) automates this end to end.
- Click selection → water, ranges, seas and oceans are all clickable; `interactions.ts` resolves by
  priority and `setFeatureHighlight(kind,name)` drives the gold glow. Seas use an invisible
  `sea-hit` fill, rivers a fat `river-hit` line; a selected river keeps its flow animation.

## Future directions
1. **Markdown content pipeline:** a `content/` folder with one .md per feature (frontmatter
   id/type/coords; body = notes + sources) and a build-time index feeding cards and the side panel.
2. **Rivers and orography learning notes:** story cards for chosen rivers and peaks; then straits,
   isthmuses, deserts and landmarks (geometry already in `regions-raw.geojson`).
3. Later: a historical-borders timeline; language-geography choropleths.

## Commands
- `npm run dev` · `npm run build` (prepares deploy data, typechecks, builds SPA + Worker) ·
  `npm run lint`
- `node scripts/process-countries.mjs` (regenerate) · `bash scripts/download-geodata.sh` (fetch raws)
- Tests: `node --experimental-strip-types --test scripts/check-*.test.mjs`
- Optional coast audit: `python3 scripts/audit-marine-coasts.py` (needs Shapely)
