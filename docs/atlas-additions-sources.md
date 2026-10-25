# Atlas additions — October 2026

Membership, coordinates, facts, and editorial notes are curated in `scripts/process-countries.mjs`; generated map files and catalog use that source.

## Mountains

- The Five Yue are Mount Tai (east), Mount Hua (west), Mount Heng in Hunan (south), Mount Heng in Shanxi (north), and Mount Song (center). Their significance is ritual and cultural, not a height ranking. [Berkshire Encyclopedia](https://www.berkshirepublishing.com/ecph-china/2018/01/04/five-great-mountains/), [UNESCO: Mount Taishan](https://whc.unesco.org/en/list/437/).
- Mount Song is represented by Liantian Feng (1,512 m), the massif’s highest summit, rather than Junji Feng (1,491.7 m). [Summit coordinates](https://en.wikipedia.org/wiki/Mount_Song), [Peakbagger](https://www.peakbagger.com/peak.aspx?pid=24751). Hunan Heng is represented by Zhurong Feng (1,300.2 m).
- Mount McKinley (Denali), 6,190 m: [USGS survey](https://www.usgs.gov/news/national-news-release/new-elevation-nations-highest-peak), [federal naming history](https://www.govinfo.gov/features/denali-national-park). Both names remain visible and searchable.
- Whitney, Rainier, Elbert, and Elbrus: approximate summit coordinates, with elevations rounded to metres. [USGS US elevations reference](https://pubs.usgs.gov/gip/Elevations-Distances/elvadist.html), [NPS Rainier](https://www.nps.gov/mora/index.htm), [Elbrus reference](https://www.wikidata.org/wiki/Q43105). Historical vertical datums can differ by several metres.
- Mont Blanc: the displayed 4,805.59 m is explicitly the September 2023 snow-cap survey, not a claim of a fixed or current height. Its Franco-Italian border treatment lists both countries and explains the disputed sector. [Survey series](https://geologie-montblanc.fr/montBlanc.htm).
- Dolomites → Alps, Italy. The generalized curated footprint is clipped to Italy and is not the UNESCO property boundary. [UNESCO](https://whc.unesco.org/en/list/1237/).
- Bismarck Range → New Guinea Highlands, Papua New Guinea. The generalized footprint includes Mount Wilhelm and stays on the mainland, separate from the Bismarck Archipelago. [Van Royen, The Alpine Flora of New Guinea](https://www.papuaerfgoed.org/sites/default/files/collectie/files/2006-03/vanRoyen_1980_Alpine.pdf).

## Water

- Seine: Natural Earth linework, oriented downstream toward the English Channel near Le Havre; 777 km reference length; source at Source-Seine in Burgundy; France only. [Seine reference](https://www.wikidata.org/wiki/Q1471), [UNESCO: Paris, Banks of the Seine](https://whc.unesco.org/en/list/600/).
- Palk Strait → Bay of Bengal → Indian Ocean. The mask represents the northern strait, not all of Palk Bay or the Gulf of Mannar. Land and islands are subtracted using the cached 10m coastline. [India–Sri Lanka maritime agreements](https://www.un.org/depts/los/LEGISLATIONANDTREATIES/PDFFILES/publications/E.87.V.12.pdf).
- Türkmenbaşy Gulf (Krasnovodsk Bay) → Caspian Sea → no ocean outlet. The gulf is distinct from the broader Ramsar wetland designation. [Caspian Sea Encyclopedia](https://tehranconvention.org/system/files/tcis/caspian-sea-encyclopediapdf.pdf), [Ramsar description](https://www.ramsar.org/news/turkmenistan-becomes-159th-contracting-party).
- Sea of Azov: replaced the diagonal southeastern mask edge with an inland envelope, preserving the detailed eastern shoreline and Taganrog Bay. Kerch Strait remains a separate sibling under the Black Sea. [Taganrog geography](https://journals.rcsi.science/1573-160X/article/view/270786).

## Verification

Geometry checks cover membership, positive elevations and descending ordering, Five Yue endonyms, range-country containment and defining summits, marine label placement and land overlap, selection-parent containment, inland Caspian association, eastern Azov coverage and Kerch separation, and Seine downstream orientation. Browser/computer-use validation was excluded at the owner’s request.
