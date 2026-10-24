# Marine coastline audit

All 132 named marine waters were reviewed: 131 coastal names plus the inland Caspian Sea. The source has 133 components because the Great Barrier Reef has two features.

The build matches generalized coastal segments to the detailed 10m land geometry, follows the intervening coastline vertices, and subtracts land and islands. Existing curated bays retain their clipped footprints. Offshore limits remain straight; parent selections include their descendants. A shared six-decimal precision grid and polygon normalization remove numerical slivers and collapsed rings.

Matched 29,559 coastal segments. Independent GEOS verification passes for all 133 components and all 137 selection geometries, including parent/child containment. Remaining land overlaps are below 0.00001 square degrees per component (numerical shoreline rounding, not a physical gap allowance).

Caspian uses its inland-lake shoreline and is checked for validity, not subtracted from the country land mask. This audit checks fit to the atlas coastline; it does not establish legal or hydrographic offshore boundaries.

## Repeat the check

Run `node scripts/process-countries.mjs`, then `python3 scripts/audit-marine-coasts.py` with Shapely installed in your Python environment. Optional `--baseline path/to/old-seas.geojson` records the prior land overlap. The checker exits nonzero for invalid shapes, substantial land overlap, or gaps in parent selections.

The machine-readable results are in `marine-coast-audit.json` and `marine-coast-verification.json`.

| Water | Coastal segments matched | Verification |
| --- | ---: | --- |
| Academy Bay | 0 | Pass; existing clipped shoreline |
| Adriatic Sea | 220 | Pass |
| Aegean Sea | 398 | Pass |
| Alboran Sea | 61 | Pass |
| Amazon River | 84 | Pass |
| Andaman Sea | 662 | Pass |
| Arabian Sea | 248 | Pass |
| Arafura Sea | 327 | Pass |
| Baffin Bay | 429 | Pass |
| Bahía de Campeche | 71 | Pass |
| Balearic Sea | 93 | Pass |
| Baltic Sea | 286 | Pass |
| Banda Sea | 522 | Pass |
| Barents Sea | 954 | Pass |
| Bay of Bengal | 362 | Pass |
| Bay of Biscay | 126 | Pass |
| Bay of Fundy | 84 | Pass |
| Bay of Plenty | 25 | Pass |
| Beaufort Sea | 251 | Pass |
| Bering Sea | 801 | Pass |
| Bismarck Sea | 168 | Pass |
| Black Sea | 239 | Pass |
| Bo Hai | 95 | Pass |
| Bohai Bay | 0 | Pass; existing clipped shoreline |
| Bosporus | 9 | Pass |
| Bristol Bay | 136 | Pass |
| Bristol Channel | 52 | Pass |
| Cantabrian Sea | 0 | Pass; existing clipped shoreline |
| Cape Cod Bay | 0 | Pass; existing clipped shoreline |
| Caribbean Sea | 856 | Pass |
| Caspian Sea | 0 | Valid inland shoreline |
| Celebes Sea | 235 | Pass |
| Ceram Sea | 157 | Pass |
| Chesapeake Bay | 192 | Pass |
| Chukchi Sea | 256 | Pass |
| Columbia River | 20 | Pass |
| Cook Inlet | 128 | Pass |
| Coral Sea | 526 | Pass |
| Dardanelles | 9 | Pass |
| Davis Strait | 531 | Pass |
| Delaware Bay | 0 | Pass; existing clipped shoreline |
| Drake Passage | 21 | Pass |
| East China Sea | 261 | Pass |
| East Siberian Sea | 0 | Pass; existing clipped shoreline |
| English Channel | 133 | Pass |
| Golfo de California | 240 | Pass |
| Golfo de Panamá | 62 | Pass |
| Great Australian Bight | 207 | Pass |
| Great Barrier Reef | 158 | Pass |
| Greenland Sea | 928 | Pass |
| Gulf of Aden | 104 | Pass |
| Gulf of Alaska | 580 | Pass |
| Gulf of Bangkok | 0 | Pass; existing clipped shoreline |
| Gulf of Bothnia | 317 | Pass |
| Gulf of Carpentaria | 141 | Pass |
| Gulf of Cádiz | 0 | Pass; existing clipped shoreline |
| Gulf of Finland | 101 | Pass |
| Gulf of Guinea | 139 | Pass |
| Gulf of Honduras | 28 | Pass |
| Gulf of Kutch | 32 | Pass |
| Gulf of Maine | 100 | Pass |
| Gulf of Mannar | 32 | Pass |
| Gulf of Martaban | 0 | Pass; existing clipped shoreline |
| Gulf of Mexico | 431 | Pass |
| Gulf of Ob | 183 | Pass |
| Gulf of Oman | 58 | Pass |
| Gulf of Saint Lawrence | 427 | Pass |
| Gulf of Thailand | 161 | Pass |
| Gulf of Tomini | 0 | Pass; existing clipped shoreline |
| Gulf of Tonkin | 121 | Pass |
| Hangzhou Bay | 0 | Pass; existing clipped shoreline |
| Hudson Bay | 0 | Pass; existing clipped shoreline |
| Hudson Strait | 320 | Pass |
| Inner Sea | 135 | Pass |
| Inner Seas | 293 | Pass |
| Ionian Sea | 209 | Pass |
| Irish Sea | 173 | Pass |
| James Bay | 0 | Pass; existing clipped shoreline |
| Java Sea | 282 | Pass |
| Kara Sea | 757 | Pass |
| Kattegat | 0 | Pass; existing clipped shoreline |
| Kerch Strait | 0 | Pass; existing clipped shoreline |
| Khatanga Gulf | 81 | Pass |
| Korea Strait | 137 | Pass |
| Kotzebue Sound | 0 | Pass; existing clipped shoreline |
| Labrador Sea | 447 | Pass |
| Laccadive Sea | 48 | Pass |
| Laizhou Bay | 0 | Pass; existing clipped shoreline |
| Laptev Sea | 404 | Pass |
| Liaodong Bay | 0 | Pass; existing clipped shoreline |
| Ligurian Sea | 10 | Pass |
| Long Island Sound | 0 | Pass; existing clipped shoreline |
| Luzon Strait | 3 | Pass |
| Makassar Strait | 165 | Pass |
| Mediterranean Sea | 585 | Pass |
| Molucca Sea | 147 | Pass |
| Mozambique Channel | 374 | Pass |
| North Sea | 384 | Pass |
| Norton Sound | 0 | Pass; existing clipped shoreline |
| Norwegian Sea | 567 | Pass |
| Penzhina Bay | 0 | Pass; existing clipped shoreline |
| Persian Gulf | 269 | Pass |
| Philippine Sea | 437 | Pass |
| Red Sea | 261 | Pass |
| Ross Sea | 467 | Pass |
| Río de la Plata | 61 | Pass |
| Sargasso Sea | 0 | Pass; offshore only |
| Scotia Sea | 4 | Pass |
| Sea of Azov | 0 | Pass; existing clipped shoreline |
| Sea of Crete | 150 | Pass |
| Sea of Japan | 392 | Pass |
| Sea of Marmara | 54 | Pass |
| Sea of Okhotsk | 443 | Pass |
| Shelikhov Gulf | 152 | Pass |
| Skagerrak | 68 | Pass |
| Solomon Sea | 446 | Pass |
| South China Sea | 880 | Pass |
| Strait of Gibraltar | 23 | Pass |
| Strait of Malacca | 205 | Pass |
| Strait of Singapore | 44 | Pass |
| Strait of Tartary | 0 | Pass; existing clipped shoreline |
| Straits of Florida | 36 | Pass |
| Sulu Sea | 256 | Pass |
| Taiwan Strait | 48 | Pass |
| Tasman Sea | 474 | Pass |
| The North Western Passages | 2,846 | Pass |
| Timor Sea | 154 | Pass |
| Tyrrhenian Sea | 177 | Pass |
| Weddell Sea | 619 | Pass |
| White Sea | 191 | Pass |
| Yangtze River | 40 | Pass |
| Yellow Sea | 263 | Pass |
