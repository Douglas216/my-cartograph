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
