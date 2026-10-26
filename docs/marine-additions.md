# Added marine waters

These 11 additions bring the marine table to 126 names. Shelikhov Gulf is restored from the former exclusion, under its familiar English spelling; the old “Shelikhova Gulf” spelling does not create another entry.

| Water | Immediate parent | Geometry reference |
| --- | --- | --- |
| Alboran Sea | Mediterranean Sea | Natural Earth 10m marine polygons |
| Ligurian Sea | Mediterranean Sea | Natural Earth 10m marine polygons, historic Cape Corse–La Spezia extent |
| Cantabrian Sea | Bay of Biscay | Curated southern coastal portion, Estaca de Bares eastward; generalized offshore limit |
| Kattegat | Baltic Sea | Curated Kattegat proper; Danish straits excluded |
| Skagerrak | North Sea | Natural Earth 10m marine polygons |
| Gulf of Ob | Kara Sea | Natural Earth 10m marine polygons |
| Khatanga Gulf | Laptev Sea | Natural Earth 10m marine polygons |
| Strait of Tartary | Sea of Japan | Curated Cape Belkina–Cape Kuznetsova mouth through Nevelskoy Strait to the Amur liman |
| Shelikhov Gulf | Sea of Okhotsk | Restored Natural Earth marine polygon |
| Penzhina Bay | Shelikhov Gulf | Curated Cape Taygonos–Cape Bozhedomova mouth, including the northern head |
| Academy Bay | Sea of Okhotsk | Curated Seneka Point–Cape Wrangel entrance; includes its three coastal branches |

The retained Natural Earth subset is in `data/marine-additions.geojson`. Membership, names, hierarchy and curated rings remain in `scripts/process-countries.mjs`. All shapes use the detailed land coastline. Offshore limits are atlas conventions, not maritime legal boundaries.

References:

- [Natural Earth marine polygons](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_10m_geography_marine_polys.geojson)
- [NOAA Tatarskiy Proliv definition](https://www.ncei.noaa.gov/archive/archive-management-system/OAS/bin/prd/jquery/seaname/details/25)
- [NOAA Kattegat definition](https://www.ncei.noaa.gov/archive/archive-management-system/OAS/bin/prd/jquery/seaname/details/79), with the historic Skagen–Pater Noster northern boundary shared with the source Skagerrak polygon
- [Swedish marine environment: Skagerrak](https://www.sverigesvattenmiljo.se/undersoka-vattenmiljo/skagerrak)
- [Turismo de Galicia: Estaca de Bares](https://blog.turismo.gal/?p=8769)
- [Penzhina Bay](https://en.wikipedia.org/wiki/Penzhina_Bay)
- [Academy Bay, Sea of Okhotsk](https://en.wikipedia.org/wiki/Academy_Bay_(Sea_of_Okhotsk)) and [Seneka Point](https://en.wikipedia.org/wiki/Seneka_Point)


## Atlantic–Mediterranean selection structure

A subsequent owner-requested update adds six waters, bringing the marine table
to 132 names. Existing learned waters outside this branch remain in the atlas.

```text
Atlantic Ocean
├── Gulf of Cádiz
├── Strait of Gibraltar
└── Mediterranean Sea
    ├── Alboran Sea
    ├── Aegean Sea
    │   └── Sea of Crete
    ├── Dardanelles
    ├── Sea of Marmara
    ├── Bosporus
    └── Black Sea
        ├── Kerch Strait
        └── Sea of Azov
```

Sea of Crete, Dardanelles, Sea of Marmara and Bosporus use the retained Natural
Earth marine subset. Gulf of Cádiz and Kerch Strait use curated coastal masks
clipped to the detailed land outline. Gulf of Cádiz uses a generalized Cape
St Vincent–Cape Trafalgar offshore line; Kerch uses the Takil–Panagia southern
entrance. These are atlas selection extents.

- [NOAA: Black Sea connections](https://www.ncei.noaa.gov/archive/archive-management-system/OAS/bin/prd/jquery/seaname/details/10)
- [Marine Regions: Kerch Strait](https://marineregions.org/gazetteer.php?id=3737&p=details)
- [Crete geography](https://www.discovercrete.com/content/the-geography-of-crete)


## Separate Strait of Gibraltar footprint

Gibraltar now has one complete coastline-clipped polygon, replacing the small
source fragments. Its west entrance is Trafalgar–Spartel; its east entrance is
Europa Point–Almina Point. The strait is removed from the Gulf of Cádiz, Alboran
Sea and Mediterranean selection geometry, while remaining directly under the
Atlantic Ocean. The table retains the same 132 names and shows Atlantic Ocean
as its immediate parent.

Reference: [NOAA Strait of Gibraltar limits](https://www.ncei.noaa.gov/archive/archive-management-system/OAS/bin/prd/jquery/seaname/details/4).


Sea of Azov and Kerch Strait are direct siblings under Black Sea. Kerch owns
its complete strait footprint; that same footprint is subtracted from Azov.
Their click surfaces and selection highlights do not overlap, and the Black Sea
selection includes both.

## Palk and Türkmenbaşy shoreline corrections

Palk Strait uses the conventional combined Palk Strait/Palk Bay cartographic
footprint, bounded by Point Calimere–Point Pedro and Adam’s Bridge, following
[NOAA’s definition](https://www.ncei.noaa.gov/archive/archive-management-system/OAS/bin/prd/jquery/seaname/details/118).
The oversized offshore box is removed; the same object remains under Bay of Bengal.

Türkmenbaşy Gulf closes between the mapped spit tips at its entrance, rather
than the previous offshore zigzag. Only the connected inner bay is retained;
open Caspian water outside the northern spit is excluded. The gulf remains under
Caspian Sea with no ocean outlet. Both shapes are clipped to the detailed land
outline; island holes are retained. See [Ramsar’s bay description](https://rsis.ramsar.org/ris/1855).


## Gujarat gulfs

Gulf of Khambhat (Cambay) and Gulf of Kutch are individual children of Arabian Sea, within Indian Ocean. Khambhat is newly curated; Kutch replaces the generalized source outline with the detailed Indian coastline. Both use a coastline arc with one straight seaward entrance closure, retaining islands as land holes. Khambhat uses the Gopnath–Daman entrance convention; these are editorial map limits, not legal boundaries. Reference: [NCCR Gulf of Khambhat profile](https://nccr.gov.in/sites/default/files/GulfofKhambhat.PDF). Generated map, labels, selections and catalog share this hierarchy.


### Gulf coastline rendering at overview zoom

Gulf of Kutch and Gulf of Khambhat have zero area overlap with the generated 10m India land polygon, but against 50m land the overlaps were 0.0284 and 0.0447 square degrees respectively (larger at 110m). Their water masks were correct against the detailed source; the overview land tier was not aligned. India now carries `COAST_DETAIL` from the curation pipeline. Its fill, border, click target, glow and selection use the 10m source from z3, when marine boundaries begin; other countries retain their usual tier thresholds. Country and marine sources preserve shoreline vertices with `tolerance: 0`. No gulf membership or table changes. Regression checks cover both countries across every transition and selection filters.

### Shared Gujarat basin entrances

The overview-resolution change did not fix the two separate entrance geometries visible in the owner's screenshot: Arabian Sea retained its old Kutch closing line and excluded a coastal wedge seaward of Khambhat. `enrichSeas` now unions a land-clipped Gujarat coastal repair into Arabian Sea, then subtracts the two gulf interiors. This makes the base hit polygons share exact entrance edges; the dissolved parent selection follows the coast and has no residual offshore entrance line in either locality. Both names and the catalog hierarchy are unchanged. Regression samples cover the formerly bare wedge and Kutch sliver; independent boundary/land checks find zero offshore parent-boundary length around both entrances.

## Black Sea coastal additions and Turkish entrance repairs

Seven additions bring the marine catalog to 142 names. “Karknit” is normalized to
**Karkinit Bay**; **Gulf of Odessa** retains the owner's requested spelling (also
known as Gulf of Odesa).

| Water | Immediate parent | Editorial reason and geometry |
| --- | --- | --- |
| Taman Bay | Kerch Strait | Shallow bay between Chushka and Tuzla spits; detailed coastal arc, straight entrance closure |
| Dnieper-Bug Estuary | Black Sea | Shared Dnieper/Southern Bug liman, including both arms; coastal mask closes beside Kinburn Spit |
| Burgas Bay | Black Sea | Bulgaria's port embayment; detailed coastal arc between Cape Emine and the Sozopol headland |
| Gulf of Odessa | Black Sea | City and port frontage; detailed coastal arc between northern Odesa and the Velykyi Fontan headland |
| Karkinit Bay | Black Sea | Mainland–Crimea embayment and wetlands; generalized offshore entrance toward Cape Tarkhankut |
| Kalamita Bay | Black Sea | Western Crimean embayment south of Yevpatoria; generalized Yevpatoria–Lukull entrance |
| Taganrog Bay | Sea of Azov | Don estuary and lower-Don maritime approach; Bilosaraiska–Dolgaya spit entrance |

All additions subtract the cached 10m land, retain the connected label-bearing
water, and carry a short sourced story into the catalog. Boundaries are atlas
conventions, not legal maritime limits. Crimea's status is described objectively
in the stories without changing the map's political policy.

The Aegean–Dardanelles and Marmara–Bosporus entrances now use land-clipped repair
patches in the adjacent basin, cut by the fitted strait geometry. The same edge
therefore closes both shapes; no extra water or gap is left between them. The
existing Mediterranean sibling hierarchy is preserved. Ukraine, Russia, Bulgaria
and Turkey join India in using detailed coast geometry from the marine-boundary
zoom so overview country fills, borders and selections agree with these waters.

References (also linked per feature in the catalog):

- [CBD scientific description of Taman Bay](https://www.cbd.int/doc/meetings/mar/ebsaws-2017-01/templates/ebsaws-2017-01-template-03-TamanBay-en.pdf)
- [Dnieper–Bug estuary](https://discover.ua/en/en/locations/dniprovsko-buzkij-liman)
- [Burgas Bay research site](https://deims.org/locations/929232ff-72b4-4671-8649-79950504f33d)
- [Gulf of Odesa](https://en.wikipedia.org/wiki/Gulf_of_Odesa)
- [Ramsar: Karkinitska and Dzharylgatska Bays](https://rsis.ramsar.org/ris/114)
- [Encyclopedia of Modern Ukraine: Kalamita Bay](https://esu.com.ua/article-10364)
- [Taganrog Bay](https://en.wikipedia.org/wiki/Taganrog_Bay)
