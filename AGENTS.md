# Knowledge Map

**Mission: an opinionated curated atlas — every labeled feature earns its place with a story,
told clearly and objectively.** Curation is editorial, not statistical: **"no story, no label"**
(the Volga is in as Russia's historical spine; a peak that's "just a number" is out). It
manifests the owner's curiosity, not a database dump.

Desktop web, Google-Maps-style pan/zoom; every country, territory, subdivision, city, and water
body is styled and clickable, with an editorial POV (UN-based recognition, overseas-territory
taxonomy, objective dispute write-ups). Features are grouped into **toggleable thematic layers**
(`src/map/themes.ts`) so the map isn't an everything-at-once wall map, and labels follow a
**typographic hierarchy** (`src/map/typography.ts`) — same feature class, same lettering.

## Tech stack
- **Vite + React 19 + TypeScript** (pure SPA, no SSR); **MapLibre GL JS** (WebGL vector, declarative
  style with per-layer min/max zoom); **Zustand** (`src/store/mapStore.ts`).
- `react-markdown`+`remark-gfm` (future content), `framer-motion` (panel anims), **polygon-clipping**
  (dev-only build tool). Map exposed as `window.__map` in dev.

## Architecture: build-time pipeline + runtime layer stack

### Data pipeline (the "brain")
All curation lives in **`scripts/process-countries.mjs`** — the single source of truth for every
per-country/territory decision (colors, disputes, names, focus regions, insets, dissolve, orography,
rivers, seas).
- `scripts/download-geodata.sh` → fetches **Natural Earth** raws into `data/raw/` (cached). Rivers +
  a 50m ocean go to `data/raw/`; lakes/oceans/seas download to `public/geo/`.
- **After editing the build script, run `node scripts/process-countries.mjs`** (raws are cached;
  re-run `download-geodata.sh` only if `data/raw/` is missing files).

Generated in `public/geo/`: `countries-{110,50,10}m.geojson`; `countries-labels.geojson` (ONE
point/country: `NAME,EXTENT,BBOX,FOCUS_BBOX`); `admin1.geojson` (~4,000 subdivisions at 4dp;
territories excluded via `STATUS_NOTE`; IT/FR/NO/GB dissolved); `admin1-labels.geojson` (carries
`EXTENT`); `cities`, `insets.json`, `{ocean,sea,lake}-labels`; `ranges`/`range-labels`/`peaks`;
`rivers.geojson` (flow-oriented); `lakes/oceans/seas` (downloaded, then enriched in place).

### Runtime layer stack
`src/map/MapContainer.tsx` assembles the style. **Order matters** (bottom→top): `background → ocean →
countryLayers → subdivisionBorders → orographyAreaLayers (range tint) → inlandWaterLayers (rivers +
lakes ON TOP of land) → countryLabel → subdivisionLabels → cityLayers → waterLabelLayers →
orographyLayers (range/peak labels, LAST — see decision 9)`.
- Layers: `src/map/layers/{country,subdivision,city,physical,orography}Layers.ts` · Sources:
  `mapStyle.ts` · Colors: `colors.ts` · Interactions: `interactions.ts` · Typography: `typography.ts`
  · Themes: `themes.ts`.
- Components: `InfoCard, SidePanel, InsetPanel, PolicyNote, SearchBar, ZoomIndicator, LayerPanel`
  (theme chips), `SpeakButton` (Web Speech endonyms).
- State: `mapStore.ts` (selectedPoint, focusedCountry+atMainland, zoom, hiddenThemes…). `mapRegistry.ts`
  holds the map singleton + `setHighlightCodes()` (shared highlight/glow helper).

## Key design decisions (the "why")

1. **Country color = UN recognition.** NE `MAPCOLOR13` → 13 hues in `colors.ts` (mirrored as
   `COUNTRY_COLORS` in the build script — keep in sync). Disputed areas colored as UN parent
   (Taiwan→PRC, N.Cyprus→Cyprus, Somaliland→Somalia, W.Sahara→Morocco); Kosovo/Palestine keep own;
   dependencies inherit the sovereign's; Antarctica/terra-nullius gray. Each special case carries a
   `STATUS_NOTE` (shown in the "About the borders" panel, `PolicyNote.tsx`).

2. **Resolution tiers swap together.** Fill, border, click-highlight switch at once: 110m (z<4),
   50m (z4–5), 10m (z5+); admin-1 at z5+. Mismatched tiers visibly clash — a recurring bug.

3. **Overseas-territory inset system.** A country is a "political container." **4-tier model**: T1
   core/mainland (home box); T2 integral non-contiguous (Hawaii, DROM, Canaries); T3 inhabited
   dependent (Greenland, HK, Bermuda); T4 uninhabited/remote. Curated in `INSET_COUNTRIES` (**14
   parents done**). Components sourced via `adm0:`, `admin1:`, or `clip:`+`flyToFix:` (extract from
   parent geometry). `buildInsets` emits `insets.json` (SVG path, fill, fly-to bbox, badge=legal
   status, description, `fullExtent`). `InsetPanel.tsx`: double-click a country/territory opens it;
   box single-click=card, double=fly+card; the "↩ mainland" home box shows only when viewing a
   territory (`atMainland`). Header globe button fits **full extent** (antimeridian-aware union) and
   lights all borders via `setHighlightCodes()`.

4. **Default-focus region.** Countries with detached parts have a curated `DEFAULT_FOCUS` bbox
   (lower-48, metro France…) so double-click fits the mainland. Stored as `FOCUS_BBOX`; full extent
   via the inset globe button.

5. **Region dissolve.** NE ships sub-regional admin-1 for some countries (Italy 110 provinces,
   France 101 départements, Norway 19, UK 232). `DISSOLVE_CONFIG` merges them to true first-level
   regions via `polygon-clipping` union.

6. **Label de-duplication.** Huge countries / multipolygon provinces repeat labels per tile; fixed by
   ONE point per feature (`countries-labels`, `admin1-labels`). NE `LABEL_X/Y` where present; Russia
   overridden to center.

7. **Names & endonyms.** `NAME_OVERRIDES` (common/official), `FORMAL_EN` (subtitle),
   `NAME_NATIVE`+`NAME_NATIVE_LANG` (endonym, shown only if it differs from English; the BCP-47 tag
   drives `SpeakButton`). Physical features & capitals have endonyms too — curated
   `{RIVER,LAKE,RANGE,PEAK,CAPITAL}_NATIVE` set `name_native`/`_lang` (rivers need literals — NE has
   none; lakes/ranges/peaks/cities can pull an NE `name_xx` col via `{col:'zh'}`). Policy: **only ONE
   unambiguous native language** (Danube/Alps/Everest get none). On the map, `withNativeLine()`
   renders the endonym as a second label line (rivers inline `Yangtze · 长江`, since line-placed
   labels can't break), gated by build-time `NATIVE_ON_MAP` — CJK/kana/hangul render via
   `localIdeographFontFamily`, Latin/Cyrillic/Greek via demotiles glyphs, but Arabic/Devanagari/etc.
   are tofu on canvas so those show ONLY in the InfoCard until glyphs are self-hosted. The
   **pronounce** button (`SpeakButton`) is political-only (country/territory/city); physical features
   show the written endonym but no speaker (`NO_SPEAKER` in `InfoCard.tsx`).

8. **Cities & inland water.** Capitals = red stars; cities >1M = dots (red if an admin-1 capital,
   else dark). Inland water draws ON TOP of land (NE country polygons don't cut lake holes, else
   lakes get buried). Within `inlandWaterLayers`, lakes draw FIRST then rivers on top — NE "Lake
   Centerline" features trace a river THROUGH a lake, so rivers-over-lakes keeps that connector
   visible (one continuous course, not two lines flanking a lake).

9. **Typography, themes & label priority.** `typography.ts` defines tokens by class (WATER
   ocean>sea>river>lake; POLITICAL country>subdivision; PHYSICAL range>peak; CITY capital>major) —
   same class, same font/case/color/halo. Country & subdivision labels scale off per-feature `EXTENT`
   (cos-lat span) so big units label bigger. Tier-4 scattered territories get NO country label (bbox
   spans oceans). `themes.ts` maps toggle→layer ids; `LayerPanel.tsx` renders chips;
   `mapStore.hiddenThemes` + an effect apply visibility. The political base is always on (not a theme).
   **Collision priority = style array order, LATER layer wins** (MapLibre hides earlier symbols that
   top layers overlap). The stack ends `…subdivisionLabels → cityLayers → waterLabelLayers →
   orographyLayers (peak, then range LAST)` so an opt-in range/peak name isn't suppressed by the z5+
   province/city/lake flood (the bug where the Appalachian label, sitting between "Virginia"/"West
   Virginia", never showed). Within orography `rangeLabel` is after `peakLabel` (a range wins over its
   own summits); a range's point is curatable via `RANGE_LABEL_POS` (the Appalachian NE centroid lands
   in the NY Finger Lakes — pinned to the VA/WV spine). **Lake labels gate on `EXTENT`, not NE
   `scalerank`** (0 for ~75% of lakes): `lakeSizeAt` yields size 0 (hidden) until `coef·EXTENT` clears
   a floor, so at continent zoom only giants label and tiny Ayakkum Hu (EXTENT 0.45) appears ~z6.5+.
   `buildLakeLabels` computes `EXTENT` and sorts by it. Trade-off: famous-but-tiny lakes (Dead Sea)
   also label late.

10. **Orography.** From NE `geography_regions_polys` (`Range/mtn` → 129 ranges) +
    `geography_regions_elevation_points` (76 peaks). Ranges get a soft hypsometric tint
    (`range-fill`/`-outline`, ramped by `max_elev` — peaks-in-polygon join + curated `RANGE_MAX_ELEV`
    fallback), deliberately soft (NE polys are generalized). Peaks show `▲ Name` + elevation past z7.
    "Mountains" theme. `regions-raw.geojson` also holds deserts/plateaus/isthmuses — future themes.

11. **Rivers.** `river-casing` (pale, wide) under `river-line` (saturated blue) keeps rivers visible
    over blue-ish fills; the `river-flow` overlay's dasharray is stepped ~90 ms in `MapContainer.tsx`
    (RAF) for downstream motion. Names render along the line (`symbol-placement:line`; needs
    `generateId:true` or `queryRenderedFeatures` throws). **Flow direction is real** — the dash
    follows stored coordinate order; NE digitizes most source→mouth but many parts ship backwards.
    `processRivers`/`orientRiverParts` (read `rivers-raw.geojson`, write `rivers.geojson`) fix them:
    - **Per part, grouped by name.** Parts across all a river's NE features are pooled, endpoints
      distance-clustered (~2 km — NE's duplicate digitizations sit up to ~500 m apart, so exact
      matching disconnects them), and each connected COMPONENT is oriented toward its own mouth-ward
      terminus (the Volga is 16 parts in two chains → both flow to the Caspian). Per-part (not
      per-feature) is essential: features are internally mixed, so a whole-feature flip breaks the
      correct parts (a river that "converges" mid-course).
    - **Mouth = nearest sea, or explicit hint.** `RIVER_REVERSE` maps a name → explicit mouth
      `[lon,lat]` or `null` (nearest ocean, via `ocean-50m-raw.geojson`). The hint is needed for
      interior rivers whose SOURCE is nearer a coast than their mouth (the Ohio rises at Pittsburgh,
      304 km from the Atlantic, but drains to Cairo IL; the Missouri's Montana head reads closer to
      sea than St. Louis) — else "nearest ocean" picks the source and inverts the river.
    - **Guards.** AUTO-flip only when the whole river is decisively backwards toward a coastal (<60 km)
      mouth; curated names trusted per part. Leaves alone rivers draining *away* from their nearest
      ocean (Andes-sourced Amazon tributaries, the Niger bend).

## Conventions & gotchas
- **Regenerate after data changes:** edit `process-countries.mjs` → run it.
- **Map handlers don't hot-reload** — `setupInteractions` runs once on load; test dblclick/map-setup
  changes with a **full page reload**.
- **Preview cold-loads slowly** (~35 MB+ GeoJSON + remote glyph fetch; 30–60 s, sometimes more) and
  the screenshot tool sometimes reverts to a tiny viewport — prefer `window.__map`
  `getBounds()`/`queryRenderedFeatures`/DOM checks over screenshots, and poll `isStyleLoaded()` +
  a non-empty `queryRenderedFeatures` before asserting.
- **Antimeridian:** `countryBbox`, `geomToSvg`, `unionBoxes` handle the 180° wrap (Russia, US/Alaska,
  Fiji, NZ). Check the lon sign when adding `clip` bboxes near the dateline.
- **Two color tables must match:** `colors.ts` and `COUNTRY_COLORS`.
- **A code can be a territory's yet look like a parent's** — Clipperton is NE `ISO_A2="FR"` but isn't
  France; territory logic must check no *sovereign* already claims the code.

## Common tasks
- Rename a country → `NAME_OVERRIDES` (+ `NATIVE_*`), re-run.
- Add an overseas territory → `INSET_COUNTRIES`; if a new parent also add `DEFAULT_FOCUS`,
  `HOME_LABEL`, `HOME_DESC`, `PARENT_LABEL` (`InsetPanel.tsx`); re-run; **hard-reload**.
- Dissolve subdivisions → on by default; add `DISSOLVE_CONFIG` only if NE admin-1 is too granular.
- Recolor → `colors.ts` AND the build-script mirror.
- New toggleable theme → register ids in `themes.ts`, build layers from `typography.ts` tokens, insert
  into the `MapContainer.tsx` stack at the right position.
- River source/mouth or lake area/depth/salinity → curated `RIVER_INFO`/`LAKE_INFO` (keyed by NE
  `name`); `interactions.ts` reads flattened props, `InfoCard.tsx` renders. `enrichLakes` computes
  global **top-10 ranks** by area & max depth (`area_rank`/`depth_rank`; Caspian excluded as a sea) →
  `RankMedal` gold/silver/bronze/slate badge.
- Endonym for river/lake/range/peak → `{RIVER,LAKE,RANGE,PEAK}_NATIVE` (keyed by NE `name`/`NAME`;
  `{col:'zh'}` reads an NE column, `{native,lang}` is a literal — required for rivers), re-run,
  **hard-reload**. Capitals auto via `NATIVE_LANG_COLUMN`; fix artifacts (東京都→東京) in `CAPITAL_NATIVE`.
- Fix a range display name → `normalizeRangeName` expands abbreviations (MTS./RA./CORD./S.) and
  Title-Cases; it never adds/strips the generic suffix (adjectival names keep it — Carpathian/Rocky
  Mountains; standalone nouns bare — Alps/Andes/Pyrenees). Exonyms/typos → `RANGE_NAME_OVERRIDES` (raw
  `NAME`). Reposition a badly-placed range label → `RANGE_LABEL_POS`.
- Fix a river's flow / mid-course divergence → add to `RIVER_REVERSE` (explicit mouth `[lon,lat]`, or
  `null` for nearest-ocean).
- Fill a river NE drops at an estuary (St. Lawrence below Montreal) → downstream-ordered centerline in
  `RIVER_ADD` (appended before orientation; also add the name to `RIVER_REVERSE` to pin direction).
- Unify a name-changing river (Lancang→Mekong; Maquan→Yarlung→Dihang→Brahmaputra) → `RIVER_SYSTEM`
  (members = NE reach names, source→mouth, + `note`). Map keeps the LOCAL labels; `applyRiverSystem`
  flattens `system_name/members/note` so a click reports the whole system and
  `setFeatureHighlight('river', members)` lights every reach.
- Add a water body NE omits (Sea of Azov, Gulf of Martaban, Delaware Bay) → `SEA_ADD` with a
  **generous, sloppy `ring`** (covers the water + spills onto land) and a `labelAt` point. `enrichSeas`
  **subtracts the 10m coastline** (`polygon-clipping` difference) so the boundary snaps to the real
  coast and only the seaward mouth stays drawn; it drops slivers (<5% of the largest piece),
  idempotent via `curated:true`. Without a polygon a click falls through to the ocean (wrong nearest
  `ocean-labels` name — the Azov reported "Arctic Ocean"). Smallest overlapping sea wins a click.
  Tighten a too-wide mouth by pulling water-side vertices toward the real entrance. The **`/add-bay`
  skill** (`.Codex/commands/`) automates this end to end.
- Restyle click-selection → water bodies, ranges, seas, oceans are ALL clickable; `interactions.ts`
  resolves by a priority list, `setFeatureHighlight(kind,name)` (`mapRegistry.ts`) name-filters the
  gold glow (`{sea,lake,river}-highlight[-glow]`, `range-highlight-*`). Seas use an invisible `sea-hit`
  fill, rivers a fat `river-hit` line, oceans are named by nearest `ocean-labels`. A selected river
  keeps its flow via `river-highlight-flow` (stepped by the same RAF loop).

## Future phases (decided order)
1. **Markdown content pipeline**: `content/` dir, one .md/feature (frontmatter id/type/coords/tier;
   body = the story + sources) + build-time index → cards/side panel. Where long-form curation goes.
2. **Rivers curation**: tier table (civilization → notable/underrated like Volga/Murray) with story
   cards — display/animation/labels already built (decision 11).
3. **Orography curation**: top-3 peaks/continent + national peaks with a good story; then
   straits/isthmuses, deserts, landmarks (deserts/isthmuses geometry already in `regions-raw.geojson`).
4. Later: historical-borders timeline; language-geography choropleths.

## Commands
- `npm run dev` · `node scripts/process-countries.mjs` (regenerate) · `bash scripts/download-geodata.sh`
  (re-fetch raws only if `data/raw/` is missing) · `npx tsc --noEmit` (typecheck).
