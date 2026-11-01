import { boundaries, fingerprint, editGeometry } from './lib/marine-editor.mjs';
import { coastlineIndex, refitMarineCoast } from './lib/marine-coast.mjs';
// Processes Natural Earth country data into the app's display model.
//
// Color policy ("UN members + observers + majority-recognition"):
//  - UN member states, Palestine, the Holy See, and Kosovo keep their own color
//  - Disputed entities are colored as their UN-recognized parent:
//      Taiwan -> China, N. Cyprus -> Cyprus, Somaliland -> Somalia, W. Sahara -> Morocco
//  - Dependencies, leases, and overseas territories inherit their sovereign's color
//  - Terra nullius / buffer zones / Antarctica stay neutral gray (no MAPCOLOR13)
// Each special case gets a STATUS_NOTE shown on its info card.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import polygonClipping from 'polygon-clipping';
import { gzipSync } from 'node:zlib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GEO_DIR = path.join(__dirname, '..', 'public', 'geo');
// Raw Natural Earth downloads live here as a local cache (not served/built),
// so the pipeline can re-run without re-downloading.
const RAW_DIR = path.join(__dirname, '..', 'data', 'raw');

// Personal atlas membership: edit these readable lists as you learn new places.
// Names here are the processed Natural Earth names; aliases preserve local reaches.
// Personal marine membership. Removing a name hides its labels, hit target and
// catalog row; its water still belongs to the containing ocean/sea's full extent.
const PERSONAL_MARINE_EXCLUDED = new Set([
  'Amundsen Gulf', 'Amundsen Sea', 'Bellingshausen Sea',
  'Viscount Melville Sound', 'Ungava Bay', 'Melville Bay', 'Golfo San Jorge',
]);
const MARINE_OCEAN_GROUPS = {
    'Atlantic Ocean': ['Gulf of Taranto','Gulf of Saint-Malo','Bight of Benin','Bight of Bonny','Corisco Bay','Taman Bay','Dnieper-Bug Estuary','Burgas Bay','Gulf of Odessa','Karkinit Bay','Kalamita Bay','Taganrog Bay', 'Gulf of Cádiz', 'Sea of Crete', 'Dardanelles', 'Sea of Marmara', 'Bosporus', 'Kerch Strait', 'Alboran Sea', 'Ligurian Sea', 'Cantabrian Sea', 'Kattegat', 'Skagerrak', 'Black Sea', 'Caribbean Sea', 'Gulf of Mexico', 'Labrador Sea', 'Hudson Bay', 'Mediterranean Sea', 'Norwegian Sea', 'Bay of Biscay', 'Gulf of Guinea', 'Baltic Sea', 'North Sea', 'Irish Sea', 'Bahía de Campeche', 'Davis Strait', 'Sargasso Sea', 'Tyrrhenian Sea', 'James Bay', 'Hudson Strait', 'English Channel', 'Gulf of Honduras', 'Gulf of Bothnia', 'Adriatic Sea', 'Bristol Channel', 'Inner Seas', 'Gulf of Finland', 'Gulf of Lion', 'Straits of Florida', 'Ionian Sea', 'Gulf of Saint Lawrence', 'Bay of Fundy', 'Río de la Plata', 'Melville Bay', 'Gulf of Maine', 'Chesapeake Bay', 'Long Island Sound', 'Cape Cod Bay', 'Golfo San Jorge', 'Amazon River', 'Aegean Sea', 'Balearic Sea', 'Strait of Gibraltar', 'Ungava Bay', 'Sea of Azov', 'Delaware Bay'],
    'Pacific Ocean': ['Strait of Tartary', 'Shelikhov Gulf', 'Penzhina Bay', 'Academy Bay', 'Gulf of Bangkok', 'Laizhou Bay', 'Bohai Bay', 'Liaodong Bay', 'Hangzhou Bay', 'Bo Hai', 'Philippine Sea', 'Tasman Sea', 'South China Sea', 'Gulf of Alaska', 'Sea of Okhotsk', 'Coral Sea', 'Sea of Japan', 'Celebes Sea', 'Sulu Sea', 'Banda Sea', 'Luzon Strait', 'Java Sea', 'Yellow Sea', 'East China Sea', 'Bering Sea', 'Gulf of Thailand', 'Golfo de California', 'Great Barrier Reef', 'Bay of Plenty', 'Molucca Sea', 'Bismarck Sea', 'Solomon Sea', 'Gulf of Tonkin', 'Makassar Strait', 'Ceram Sea', 'Inner Sea', 'Taiwan Strait', 'Cook Inlet', 'Bristol Bay', 'Gulf of Tomini', 'Golfo de Panamá', 'Korea Strait', 'Shelikhova Gulf', 'Columbia River', 'Yangtze River', 'Norton Sound'],
    'Indian Ocean': ['Gulf of Suez','Gulf of Aqaba','Palk Strait', 'Bay of Bengal', 'Arabian Sea', 'Red Sea', 'Persian Gulf', 'Mozambique Channel', 'Andaman Sea', 'Arafura Sea', 'Timor Sea', 'Laccadive Sea', 'Great Australian Bight', 'Gulf of Aden', 'Gulf of Oman', 'Gulf of Carpentaria', 'Strait of Malacca', 'Strait of Singapore', 'Gulf of Khambhat', 'Gulf of Kutch', 'Gulf of Mannar', 'Gulf of Martaban'],
    'Arctic Ocean': ['Gulf of Ob', 'Khatanga Gulf', 'Beaufort Sea', 'Baffin Bay', 'Greenland Sea', 'Barents Sea', 'Chukchi Sea', 'Kara Sea', 'Laptev Sea', 'White Sea', 'The North Western Passages', 'Viscount Melville Sound', 'East Siberian Sea', 'Amundsen Gulf', 'Kotzebue Sound'],
    'Southern Ocean': ['Weddell Sea', 'Ross Sea', 'Bellingshausen Sea', 'Amundsen Sea'],
    'Atlantic / Southern oceans': ['Scotia Sea'],
    'Atlantic / Pacific / Southern oceans': ['Drake Passage'],
    'Inland basin · no ocean outlet': ['Caspian Sea', 'Türkmenbaşy Gulf'],
  };

// Curated selection parents, including owner-defined groups of connected basins.
// Connections never expand into another ocean by default. Declaring a hierarchy
// does not add new geometry; new waters also need a source polygon.
const MARINE_PARENT_OVERRIDES = {
  'Gulf of Taranto':'Ionian Sea', 'Gulf of Saint-Malo':'English Channel',
  'Bight of Benin':'Gulf of Guinea', 'Bight of Bonny':'Gulf of Guinea', 'Corisco Bay':'Gulf of Guinea',
  'Gulf of Suez':'Red Sea', 'Gulf of Aqaba':'Red Sea',
  'Taman Bay':'Kerch Strait', 'Taganrog Bay':'Sea of Azov',
  'Dnieper-Bug Estuary':'Black Sea', 'Burgas Bay':'Black Sea',
  'Gulf of Odessa':'Black Sea', 'Karkinit Bay':'Black Sea', 'Kalamita Bay':'Black Sea',
  'Gulf of Khambhat': 'Arabian Sea', 'Gulf of Kutch': 'Arabian Sea',
  'Palk Strait': 'Bay of Bengal', 'Türkmenbaşy Gulf': 'Caspian Sea',
  // Owner's basin-selection structure; the Turkish straits remain siblings.
  'Gulf of Cádiz': 'Atlantic Ocean', 'Strait of Gibraltar': 'Atlantic Ocean',
  'Mediterranean Sea': 'Atlantic Ocean', 'Sea of Crete': 'Aegean Sea',
  'Dardanelles': 'Mediterranean Sea', 'Sea of Marmara': 'Mediterranean Sea',
  'Bosporus': 'Mediterranean Sea', 'Black Sea': 'Mediterranean Sea',
  'Kerch Strait': 'Black Sea',
  'Alboran Sea': 'Mediterranean Sea', 'Ligurian Sea': 'Mediterranean Sea',
  'Cantabrian Sea': 'Bay of Biscay', 'Kattegat': 'Baltic Sea', 'Skagerrak': 'North Sea',
  'Gulf of Ob': 'Kara Sea', 'Khatanga Gulf': 'Laptev Sea',
  'Strait of Tartary': 'Sea of Japan', 'Shelikhov Gulf': 'Sea of Okhotsk',
  'Penzhina Bay': 'Shelikhov Gulf', 'Academy Bay': 'Sea of Okhotsk',
  'Gulf of Bangkok': 'Gulf of Thailand', 'Laizhou Bay': 'Bo Hai',
  'Bohai Bay': 'Bo Hai', 'Liaodong Bay': 'Bo Hai', 'Hangzhou Bay': 'East China Sea',
  'Bo Hai': 'Yellow Sea', 'Gulf of Martaban': 'Andaman Sea',
  'Sea of Azov': 'Black Sea',
  'Adriatic Sea': 'Mediterranean Sea', 'Aegean Sea': 'Mediterranean Sea',
  'Ionian Sea': 'Mediterranean Sea', 'Tyrrhenian Sea': 'Mediterranean Sea',
  'Balearic Sea': 'Mediterranean Sea', 'Gulf of Lion': 'Mediterranean Sea',
  'Gulf of Bothnia': 'Baltic Sea', 'Gulf of Finland': 'Baltic Sea',
  'James Bay': 'Hudson Bay', 'Bahía de Campeche': 'Gulf of Mexico',
  'Gulf of Tonkin': 'South China Sea', 'Gulf of Thailand': 'South China Sea',
  'Bristol Bay': 'Bering Sea', 'Norton Sound': 'Bering Sea',
  'Shelikhova Gulf': 'Sea of Okhotsk', 'Gulf of Oman': 'Arabian Sea',
  'Gulf of Mannar': 'Laccadive Sea',
  'Viscount Melville Sound': 'The North Western Passages',
};

const PERSONAL_RANGES = [
  'Dolomites', 'Bismarck Range', 'Atlas Mountains', 'Ural Mountains', 'Caucasus Mountains', 'Carpathian Mountains',
  'Alps', 'Apennines', 'Pyrenees', 'Altay Mountains', 'Tian Shan', 'Himalayas',
  'Karakoram Range', 'Western Ghats', 'Eastern Ghats', 'Great Dividing Range',
  'Southern Alps', 'Rocky Mountains', 'Appalachian Mountains', 'Sierra Nevada', 'Cascade Range', 'Andes',
];
const PERSONAL_RIVERS = {
  Yukon: ['Yukon'], Mackenzie: ['Mackenzie'], Mississippi: ['Mississippi'],
  Missouri: ['Missouri'], Ohio: ['Ohio'], Colorado: ['Colorado'], Arkansas: ['Arkansas'],
  Tennessee: ['Tennessee'], Potomac: ['Potomac', 'S. Branch Potomac'],
  'St. Lawrence': ['St. Lawrence'], Athabasca: ['Athabasca'], 'Rio Grande': ['Rio Grande'],
  Amazon: ['Amazonas'], Orinoco: ['Orinoco'], Paraná: ['Paraná'], Senegal: ['Sénégal'],
  Niger: ['Niger'], Volta: ['Volta'], Nile: ['Nile', 'Victoria Nile', 'Albert Nile', 'Bahr el Jebel'],
  'White Nile': ['El Bahr el Abyad'], 'Blue Nile': ['Abay', 'El Bahr el Azraq'],
  Congo: ['Congo', 'Lualaba'], Orange: ['Orange'], Limpopo: ['Limpopo'], Zambezi: ['Zambezi'],
  Euphrates: ['Euphrates', 'Al Furat', 'Firat'], Tigris: ['Tigris', 'Dicle'],
  Po: ['Po'], Tiber: ['Tevere'], Rhine: ['Rhine', 'Rhein', 'Rhin'], Rhône: ['Rhône'],
  Seine: ['Seine'], Loire: ['Loire'], Thames: ['Thames'], Danube: ['Danube', 'Donau'],
  Dnieper: ['Dnepre', 'Dnipro'], Volga: ['Volga'], Ural: ['Ural'], Ob: ['Ob'], Lena: ['Lena'],
  Yenisey: ['Yenisey'], Amur: ['Amur', 'Heilong Jiang'], Songhua: ['Songhua'], Yalu: ['Yalu'],
  'Yellow River': ['Huang'], Yangtze: ['Yangtze', 'Chang Jiang', 'Jinsha', 'Tongtian', 'Tuotuo'],
  'Pearl River': ['Pearl', 'Xi', 'Xun'], Tarim: ['Tarim'], 'Syr Darya': ['Syr Darya'],
  'Amu Darya': ['Amu  Darya'], Helmand: ['Helmand'], Indus: ['Indus', 'Shiquan'],
  Ganges: ['Ganges'], Brahmaputra: ['Maquan', 'Yarlung', 'Dihang', 'Brahmaputra'],
  Irrawaddy: ['Ayeyarwady', 'Irrawaddy Delta'], Mekong: ['Za', 'Lancang', 'Mekong'],
  Salween: ['Nu', 'Salween'], Murray: ['Murray'], Narmada: ['Narmada'],
  Godavari: ['Godävari'], Krishna: ['Krishna'],
};
const PERSONAL_LAKES = [
  'Gatun Lake', 'Lake Nasser', 'Lake Superior', 'Lake Michigan', 'Lake Huron', 'Lake Erie', 'Lake Ontario',
  'Great Slave Lake', 'Great Bear Lake', 'Lake Athabasca', 'Lake Winnipeg',
  'Great Salt Lake', 'Lake Tahoe', 'Lago de Nicaragua', 'Lago de Managua',
  'Lago Titicaca', 'Lake Maracaibo', 'Lake Ladoga', 'Lake Onega', 'Lake Balkhash',
  'Lake Baikal', 'Tai Hu', 'Qinghai Hu', 'Dead Sea', 'North Aral Sea', 'South Aral Sea', 'Lake Malawi', 'Lake Tanganyika', 'Lake Victoria', 'Lake Geneva',
];
const PERSONAL_ASIA_EXCLUDED = new Set(['YE', 'OM', 'LB', 'SY', 'AF', 'IQ', 'GE', 'AM', 'AZ', 'JO', 'QA', 'AE', 'PS', 'TR', 'CY']);
// Natural Earth classifies Russia as Europe; explicitly retain all its subdivisions.
const PERSONAL_OTHER_ADMIN = new Set(['GB', 'ES', 'FR', 'IT', 'DE', 'BY', 'RU', 'KM', 'CV', 'EG', 'SD', 'ET', 'ZA', 'CM', 'AU', 'PG']);
// Selected cultural and geographical summits, sorted by elevation (not prominence).
// References: https://ntb.gov.np/things-to-do/mountaineering and
// https://www.geonames.org/NP/highest-mountains-in-nepal.html
// Coordinates are approximate summit locations; elevations are metres.
const PERSONAL_PEAKS = [
  ["Mount McKinley (Denali)", 6190, -151.0074, 63.0695],
  ["Mount Whitney", 4421, -118.2923, 36.5786],
  ["Mount Rainier", 4392, -121.7603, 46.8523],
  ["Mount Elbert", 4401, -106.4454, 39.1178],
  ["Mount Elbrus", 5642, 42.4392, 43.355],
  ["Mont Blanc", 4805.59, 6.865, 45.8326],
  ["Mount Tai", 1545, 117.1017, 36.2558],
  ["Mount Hua", 2154.9, 110.087, 34.477],
  ["Mount Heng (Hunan)", 1300.2, 112.6897, 27.29722],
  ["Mount Heng (Shanxi)", 2016.1, 113.7328, 39.674],
  ["Mount Song", 1512, 112.934647, 34.472416],
  ['Mount Everest', 8848.86, 86.925, 27.9881], ['K2', 8611, 76.5133, 35.8814],
  ['Kangchenjunga', 8586, 88.1475, 27.7025], ['Lhotse', 8516, 86.9331, 27.9617],
  ['Makalu', 8485, 87.0889, 27.8897], ['Cho Oyu', 8188, 86.6608, 28.0942],
  ['Dhaulagiri I', 8167, 83.4878, 28.6983], ['Manaslu', 8163, 84.5597, 28.55],
  ['Nanga Parbat', 8126, 74.5892, 35.2372], ['Annapurna I', 8091, 83.8203, 28.5958],
].sort((a, b) => b[1] - a[1]);


const FIVE_YUE_NATIVE = { 'Mount Tai':'泰山', 'Mount Hua':'华山', 'Mount Heng (Hunan)':'衡山', 'Mount Heng (Shanxi)':'恒山', 'Mount Song':'嵩山' };
const FEATURE_ADDITIONS = {
  'Gulf of Taranto': {countries:['Italy'],story:'The Ionian Sea reaches between Calabria and the Salento peninsula here. Taranto, founded as a Greek colony, developed into an important commercial and naval port at the head of the gulf.',sourceUrl:'https://www.esa.int/ESA_Multimedia/Images/2019/06/Gulf_of_Taranto_Italy'},
  'Gulf of Saint-Malo': {countries:['France','Jersey','Guernsey'],story:'Also called the Norman–Breton Gulf, this island-studded part of the English Channel lies between northern Brittany and the Cotentin peninsula. Strong tides shape its bays, estuaries and island passages.',sourceUrl:'https://www.fao.org/4/af033e/AF033E04.htm'},
  'Bight of Benin': {countries:['Ghana','Togo','Benin','Nigeria'],story:'The lagoon-backed coast between Cape Saint Paul and Cape Formoso links the ports of Lomé, Cotonou and Lagos along the northern Gulf of Guinea.',sourceUrl:'https://msi.nga.mil/api/publications/download?key=16694491%2FSFH00000%2FPub123bk.pdf&type=view'},
  'Bight of Bonny': {countries:['Nigeria','Cameroon','Equatorial Guinea','Gabon'],story:'Also known as the Bight of Biafra, this eastern Gulf of Guinea embayment extends from the Niger Delta to Cape Lopez, with the volcanic island of Bioko offshore.',sourceUrl:'https://msi.nga.mil/api/publications/download?key=16694491%2FSFH00000%2FPub123bk.pdf&type=view'},
  'Corisco Bay': {countries:['Equatorial Guinea','Gabon'],story:'An island-studded coastal bay between Cabo San Juan and Cap Esterias, where estuaries open into the eastern Gulf of Guinea.',sourceUrl:'https://msi.nga.mil/api/publications/download?key=16694491%2FSFH00000%2FPub123bk.pdf&type=view'},
  "Gulf of Suez": {"countries": ["Egypt"], "story": "The northwestern arm of the Red Sea leads to the Suez Canal, linking this rift-bounded gulf to a global shipping route.", "sourceUrl": "https://www.suezcanal.gov.eg/English/About/SuezCanal/Pages/AboutSuezCanal.aspx"},
  "Gulf of Aqaba": {"countries": ["Egypt", "Israel", "Jordan", "Saudi Arabia"], "story": "A deep northeastern arm of the Red Sea, shared by four countries and connected to the main basin through the Straits of Tiran.", "sourceUrl": "https://www.ncei.noaa.gov/archive/archive-management-system/OAS/bin/prd/jquery/seaname/details/16"},
  "Gulf of Lion": {"countries": ["France", "Spain"], "story": "The Mediterranean embayment along Occitanie and Provence includes the Rh\u00f4ne delta and the French continental shelf.", "sourceUrl": "https://doi.org/10.17882/81407"},
  "Gatun Lake": {"countries": ["Panama"], "story": "An artificial lake created for the Panama Canal, providing its elevated navigable crossing and water for the locks.", "sourceUrl": "https://www.esa.int/Applications/Observing_the_Earth/Earth_from_Space_The_Panama_Canal"},
  "Lake Nasser": {"countries": ["Egypt", "Sudan"], "story": "The Aswan High Dam reservoir flooded part of historical Nubia and prompted the rescue of monuments including Abu Simbel. Its Sudanese reach is known as Lake Nubia.", "sourceUrl": "https://science.nasa.gov/earth/earth-observatory/lake-nasser-egypt-5988/"},
  "Suez Canal": {"countries": ["Egypt"], "story": "An artificial sea-level waterway connecting the Mediterranean and Red Sea through Egypt. Opened in 1869, it lets ships travel between Europe and Asia without rounding Africa.", "sourceUrl": "https://www.suezcanal.gov.eg/English/About/SuezCanal/Pages/AboutSuezCanal.aspx"},

  "Taman Bay": {"countries": ["Russia"], "story": "A shallow, island-studded embayment between the Chushka and Tuzla spits on the eastern side of Kerch Strait.", "sourceUrl": "https://www.cbd.int/doc/meetings/mar/ebsaws-2017-01/templates/ebsaws-2017-01-template-03-TamanBay-en.pdf"},
  "Dnieper-Bug Estuary": {"countries": ["Ukraine"], "story": "The Dnieper and Southern Bug meet in a two-armed liman, linked to the Black Sea through the narrow entrance beside Kinburn Spit.", "sourceUrl": "https://discover.ua/en/en/locations/dniprovsko-buzkij-liman"},
  "Burgas Bay": {"countries": ["Bulgaria"], "story": "A sheltered western Black Sea embayment on which Burgas developed as a major Bulgarian port.", "sourceUrl": "https://deims.org/locations/929232ff-72b4-4671-8649-79950504f33d"},
  "Gulf of Odessa": {"countries": ["Ukraine"], "story": "Also called the Gulf of Odesa, this coastal indentation frames the city and its Black Sea port.", "sourceUrl": "https://en.wikipedia.org/wiki/Gulf_of_Odesa"},
  "Karkinit Bay": {"countries": ["Ukraine"], "story": "Between mainland Ukraine and northwestern Crimea, the bay includes internationally recognized coastal wetlands. Crimea is internationally recognized as Ukrainian territory and is controlled by Russia.", "sourceUrl": "https://rsis.ramsar.org/ris/114"},
  "Kalamita Bay": {"countries": ["Ukraine"], "story": "A broad western Crimean bay south of Yevpatoria, bounded by the Yevpatoria and Lukull capes. Crimea is internationally recognized as Ukrainian territory and is controlled by Russia.", "sourceUrl": "https://esu.com.ua/article-10364"},
  "Taganrog Bay": {"countries": ["Ukraine", "Russia"], "story": "The shallow northeastern arm of the Sea of Azov receives the Don River and forms the maritime approach to Taganrog and the lower Don.", "sourceUrl": "https://en.wikipedia.org/wiki/Taganrog_Bay"},

  'Palk Strait': {countries:['India','Sri Lanka'], story:'Shallow waters between India and Sri Lanka, mapped together with adjoining Palk Bay; Adam’s Bridge separates them from the Gulf of Mannar and their shoals constrain navigation.', sourceUrl:'https://www.ncei.noaa.gov/archive/archive-management-system/OAS/bin/prd/jquery/seaname/details/118'},
  'Türkmenbaşy Gulf': {countries:['Turkmenistan'], story:'Also called Krasnovodsk Bay, this shallow Caspian embayment supports migratory waterbirds and the port of Türkmenbaşy.', sourceUrl:'https://tehranconvention.org/system/files/tcis/caspian-sea-encyclopediapdf.pdf'},
  "Mount McKinley (Denali)": {
    "countries": [
      "United States"
    ],
    "parent": "Alaska Range",
    "story": "North America’s highest summit; Denali is its longstanding Alaska Native name. The US federal name returned to Mount McKinley in 2025.",
    "sourceUrl": "https://www.govinfo.gov/features/denali-national-park"
  },
  "Mount Whitney": {
    "countries": [
      "United States"
    ],
    "parent": "Sierra Nevada",
    "story": "The highest summit in the contiguous United States rises above the Owens Valley.",
    "sourceUrl": "https://www.nps.gov/seki/planyourvisit/whitney.htm"
  },
  "Mount Rainier": {
    "countries": [
      "United States"
    ],
    "parent": "Cascade Range",
    "story": "A glacier-clad active volcano shapes the landscape and volcanic hazards of the Pacific Northwest.",
    "sourceUrl": "https://www.nps.gov/mora/index.htm"
  },
  "Mount Elbert": {
    "countries": [
      "United States"
    ],
    "parent": "Rocky Mountains",
    "story": "The Sawatch Range summit is the highest point of the Rocky Mountains.",
    "sourceUrl": "https://www.fs.usda.gov/"
  },
  "Mount Elbrus": {
    "countries": [
      "Russia"
    ],
    "parent": "Caucasus Mountains",
    "story": "A twin-summit volcano, conventionally Europe’s highest mountain when the continental boundary follows the Greater Caucasus watershed.",
    "sourceUrl": "https://www.wikidata.org/wiki/Q43105"
  },
  "Mont Blanc": {
    "countries": [
      "France",
      "Italy"
    ],
    "parent": "Alps",
    "story": "The Alps’ highest summit lies in a disputed Franco-Italian border sector. Elevation shown is the 2023 snow-cap survey (4805.59 m); snow and ice heights vary.",
    "sourceUrl": "https://geologie-montblanc.fr/montBlanc.htm"
  },
  "Mount Tai": {
    "countries": [
      "China"
    ],
    "parent": "Five Great Mountains (Five Yue)",
    "story": "Eastern mountain of the Five Yue, a sacred geography of imperial rites and pilgrimage. ",
    "sourceUrl": "https://www.berkshirepublishing.com/ecph-china/2018/01/04/five-great-mountains/"
  },
  "Mount Hua": {
    "countries": [
      "China"
    ],
    "parent": "Five Great Mountains (Five Yue)",
    "story": "Western mountain of the Five Yue, a sacred geography of imperial rites and pilgrimage. ",
    "sourceUrl": "https://www.berkshirepublishing.com/ecph-china/2018/01/04/five-great-mountains/"
  },
  "Mount Heng (Hunan)": {
    "countries": [
      "China"
    ],
    "parent": "Five Great Mountains (Five Yue)",
    "story": "Southern mountain of the Five Yue, a sacred geography of imperial rites and pilgrimage. ",
    "sourceUrl": "https://www.berkshirepublishing.com/ecph-china/2018/01/04/five-great-mountains/"
  },
  "Mount Heng (Shanxi)": {
    "countries": [
      "China"
    ],
    "parent": "Five Great Mountains (Five Yue)",
    "story": "Northern mountain of the Five Yue, a sacred geography of imperial rites and pilgrimage. ",
    "sourceUrl": "https://www.berkshirepublishing.com/ecph-china/2018/01/04/five-great-mountains/"
  },
  "Mount Song": {
    "countries": [
      "China"
    ],
    "parent": "Five Great Mountains (Five Yue)",
    "story": "Central mountain of the Five Yue, a sacred geography of imperial rites and pilgrimage. The point marks Liantian Feng, the Song massif’s highest summit, rather than lower Junji Feng.",
    "sourceUrl": "https://www.berkshirepublishing.com/ecph-china/2018/01/04/five-great-mountains/"
  },
  "Dolomites": {
    "countries": [
      "Italy"
    ],
    "parent": "Alps",
    "story": "Dolomite rock towers preserve ancient tropical marine environments, now uplifted into the Alps. This is a generalized range footprint, not the UNESCO property boundary.",
    "sourceUrl": "https://whc.unesco.org/en/list/1237/"
  },
  "Bismarck Range": {
    "countries": [
      "Papua New Guinea"
    ],
    "parent": "New Guinea Highlands",
    "story": "Part of New Guinea’s central highlands, the range includes Mount Wilhelm, Papua New Guinea’s highest summit. It is on the mainland, separate from the Bismarck Archipelago.",
    "sourceUrl": "https://www.papuaerfgoed.org/sites/default/files/collectie/files/2006-03/vanRoyen_1980_Alpine.pdf"
  },
  "Seine": {
    "countries": [
      "France"
    ],
    "parent": "English Channel",
    "story": "The Seine links Paris with the Channel ports, a historic corridor of trade and urban life.",
    "sourceUrl": "https://whc.unesco.org/en/list/600/"
  }
};

const DISPUTED_TO_PARENT = {
  TWN: 'CHN', // Taiwan -> China
  CYN: 'CYP', // Northern Cyprus -> Cyprus
  SOL: 'SOM', // Somaliland -> Somalia
  SAH: 'MAR', // Western Sahara -> Morocco
};

// Features that must keep their own color despite NE sovereignty grouping
const KEEP_OWN_COLOR = new Set(['KOS', 'PSX']);

// Features that should stay neutral gray (no country color)
const NEUTRAL = new Set(['ATA', 'BRT', 'PGA', 'SCR', 'BJN', 'SER', 'CNM', 'SPI', 'BRI', 'KAS']);

// Features whose info card shows a gray "Disputed area" badge instead of "Country"
const DISPUTED_BADGE = new Set([
  'TWN', 'CYN', 'SOL', 'SAH', 'KAS', 'PGA', 'SCR', 'BJN', 'SER', 'CNM', 'SPI', 'BRI',
]);

// Natural Earth leaves ISO_A2 as "-99" for a few countries; fix the ones
// we need so flag lookups work.
const ISO2_FIXUP = { FRA: 'FR', NOR: 'NO', KOS: 'XK', SAH: 'EH', PSX: 'PS' };

// Manual corrections to the displayed common name (map label + card title)
// and/or official name (card subtitle), keyed by ADM0_A3.
const NAME_OVERRIDES = {
  RUS: { name: 'Russia', formal: 'Russian Federation' },
  // TWN: { name: 'Taiwan', formal: 'Republic of China' },
};

// ---------------------------------------------------------------------------
// Native-language country names (endonyms), shown under the official name.
// Countries whose primary official language is English get none.
//
// Where Natural Earth carries the language (NAME_ZH, NAME_RU, ...), we read it
// from the data; languages NE doesn't cover use the literal table below.
// ---------------------------------------------------------------------------
const NATIVE_LANG_COLUMN = {
  // Arabic
  DZA: 'AR', BHR: 'AR', EGY: 'AR', IRQ: 'AR', JOR: 'AR', KWT: 'AR', LBN: 'AR',
  LBY: 'AR', MAR: 'AR', OMN: 'AR', QAT: 'AR', SAU: 'AR', SDN: 'AR', SYR: 'AR',
  TUN: 'AR', ARE: 'AR', YEM: 'AR', MRT: 'AR', PSX: 'AR', SAH: 'AR',
  // East Asian
  CHN: 'ZH', JPN: 'JA', KOR: 'KO', PRK: 'KO',
  // Cyrillic
  RUS: 'RU', UKR: 'UK',
  // Spanish
  ESP: 'ES', ARG: 'ES', BOL: 'ES', CHL: 'ES', COL: 'ES', CRI: 'ES', CUB: 'ES', DOM: 'ES',
  ECU: 'ES', SLV: 'ES', GNQ: 'ES', GTM: 'ES', HND: 'ES', MEX: 'ES', NIC: 'ES',
  PAN: 'ES', PRY: 'ES', PER: 'ES', URY: 'ES', VEN: 'ES',
  // Portuguese
  AGO: 'PT', BRA: 'PT', CPV: 'PT', GNB: 'PT', MOZ: 'PT', PRT: 'PT', STP: 'PT', TLS: 'PT',
  // French
  BEN: 'FR', BFA: 'FR', CAF: 'FR', TCD: 'FR', COG: 'FR', COD: 'FR', CIV: 'FR',
  DJI: 'FR', FRA: 'FR', GAB: 'FR', GIN: 'FR', HTI: 'FR', MLI: 'FR', MCO: 'FR',
  NER: 'FR', SEN: 'FR', TGO: 'FR',
  // Other European
  AUT: 'DE', DEU: 'DE', LIE: 'DE', ITA: 'IT', SMR: 'IT', NLD: 'NL', SUR: 'NL',
  GRC: 'EL', CYP: 'EL', TUR: 'TR', POL: 'PL', HUN: 'HU', SWE: 'SV',
  // Middle East / South / Southeast Asia
  IRN: 'FA', ISR: 'HE', IND: 'HI', PAK: 'UR', BGD: 'BN', IDN: 'ID', VNM: 'VI',
};

const NATIVE_LITERAL = {
  CHN: '中国', // NE's NAME_ZH gives the formal 中华人民共和国; show the common name
  AFG: 'افغانستان',
  ALB: 'Shqipëria',
  ARM: 'Հայաստան',
  AZE: 'Azərbaycan',
  BLR: 'Беларусь',
  BEL: 'België / Belgique',
  BTN: 'འབྲུག་ཡུལ་',
  BIH: 'Bosna i Hercegovina',
  BGR: 'България',
  BDI: 'Uburundi',
  KHM: 'កម្ពុជា',
  CHE: 'Schweiz / Suisse',
  CYN: 'Kuzey Kıbrıs',
  CZE: 'Česko',
  DNK: 'Danmark',
  ERI: 'ኤርትራ',
  EST: 'Eesti',
  ETH: 'ኢትዮጵያ',
  FIN: 'Suomi',
  GEO: 'საქართველო',
  GRL: 'Kalaallit Nunaat',
  HRV: 'Hrvatska',
  IRL: 'Éire',
  ISL: 'Ísland',
  KAZ: 'Қазақстан',
  KGZ: 'Кыргызстан',
  KOS: 'Kosova',
  LAO: 'ລາວ',
  LVA: 'Latvija',
  LTU: 'Lietuva',
  LUX: 'Lëtzebuerg',
  MDG: 'Madagasikara',
  MKD: 'Северна Македонија',
  MMR: 'မြန်မာ',
  MNE: 'Crna Gora',
  MNG: 'Монгол Улс',
  NOR: 'Norge',
  NPL: 'नेपाल',
  PHL: 'Pilipinas',
  ROU: 'România',
  SRB: 'Србија',
  SVK: 'Slovensko',
  SVN: 'Slovenija',
  SOM: 'Soomaaliya',
  SOL: 'Soomaaliland',
  LKA: 'ශ්‍රී ලංකාව',
  SWZ: 'eSwatini',
  TJK: 'Тоҷикистон',
  THA: 'ประเทศไทย',
  TKM: 'Türkmenistan',
  TWN: '台灣',
  UZB: 'Oʻzbekiston',
  VAT: 'Città del Vaticano',
};

// Admin-1 (state/province) borders are shown for ALL sovereign countries.
// Territories/dependencies (Taiwan, Curaçao, Hong Kong…) are excluded — their
// iso_a2 codes are derived at build time from the processed countries file
// (any feature carrying a STATUS_NOTE = disputed/dependency/special status).

const STATUS_NOTES = {
  TWN: 'Claimed by the People’s Republic of China; self-governed since 1949. Not a UN member — colored as PRC per UN recognition. Recognized by ~12 states.',
  CYN: 'De facto state recognized only by Türkiye; the UN recognizes the Republic of Cyprus over the whole island.',
  SOL: 'Self-declared independence from Somalia in 1991; unrecognized by any UN member. The UN considers it part of Somalia.',
  SAH: 'Non-self-governing territory per the UN; largely administered by Morocco, claimed by the Sahrawi Arab Democratic Republic.',
  KOS: 'Declared independence from Serbia in 2008. Recognized by ~100 UN members (a majority) but not a UN member due to Security Council veto.',
  PSX: 'UN observer state since 2012, recognized by ~140 UN members. Comprises the West Bank and Gaza.',
  KAS: 'Siachen Glacier — part of the Kashmir conflict between India and Pakistan; the highest battleground on Earth.',
  ATA: 'Governed by the Antarctic Treaty System (1959); territorial claims are held in abeyance.',
  BRT: 'Bir Tawil — claimed by neither Egypt nor Sudan; one of the few examples of terra nullius.',
  PGA: 'Spratly Islands — disputed among China, Taiwan, Vietnam, the Philippines, Malaysia, and Brunei.',
  SCR: 'Scarborough Reef — disputed between China, Taiwan, and the Philippines.',
};

function readGeo(name) {
  return JSON.parse(fs.readFileSync(path.join(GEO_DIR, name), 'utf-8'));
}

function readRaw(name) {
  return JSON.parse(fs.readFileSync(path.join(RAW_DIR, name), 'utf-8'));
}

function writeGeo(name, data) {
  fs.writeFileSync(path.join(GEO_DIR, name), JSON.stringify(data));
  const size = (fs.statSync(path.join(GEO_DIR, name)).size / 1024 / 1024).toFixed(2);
  console.log(`  ${name}: ${size} MB`);
}

function nativeName(p, adm0) {
  if (NATIVE_LITERAL[adm0]) return NATIVE_LITERAL[adm0];
  const col = NATIVE_LANG_COLUMN[adm0];
  if (col && p[`NAME_${col}`]) return p[`NAME_${col}`];
  return null;
}

// BCP-47 language tag for pronouncing the endonym via the Web Speech API.
// Column languages get a default tag; per-country overrides where the shared
// column isn't the local variant (Brazil) or the endonym is a curated literal.
const COLUMN_LANG_TAG = {
  AR: 'ar-SA', ZH: 'zh-CN', JA: 'ja-JP', KO: 'ko-KR', RU: 'ru-RU', UK: 'uk-UA',
  ES: 'es-ES', PT: 'pt-PT', FR: 'fr-FR', DE: 'de-DE', IT: 'it-IT', NL: 'nl-NL',
  EL: 'el-GR', TR: 'tr-TR', FA: 'fa-IR', HE: 'he-IL', HI: 'hi-IN', UR: 'ur-PK',
  BN: 'bn-BD', ID: 'id-ID', VI: 'vi-VN', PL: 'pl-PL', HU: 'hu-HU', SV: 'sv-SE',
};
const COUNTRY_LANG_TAG = {
  BRA: 'pt-BR', MEX: 'es-MX', ARG: 'es-AR', TWN: 'zh-TW', CHN: 'zh-CN',
  AFG: 'fa-IR', ALB: 'sq-AL', ARM: 'hy-AM', AZE: 'az-AZ', BLR: 'be-BY',
  BEL: 'nl-BE', BTN: 'dz-BT', BIH: 'bs-BA', BGR: 'bg-BG', BDI: 'rn-BI',
  KHM: 'km-KH', CHE: 'de-CH', CYN: 'tr-TR', CZE: 'cs-CZ', DNK: 'da-DK',
  ERI: 'ti-ER', EST: 'et-EE', ETH: 'am-ET', FIN: 'fi-FI', GEO: 'ka-GE',
  GRL: 'kl-GL', HRV: 'hr-HR', IRL: 'ga-IE', ISL: 'is-IS', KAZ: 'kk-KZ',
  KGZ: 'ky-KG', KOS: 'sq-AL', LAO: 'lo-LA', LVA: 'lv-LV', LTU: 'lt-LT',
  LUX: 'lb-LU', MDG: 'mg-MG', MKD: 'mk-MK', MMR: 'my-MM', MNE: 'sr-RS',
  MNG: 'mn-MN', NOR: 'nb-NO', NPL: 'ne-NP', PHL: 'fil-PH', ROU: 'ro-RO',
  SRB: 'sr-RS', SVK: 'sk-SK', SVN: 'sl-SI', SOM: 'so-SO', SOL: 'so-SO',
  LKA: 'si-LK', SWZ: 'ss-SZ', TJK: 'tg-TJ', THA: 'th-TH', TKM: 'tk-TM',
  UZB: 'uz-UZ', VAT: 'it-IT',
};

function nativeLangTag(adm0) {
  if (COUNTRY_LANG_TAG[adm0]) return COUNTRY_LANG_TAG[adm0];
  const col = NATIVE_LANG_COLUMN[adm0];
  return (col && COLUMN_LANG_TAG[col]) || null;
}

// ---------------------------------------------------------------------------
// Native names (endonyms) for physical features & national capitals.
//
// Same editorial rule as the rest of the atlas: only features with ONE
// unambiguous native language get an endonym. The Danube (Donau/Duna/Dunav/
// Dunărea…), the Alps, Everest are deliberately absent — a feature shared by
// many languages has no single endonym to print.
//
// Entry shape, keyed by NE's exact `name`/`NAME`:
//   { col: 'zh' }        → read NE's localized column (lakes/peaks/ranges carry
//                          ~25 name_xx columns; rivers carry NONE)
//   { native: '长江' }    → hand-written literal (required for rivers; wins over col)
//   lang: 'zh-CN'        → BCP-47 tag for the SpeakButton; defaults from
//                          COLUMN_LANG_TAG when `col` is used.
//
// Scripts the map itself can draw are limited by the glyph pipeline: CJK/kana/
// hangul come from the browser's local fonts (MapLibre localIdeographFontFamily)
// and Latin/Cyrillic/Greek from the demotiles Noto Sans PBFs. Everything else
// (Arabic, Devanagari, Armenian…) would render as tofu on the canvas, so those
// endonyms are flagged card-only via NATIVE_ON_MAP below.
// ---------------------------------------------------------------------------
const RIVER_NATIVE = {
  Yangtze: { native: '长江', lang: 'zh-CN' },
  'Chang Jiang': { native: '长江', lang: 'zh-CN' }, // NE splits the river; same endonym on both reaches
  Huang: { native: '黄河', lang: 'zh-CN' },
  Xi: { native: '西江', lang: 'zh-CN' },
  Tarim: { native: '塔里木河', lang: 'zh-CN' },
  Songhua: { native: '松花江', lang: 'zh-CN' },
  Liao: { native: '辽河', lang: 'zh-CN' },
  Volga: { native: 'Волга', lang: 'ru-RU' },
  Ob: { native: 'Обь', lang: 'ru-RU' },
  Lena: { native: 'Лена', lang: 'ru-RU' },
  Yenisey: { native: 'Енисей', lang: 'ru-RU' },
  Angara: { native: 'Ангара', lang: 'ru-RU' },
  Kama: { native: 'Кама', lang: 'ru-RU' },
  Don: { native: 'Дон', lang: 'ru-RU' },
  Pechora: { native: 'Печора', lang: 'ru-RU' },
  Kolyma: { native: 'Колыма', lang: 'ru-RU' },
  Indigirka: { native: 'Индигирка', lang: 'ru-RU' },
  Aldan: { native: 'Алдан', lang: 'ru-RU' },
  Vilyuy: { native: 'Вилюй', lang: 'ru-RU' },
  Ganges: { native: 'गंगा', lang: 'hi-IN' }, // Devanagari → card-only until glyphs support it
};

const LAKE_NATIVE = {
  'Gatun Lake':{native:'Lago Gatún',lang:'es'},
  'Qinghai Hu': { col: 'zh' },
  'Poyang Hu': { col: 'zh' },
  'Tai Hu': { col: 'zh' },
  'Bosten Hu': { col: 'zh' },
  'Hulun Nuur': { native: '呼伦湖', lang: 'zh-CN' }, // NE's name_zh is traditional 呼倫湖; use simplified like the rest of China
  'Biwa Ko': { col: 'ja' },
  'Lake Baikal': { col: 'ru' },
  'Lake Ladoga': { col: 'ru' },
  'Lake Onega': { col: 'ru' },
  'Lake Taymyr': { col: 'ru' },
  'Issyk-Kul': { native: 'Ысык-Көл', lang: 'ky-KG' }, // Kyrgyz, not NE's Russian column
  'Lake Balkhash': { native: 'Балқаш көлі', lang: 'kk-KZ' },
  'Lake Sevan': { native: 'Սևանա լիճ', lang: 'hy-AM' }, // Armenian → card-only
  'Lake Van': { native: 'Van Gölü', lang: 'tr-TR' },
  'Lake Urmia': { native: 'دریاچه ارومیه', lang: 'fa-IR' }, // Persian → card-only
  'Lake Geneva': { native: 'Lac Léman', lang: 'fr-FR' }, // French on both shores
};

// Ranges are keyed by NE's NAME (often uppercase) and read NAME_XX columns.
const RANGE_NATIVE = {
  'KUNLUN MOUNTAINS': { col: 'zh' },
  'Qinling Mountains': { col: 'zh' },
  'URAL MOUNTAINS': { col: 'ru' },
  'VERKHOYANSK RANGE': { col: 'ru' },
  'CHERSKIY RANGE': { col: 'ru' },
  'STANOVOY RANGE': { col: 'ru' },
  'SIKHOTE-ALIN’ RANGE': { col: 'ru' },
  'KOLYMA RANGE': { col: 'ru' },
  // NE's Russian values carry stress accents (Восто́чный) — use clean literals.
  'EASTERN SAYAN MTS.': { native: 'Восточный Саян', lang: 'ru-RU' },
  'WESTERN SAYAN MTS.': { native: 'Западный Саян', lang: 'ru-RU' },
  'ZAGROS MOUNTAINS': { col: 'fa' }, // Persian → card-only
  'ELBURZ MTS.': { col: 'fa' }, // Persian → card-only
};

// Capitals are automatic (country's NATIVE_LANG_COLUMN → NAME_XX column), but
// NE's column sometimes holds the formal administrative name — override with
// the common endonym, mirroring what NATIVE_LITERAL does for 中国 vs 中华人民共和国.
const CAPITAL_NATIVE = {
  Tokyo: { native: '東京', lang: 'ja-JP' }, // NE: 東京都 (Tokyo Metropolis)
  Seoul: { native: '서울', lang: 'ko-KR' }, // NE: 서울특별시 (Seoul Special City)
  Pyongyang: { native: '평양', lang: 'ko-KR' }, // NE: 평양직할시
};

const PEAK_NATIVE = {
  'Gora Elbrus': { col: 'ru' },
  'Klyuchevskaya Sopka': { col: 'ru' },
  Belukha: { col: 'ru' },
  'Gongga Shan': { col: 'zh' },
  'Wutai Shan': { col: 'zh' },
  'Jebel Toubkal': { col: 'ar', lang: 'ar-MA' }, // Arabic → card-only
};

// Scripts the GL canvas can currently draw: Latin (+combining marks), Greek,
// Cyrillic, general/CJK punctuation, kana, CJK ideographs, hangul, fullwidth
// forms. Anything outside → endonym shows in the InfoCard only.
const MAP_RENDERABLE_RE =
  /^[\u0020-\u024F\u0300-\u036F\u0370-\u03FF\u0400-\u04FF\u1E00-\u1EFF\u2000-\u206F\u3000-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF]+$/;

// Resolve a curated entry against a feature's props → sets name_native,
// name_native_lang, NATIVE_ON_MAP. No-op when the entry is missing or the
// endonym is just the English name again.
function applyFeatureNative(props, entry) {
  if (!entry) return;
  const col = entry.col && entry.col.toLowerCase();
  const native =
    entry.native ?? (col ? props[`name_${col}`] ?? props[`NAME_${col.toUpperCase()}`] : null);
  if (!native || native === (props.name ?? props.NAME)) return;
  props.name_native = native;
  props.name_native_lang = entry.lang ?? (col && COLUMN_LANG_TAG[col.toUpperCase()]) ?? null;
  props.NATIVE_ON_MAP = MAP_RENDERABLE_RE.test(native);
}

function processCountryTier(rawName, outName) {
  const data = readRaw(rawName);

  // Pass 1: color donor per ADM0_A3 and per sovereignty group (largest population wins)
  const colorByAdm0 = {};
  const donorBySov = {};
  for (const f of data.features) {
    const p = f.properties;
    colorByAdm0[p.ADM0_A3] = p.MAPCOLOR13;
    const cur = donorBySov[p.SOV_A3];
    if (!cur || (p.POP_EST || 0) > cur.pop) {
      donorBySov[p.SOV_A3] = { color: p.MAPCOLOR13, pop: p.POP_EST || 0, name: p.SOVEREIGNT };
    }
  }

  // Pass 2: build output features with resolved colors and status notes
  data.features = data.features.map((f, i) => {
    const p = f.properties;
    const adm0 = p.ADM0_A3;
    let color = p.MAPCOLOR13;
    let statusNote = STATUS_NOTES[adm0] || null;

    if (NEUTRAL.has(adm0)) {
      color = null; // falls through to neutral gray in the style
    } else if (DISPUTED_TO_PARENT[adm0]) {
      const parent = DISPUTED_TO_PARENT[adm0];
      if (colorByAdm0[parent] != null) color = colorByAdm0[parent];
    } else if (!KEEP_OWN_COLOR.has(adm0)) {
      // Dependencies / leases / territories inherit the sovereign group's color
      const donor = donorBySov[p.SOV_A3];
      const isDependent = p.SOV_A3 !== adm0 && donor && donor.pop > (p.POP_EST || 0);
      if (isDependent) {
        color = donor.color;
        if (!statusNote) statusNote = `Territory of ${donor.name}.`;
      }
    }

    const iso2raw = p.ISO_A2_EH && p.ISO_A2_EH.length === 2 ? p.ISO_A2_EH
      : p.ISO_A2 && p.ISO_A2.length === 2 ? p.ISO_A2 : null;

    const override = NAME_OVERRIDES[adm0];
    const name = override?.name || p.NAME;
    const nameLong = override?.name || p.NAME_LONG;
    const formalEn = override?.formal || p.FORMAL_EN || p.NAME_LONG || p.NAME;

    return {
      type: 'Feature',
      id: i,
      geometry: f.geometry,
      properties: {
        NAME: name,
        NAME_LONG: nameLong,
        FORMAL_EN: formalEn,
        NAME_NATIVE: nativeName(p, adm0),
        NAME_NATIVE_LANG: nativeName(p, adm0) ? nativeLangTag(adm0) : null,
        ISO_A3: p.ISO_A3,
        ISO_A2: ISO2_FIXUP[adm0] || iso2raw,
        ADM0_A3: adm0,
        // Coast-fitted Gujarat gulfs appear at z3; switch all political layers together.
        COAST_DETAIL: ['IND','UKR','RUS','BGR','TUR','ROU','EGY','SAU','JOR','ISR','FRA','ESP','ITA','JEY','GGY','LBR','CIV','GHA','TGO','BEN','NGA','CMR','GNQ','GAB','STP'].includes(adm0),
        MAPCOLOR13: color,
        POP_EST: p.POP_EST,
        CONTINENT: p.CONTINENT,
        SUBREGION: p.SUBREGION,
        STATUS: DISPUTED_BADGE.has(adm0) ? 'disputed' : null,
        STATUS_NOTE: statusNote,
      },
    };
  });

  writeGeo(outName, data);
}

// Explicit city→first-level-unit membership: do not trust obsolete NE capital flags.
// Seasonal/shared capitals are retained; national role always takes precedence.
// Provenance and conventions: docs/subdivision-capitals.md.
const FIRST_LEVEL_CAPITALS = {
  "RU": {
    "Maykop": [
      "Adygey"
    ],
    "Cherkessk": [
      "Karachay-Cherkess"
    ],
    "Vladikavkaz": [
      "North Ossetia"
    ],
    "Kaluga": [
      "Kaluga"
    ],
    "Saransk": [
      "Mordovia"
    ],
    "Yoshkar Ola": [
      "Mariy-El"
    ],
    "Velikiy Novgorod": [
      "Novgorod"
    ],
    "Kursk": [
      "Kursk"
    ],
    "Tula": [
      "Tula"
    ],
    "Tambov": [
      "Tambov"
    ],
    "Kurgan": [
      "Kurgan"
    ],
    "Salekhard": [
      "Yamal-Nenets"
    ],
    "Syktyvkar": [
      "Komi"
    ],
    "Cheboksary": [
      "Chuvash"
    ],
    "Khanty Mansiysk": [
      "Khanty-Mansiy"
    ],
    "Gorno Altaysk": [
      "Gorno-Altay"
    ],
    "Makhachkala": [
      "Dagestan"
    ],
    "Birobidzhan": [
      "Yevrey"
    ],
    "Ivanovo": [
      "Ivanovo"
    ],
    "Kostroma": [
      "Kostroma"
    ],
    "Lipetsk": [
      "Lipetsk"
    ],
    "Orel": [
      "Orel"
    ],
    "Belgorod": [
      "Belgorod"
    ],
    "Vladimir": [
      "Vladimir"
    ],
    "Naryan Mar": [
      "Nenets"
    ],
    "Izhevsk": [
      "Udmurt"
    ],
    "Elista": [
      "Kalmyk"
    ],
    "Nalchik": [
      "Kabardin-Balkar"
    ],
    "Stavropol": [
      "Stavropol'"
    ],
    "Kaliningrad": [
      "Kaliningrad"
    ],
    "Pskov": [
      "Pskov"
    ],
    "Bryansk": [
      "Bryansk"
    ],
    "Smolensk": [
      "Smolensk"
    ],
    "Petrozavodsk": [
      "Karelia"
    ],
    "Tver": [
      "Tver'"
    ],
    "Vologda": [
      "Vologda"
    ],
    "Yaroslavl": [
      "Yaroslavl'"
    ],
    "Rostov": [
      "Rostov"
    ],
    "Krasnodar": [
      "Krasnodar"
    ],
    "Penza": [
      "Penza"
    ],
    "Ryazan": [
      "Ryazan'"
    ],
    "Voronezh": [
      "Voronezh"
    ],
    "Chelyabinsk": [
      "Chelyabinsk"
    ],
    "Kirov": [
      "Kirov"
    ],
    "Astrakhan": [
      "Astrakhan'"
    ],
    "Orenburg": [
      "Orenburg"
    ],
    "Saratov": [
      "Saratov"
    ],
    "Ulyanovsk": [
      "Ul'yanovsk"
    ],
    "Omsk": [
      "Omsk"
    ],
    "Tyumen": [
      "Tyumen'"
    ],
    "Kemerovo": [
      "Kemerovo"
    ],
    "Grozny": [
      "Chechnya"
    ],
    "Abakan": [
      "Khakassia"
    ],
    "Kyzyl": [
      "Tuva"
    ],
    "Ulan-Ude": [
      "Buryat"
    ],
    "Blagoveshchensk": [
      "Amur"
    ],
    "Khabarovsk": [
      "Khabarovsk"
    ],
    "Yuzhno Sakhalinsk": [
      "Sakhalin"
    ],
    "Tomsk": [
      "Tomsk"
    ],
    "Anadyr": [
      "Chukchi Autonomous Okrug"
    ],
    "Murmansk": [
      "Murmansk"
    ],
    "Archangel": [
      "Arkhangel'sk"
    ],
    "Nizhny Novgorod": [
      "Nizhegorod"
    ],
    "Volgograd": [
      "Volgograd"
    ],
    "Ufa": [
      "Bashkortostan"
    ],
    "Yekaterinburg": [
      "Sverdlovsk"
    ],
    "Samara": [
      "Samara"
    ],
    "Kazan": [
      "Tatarstan"
    ],
    "Barnaul": [
      "Altay"
    ],
    "Novosibirsk": [
      "Novosibirsk"
    ],
    "Irkutsk": [
      "Irkutsk"
    ],
    "Krasnoyarsk": [
      "Krasnoyarsk"
    ],
    "Chita": [
      "Chita"
    ],
    "Vladivostok": [
      "Primor'ye"
    ],
    "Yakutsk": [
      "Sakha (Yakutia)"
    ],
    "Magadan": [
      "Magadan Oblast"
    ],
    "Perm": [
      "Perm'"
    ],
    "Petropavlovsk-Kamchatsky": [
      "Kamchatka"
    ],
    "St.  Petersburg": [
      "City of St. Petersburg"
    ],
    "Moscow": [
      "Moskva"
    ],
    "Magas": [
      "Ingushetia"
    ],
    "Gatchina": [
      "Leningrad Oblast"
    ],
    "Krasnogorsk": [
      "Moscow Oblast"
    ]
  },
  "CN": {
    "Haikou": [
      "Hainan"
    ],
    "Hefei": [
      "Anhui"
    ],
    "Shijiazhuang": [
      "Hebei"
    ],
    "Hohhot": [
      "Nei Mongol"
    ],
    "Xining": [
      "Qinghai"
    ],
    "Lhasa": [
      "Xizang"
    ],
    "Yinchuan": [
      "Ningxia Hui"
    ],
    "Lanzhou": [
      "Gansu"
    ],
    "Nanning": [
      "Guangxi"
    ],
    "Guiyang": [
      "Guizhou"
    ],
    "Chongqing": [
      "Chongqing"
    ],
    "Fuzhou": [
      "Fujian"
    ],
    "Guangzhou": [
      "Guangdong"
    ],
    "Xian": [
      "Shaanxi"
    ],
    "Taiyuan": [
      "Shanxi"
    ],
    "Wuhan": [
      "Hubei"
    ],
    "Changsha": [
      "Hunan"
    ],
    "Kunming": [
      "Yunnan"
    ],
    "Zhengzhou": [
      "Henan"
    ],
    "Shenyeng": [
      "Liaoning"
    ],
    "Jinan": [
      "Shandong"
    ],
    "Tianjin": [
      "Tianjin"
    ],
    "Nanchang": [
      "Jiangxi"
    ],
    "Nanjing": [
      "Jiangsu"
    ],
    "Hangzhou": [
      "Zhejiang"
    ],
    "Changchun": [
      "Jilin"
    ],
    "Harbin": [
      "Heilongjiang"
    ],
    "Ürümqi": [
      "Xinjiang Uygur"
    ],
    "Chengdu": [
      "Sichuan"
    ],
    "Beijing": [
      "Beijing"
    ],
    "Shanghai": [
      "Shanghai"
    ]
  },
  "IN": {
    "Panaji": [
      "Goa"
    ],
    "Simla": [
      "Himachal Pradesh"
    ],
    "Gangtok": [
      "Sikkim"
    ],
    "Kavaratti": [
      "Lakshadweep"
    ],
    "Port Blair": [
      "Andaman and Nicobar"
    ],
    "Kohima": [
      "Nagaland"
    ],
    "Shillong": [
      "Meghalaya"
    ],
    "Dehra Dun": [
      "Uttarakhand"
    ],
    "Daman": [
      "Dadra and Nagar Haveli and Daman and Diu"
    ],
    "Gandhinagar": [
      "Gujarat"
    ],
    "Itanagar": [
      "Arunachal Pradesh"
    ],
    "Aizawl": [
      "Mizoram"
    ],
    "Agartala": [
      "Tripura"
    ],
    "Imphal": [
      "Manipur"
    ],
    "Chandigarh": [
      "Punjab",
      "Haryana",
      "Chandigarh"
    ],
    "Dispur": [
      "Assam"
    ],
    "Srinagar": [
      "Jammu and Kashmir"
    ],
    "Thiruvananthapuram": [
      "Kerala"
    ],
    "Lucknow": [
      "Uttar Pradesh"
    ],
    "Ranchi": [
      "Jharkhand"
    ],
    "Raipur": [
      "Chhattisgarh"
    ],
    "Puducherry": [
      "Puducherry"
    ],
    "Bhubaneswar": [
      "Odisha"
    ],
    "Bhopal": [
      "Madhya Pradesh"
    ],
    "Hyderabad": [
      "Telangana"
    ],
    "Jaipur": [
      "Rajasthan"
    ],
    "Patna": [
      "Bihar"
    ],
    "Chennai": [
      "Tamil Nadu"
    ],
    "New Delhi": [
      "Delhi"
    ],
    "Bengaluru": [
      "Karnataka"
    ],
    "Mumbai": [
      "Maharashtra"
    ],
    "Kolkata": [
      "West Bengal"
    ],
    "Leh": [
      "Ladakh"
    ],
    "Amaravati": [
      "Andhra Pradesh"
    ],
    "Jammu": [
      "Jammu and Kashmir"
    ],
    "Dharamshala": [
      "Himachal Pradesh"
    ],
    "Gairsain": [
      "Uttarakhand"
    ],
    "Nagpur": [
      "Maharashtra"
    ],
    "Kargil": [
      "Ladakh"
    ]
  },
  "US": {
    "Montpelier": [
      "Vermont"
    ],
    "Dover": [
      "Delaware"
    ],
    "Annapolis": [
      "Maryland"
    ],
    "Carson City": [
      "Nevada"
    ],
    "Little Rock": [
      "Arkansas"
    ],
    "Jefferson City": [
      "Missouri"
    ],
    "Hartford": [
      "Connecticut"
    ],
    "Providence": [
      "Rhode Island"
    ],
    "Springfield": [
      "Illinois"
    ],
    "Frankfort": [
      "Kentucky"
    ],
    "Madison": [
      "Wisconsin"
    ],
    "Trenton": [
      "New Jersey"
    ],
    "Lansing": [
      "Michigan"
    ],
    "Lincoln": [
      "Nebraska"
    ],
    "Concord": [
      "New Hampshire"
    ],
    "Columbus": [
      "Ohio"
    ],
    "Albany": [
      "New York"
    ],
    "Harrisburg": [
      "Pennsylvania"
    ],
    "St.  Paul": [
      "Minnesota"
    ],
    "Olympia": [
      "Washington"
    ],
    "Salem": [
      "Oregon"
    ],
    "Topeka": [
      "Kansas"
    ],
    "Baton Rouge": [
      "Louisiana"
    ],
    "Austin": [
      "Texas"
    ],
    "Montgomery": [
      "Alabama"
    ],
    "Tallahassee": [
      "Florida"
    ],
    "Columbia": [
      "South Carolina"
    ],
    "Indianapolis": [
      "Indiana"
    ],
    "Richmond": [
      "Virginia"
    ],
    "Charleston": [
      "West Virginia"
    ],
    "Augusta": [
      "Maine"
    ],
    "Helena": [
      "Montana"
    ],
    "Bismarck": [
      "North Dakota"
    ],
    "Boise": [
      "Idaho"
    ],
    "Sacramento": [
      "California"
    ],
    "Santa Fe": [
      "New Mexico"
    ],
    "Salt Lake City": [
      "Utah"
    ],
    "Cheyenne": [
      "Wyoming"
    ],
    "Des Moines": [
      "Iowa"
    ],
    "Oklahoma City": [
      "Oklahoma"
    ],
    "Pierre": [
      "South Dakota"
    ],
    "Jackson": [
      "Mississippi"
    ],
    "Raleigh": [
      "North Carolina"
    ],
    "Nashville": [
      "Tennessee"
    ],
    "Juneau": [
      "Alaska"
    ],
    "Honolulu": [
      "Hawaii"
    ],
    "Phoenix": [
      "Arizona"
    ],
    "Boston": [
      "Massachusetts"
    ],
    "Denver": [
      "Colorado"
    ],
    "Atlanta": [
      "Georgia"
    ],
    "Washington,  D.C.": [
      "District of Columbia"
    ]
  },
  "BR": {
    "Vitória": [
      "Espírito Santo"
    ],
    "João Pessoa": [
      "Paraíba"
    ],
    "Palmas": [
      "Tocantins"
    ],
    "Aracaju": [
      "Sergipe"
    ],
    "Rio Branco": [
      "Acre"
    ],
    "São Luís": [
      "Maranhão"
    ],
    "Porto Velho": [
      "Rondônia"
    ],
    "Belo Horizonte": [
      "Minas Gerais"
    ],
    "Cuiabá": [
      "Mato Grosso"
    ],
    "Teresina": [
      "Piauí"
    ],
    "Maceió": [
      "Alagoas"
    ],
    "Natal": [
      "Rio Grande do Norte"
    ],
    "Manaus": [
      "Amazonas"
    ],
    "Campo Grande": [
      "Mato Grosso do Sul"
    ],
    "Florianópolis": [
      "Santa Catarina"
    ],
    "Boa Vista": [
      "Roraima"
    ],
    "Macapá": [
      "Amapá"
    ],
    "Belém": [
      "Pará"
    ],
    "Brasília": [
      "Distrito Federal"
    ],
    "Porto Alegre": [
      "Rio Grande do Sul"
    ],
    "Curitiba": [
      "Paraná"
    ],
    "Fortaleza": [
      "Ceará"
    ],
    "Salvador": [
      "Bahia"
    ],
    "Goiânia": [
      "Goiás"
    ],
    "Recife": [
      "Pernambuco"
    ],
    "Rio de Janeiro": [
      "Rio de Janeiro"
    ],
    "São Paulo": [
      "São Paulo"
    ]
  },
  "CA": {
    "Fredericton": [
      "New Brunswick"
    ],
    "Iqaluit": [
      "Nunavut"
    ],
    "Winnipeg": [
      "Manitoba"
    ],
    "Regina": [
      "Saskatchewan"
    ],
    "Victoria": [
      "British Columbia"
    ],
    "Yellowknife": [
      "Northwest Territories"
    ],
    "Whitehorse": [
      "Yukon"
    ],
    "Québec": [
      "Québec"
    ],
    "Halifax": [
      "Nova Scotia"
    ],
    "St. John's": [
      "Newfoundland and Labrador"
    ],
    "Charlottetown": [
      "Prince Edward Island"
    ],
    "Edmonton": [
      "Alberta"
    ],
    "Toronto": [
      "Ontario"
    ]
  },
  "MX": {
    "Tlaxcala": [
      "Tlaxcala"
    ],
    "Chilpancingo": [
      "Guerrero"
    ],
    "Xalapa": [
      "Veracruz"
    ],
    "Zacatecas": [
      "Zacatecas"
    ],
    "Morelia": [
      "Michoacán"
    ],
    "Tepic": [
      "Nayarit"
    ],
    "Guanajuato": [
      "Guanajuato"
    ],
    "Pachuca": [
      "Hidalgo"
    ],
    "Toluca": [
      "México"
    ],
    "Saltillo": [
      "Coahuila"
    ],
    "Durango": [
      "Durango"
    ],
    "Ciudad Victoria": [
      "Tamaulipas"
    ],
    "Aguascalientes": [
      "Aguascalientes"
    ],
    "Villahermosa": [
      "Tabasco"
    ],
    "Cuernavaca": [
      "Morelos"
    ],
    "Querétaro": [
      "Querétaro"
    ],
    "Chetumal": [
      "Quintana Roo"
    ],
    "Mexicali": [
      "Baja California"
    ],
    "La Paz": [
      "Baja California Sur"
    ],
    "Culiacán": [
      "Sinaloa"
    ],
    "Hermosillo": [
      "Sonora"
    ],
    "San Luis Potosí": [
      "San Luis Potosí"
    ],
    "Colima": [
      "Colima"
    ],
    "Campeche": [
      "Campeche"
    ],
    "Oaxaca": [
      "Oaxaca"
    ],
    "Chihuahua": [
      "Chihuahua"
    ],
    "Tuxtla Gutiérrez": [
      "Chiapas"
    ],
    "Mérida": [
      "Yucatán"
    ],
    "Guadalajara": [
      "Jalisco"
    ],
    "Puebla": [
      "Puebla"
    ],
    "Monterrey": [
      "Nuevo León"
    ],
    "Mexico City": [
      "Mexico City"
    ]
  }
};
const CAPITAL_CITY_ADD = [{"iso": "RU", "name": "Magas", "coordinates": [44.812, 43.168]}, {"iso": "RU", "name": "Krasnogorsk", "coordinates": [37.3302, 55.8311]}, {"iso": "IN", "name": "Dharamshala", "coordinates": [76.3234, 32.219]}, {"iso": "IN", "name": "Gairsain", "coordinates": [79.288, 30.05]}, {"iso": "IN", "name": "Kargil", "coordinates": [76.132, 34.554]}];

const FIRST_LEVEL_CAPITAL_SOURCE_IDS = {"RU":[1159128473,1159137059,1159137065,1159137249,1159137403,1159137563,1159146503,1159146519,1159146521,1159146523,1159146527,1159146537,1159146551,1159146557,1159146569,1159146581,1159146589,1159146751,1159148103,1159148105,1159148109,1159148111,1159148117,1159148121,1159148129,1159148141,1159148145,1159149521,1159149523,1159149527,1159149529,1159149531,1159149533,1159149535,1159149539,1159149541,1159149543,1159149545,1159149549,1159149551,1159149553,1159149557,1159149561,1159149565,1159149569,1159149571,1159149575,1159149577,1159149579,1159149581,1159149585,1159149587,1159149615,1159149621,1159149623,1159149625,1159149653,1159149657,1159150685,1159150687,1159150691,1159150693,1159150695,1159150697,1159150699,1159150701,1159150703,1159150705,1159150711,1159150713,1159150731,1159150733,1159150737,1159150739,1159150745,1159150749,1159150775,1159150795,1159151291,1159151585,1159137151],"CN":[1159146977,1159149793,1159149907,1159149941,1159150819,1159150879,1159150889,1159151321,1159151323,1159151325,1159151327,1159151329,1159151331,1159151363,1159151365,1159151367,1159151369,1159151371,1159151375,1159151377,1159151379,1159151381,1159151383,1159151385,1159151387,1159151393,1159151397,1159151531,1159151533,1159151595,1159151605],"IN":[1159122667,1159130425,1159130849,1159141813,1159141859,1159141873,1159141877,1159142837,1159142961,1159142979,1159142983,1159142991,1159142995,1159147213,1159149153,1159149165,1159150001,1159150007,1159150147,1159150153,1159150157,1159150163,1159150465,1159150985,1159151407,1159151423,1159151429,1159151431,1159151541,1159151543,1159151611,1159151617,1730025033,1730025037,1159149155,1159151413],"US":[1159124647,1159125621,1159125647,1159146205,1159146223,1159146229,1159146255,1159146257,1159146271,1159146273,1159146283,1159146287,1159146293,1159147389,1159147405,1159147453,1159147463,1159147469,1159149197,1159149211,1159149239,1159149243,1159149255,1159149261,1159149275,1159149277,1159149287,1159149289,1159149295,1159149297,1159149309,1159150471,1159150475,1159150477,1159150481,1159150485,1159150489,1159150493,1159150495,1159150499,1159150501,1159150511,1159150513,1159150519,1159150555,1159151221,1159151225,1159151239,1159151483,1159151489,1159151573],"BR":[1159147621,1159147623,1159148771,1159148827,1159150181,1159150183,1159150187,1159150193,1159150205,1159150213,1159150215,1159150225,1159151005,1159151019,1159151021,1159151055,1159151057,1159151441,1159151443,1159151447,1159151449,1159151451,1159151453,1159151459,1159151461,1159151619,1159151621],"CA":[1159148929,1159150241,1159151025,1159151029,1159151039,1159151047,1159151053,1159151065,1159151069,1159151071,1159151075,1159151455,1159151557],"MX":[1159129331,1159129353,1159129407,1159138385,1159138451,1159138477,1159138549,1159138571,1159138577,1159146787,1159146793,1159146797,1159146799,1159146807,1159146809,1159146811,1159146815,1159149659,1159149661,1159149667,1159149671,1159149675,1159149683,1159149685,1159149687,1159150753,1159150765,1159150769,1159151293,1159151295,1159151527,1159151587]};
function firstLevelCapitalFor(p) {
  return (p.CURATED_CAPITAL || FIRST_LEVEL_CAPITAL_SOURCE_IDS[p.ISO_A2]?.includes(p.NE_ID))
    ? FIRST_LEVEL_CAPITALS[p.ISO_A2]?.[p.NAME] : undefined;
}

function processCities() {
  const data = readRaw('cities-raw.geojson');
  for (const city of CAPITAL_CITY_ADD) {
    data.features.push({type:'Feature',geometry:{type:'Point',coordinates:city.coordinates},properties:{
      NAME:city.name, CURATED_CAPITAL:true, ISO_A2:city.iso, ADM0NAME:city.iso==='RU'?'Russia':'India',
      ADM1NAME:FIRST_LEVEL_CAPITALS[city.iso][city.name][0], ADM0CAP:0, POP_MAX:null,
      FEATURECLA:'Admin-1 capital', CAPITAL_NOTE:city.name==='Krasnogorsk'?'Seat of Moscow Oblast government; the oblast has no official capital.':null,
    }});
  }
  data.features = data.features
    .filter((f) => f.properties.POP_MAX > 50000 || f.properties.ADM0CAP === 1 || firstLevelCapitalFor(f.properties))
    .map((f) => {
      const p = f.properties;
      const capitalOf = firstLevelCapitalFor(p);
      const firstLevel = capitalOf || (!FIRST_LEVEL_CAPITALS[p.ISO_A2] && ['Admin-1 capital','Admin-1 region capital'].includes(p.FEATURECLA));
      // National capitals get the endonym of their country's primary language
      // (Beijing→北京, Moscow→Москва), via the same NATIVE_LANG_COLUMN table
      // that drives country endonyms. Multilingual countries aren't in that
      // table, so their capitals get none — consistent with the endonym policy.
      if (p.ADM0CAP === 1 && (CAPITAL_NATIVE[p.NAME] || NATIVE_LANG_COLUMN[p.ADM0_A3])) {
        applyFeatureNative(
          p,
          CAPITAL_NATIVE[p.NAME] ?? { col: NATIVE_LANG_COLUMN[p.ADM0_A3], lang: nativeLangTag(p.ADM0_A3) },
        );
      }
      return {
        ...f,
        properties: {
          NAME: p.NAME,
          NAME_EN: p.NAME_EN,
          NAME_ZH: p.NAME_ZH,
          ADM0NAME: p.ADM0NAME,
          ADM1NAME: p.ADM1NAME,
          ISO_A2: p.ISO_A2,
          POP_MAX: p.POP_MAX,
          FEATURECLA: firstLevel ? 'Admin-1 capital' : (p.ADM0CAP === 1 ? p.FEATURECLA : 'Populated place'),
          CITY_ROLE: p.ADM0CAP === 1 ? 'National capital' : firstLevel ? 'First-level subdivision capital' : 'City',
          CAPITAL_OF: p.ADM0CAP === 1 ? [p.ADM0NAME] : capitalOf ?? (firstLevel ? [p.ADM1NAME] : []),
          SHOW_ADMIN1_CAPITAL: !!capitalOf && p.ADM0CAP !== 1,
          CAPITAL_NOTE: p.CAPITAL_NOTE ?? null,
          ADM0CAP: p.ADM0CAP,
          MEGACITY: p.MEGACITY,
          TIMEZONE: p.TIMEZONE,
          MIN_ZOOM: p.MIN_ZOOM,
          ...(p.name_native
            ? { name_native: p.name_native, name_native_lang: p.name_native_lang, NATIVE_ON_MAP: p.NATIVE_ON_MAP }
            : {}),
        },
      };
    });
  writeGeo('cities.geojson', data);
}

// Norway's first level is counties (fylker), but NE ships the pre-2018 set of 19.
// Map them to the current (2024) 15 counties. Svalbard/Bouvet are kept as-is so
// the Norway insets can still source them by name.
const NOR_COUNTY_TO_FYLKE = {
  Akershus: 'Akershus', Oslo: 'Oslo', 'Østfold': 'Østfold', Buskerud: 'Buskerud',
  Vestfold: 'Vestfold', Telemark: 'Telemark', Hedmark: 'Innlandet', Oppland: 'Innlandet',
  'Aust-Agder': 'Agder', 'Vest-Agder': 'Agder', Rogaland: 'Rogaland',
  Hordaland: 'Vestland', 'Sogn og Fjordane': 'Vestland', 'Møre og Romsdal': 'Møre og Romsdal',
  'Sør-Trøndelag': 'Trøndelag', 'Nord-Trøndelag': 'Trøndelag', Nordland: 'Nordland',
  Troms: 'Troms', Finnmark: 'Finnmark', Svalbard: 'Svalbard', 'Bouvet Island': 'Bouvet Island',
};

// Countries where NE's admin-1 is finer than the standard first level. Dissolve
// them up to a coarser key so the map shows the real ~15-20 first-level units
// (e.g. Tuscany, Île-de-France, Innlandet) instead of 100+ sub-units.
const DISSOLVE_CONFIG = {
  IT: { key: (p) => p.region, type: 'Region' },
  FR: { key: (p) => p.region, type: 'Region' },
  NO: { key: (p) => NOR_COUNTY_TO_FYLKE[p.name] || p.name, type: 'County' },
  // NE ships GB as 232 council-level units; its `region` field groups them into
  // the 9 English regions + Scotland/Wales/N. Ireland.
  GB: { key: (p) => p.region, type: 'Region' },
};

// Round coordinates to 4 decimals (~11 m — far below 10m-data resolution).
// Matters once admin1 covers every country: raw NE floats are 12+ decimals and
// polygon-clipping output is worse; rounding cuts the file size dramatically.
function roundCoords(coords) {
  if (typeof coords[0] === 'number') return [Math.round(coords[0] * 1e4) / 1e4, Math.round(coords[1] * 1e4) / 1e4];
  return coords.map(roundCoords);
}

function toMultiPolygon(geometry) {
  return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
}

// Merge a country's sub-units into first-level features by unioning the polygons
// that share a grouping key (cfg.key).
function dissolveByKey(features, cfg) {
  const groups = new Map();
  for (const f of features) {
    const key = cfg.key(f.properties) || f.properties.name;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  const out = [];
  for (const [region, fs] of groups) {
    const polys = fs.map((f) => toMultiPolygon(f.geometry));
    let merged;
    try {
      merged = polygonClipping.union(...polys);
    } catch (e) {
      console.warn(`  dissolve union failed for ${region}: ${e.message}`);
      merged = polys.flat();
    }
    out.push({
      type: 'Feature',
      geometry: { type: 'MultiPolygon', coordinates: merged },
      properties: {
        name: region,
        admin: fs[0].properties.admin,
        iso_a2: fs[0].properties.iso_a2,
        iso_3166_2: fs[0].properties.region_cod || null,
        type_en: cfg.type,
      },
    });
  }
  return out;
}

function processAdmin1() {
  const data = readRaw('admin1-raw.geojson');

  // Personal membership is applied after inset generation. Include territories
  // here too: knowing a region includes its available subdivision geometry.
  const kept = data.features.filter(f => {
    const iso = f.properties.iso_a2;
    return iso && iso.length === 2;
  });

  const byIso = new Map();
  for (const f of kept) {
    if (!byIso.has(f.properties.iso_a2)) byIso.set(f.properties.iso_a2, []);
    byIso.get(f.properties.iso_a2).push(f);
  }

  const features = [];
  for (const [iso, fs] of byIso) {
    if (DISSOLVE_CONFIG[iso]) {
      features.push(...dissolveByKey(fs, DISSOLVE_CONFIG[iso]));
    } else {
      for (const f of fs) {
        features.push({
          type: 'Feature',
          geometry: f.geometry,
          properties: {
            name: f.properties.name,
            admin: f.properties.admin,
            iso_a2: f.properties.iso_a2,
            iso_3166_2: f.properties.iso_3166_2,
            type_en: f.properties.type_en,
          },
        });
      }
    }
  }
  data.features = features.map((f, i) => ({
    ...f,
    id: i,
    geometry: { ...f.geometry, coordinates: roundCoords(f.geometry.coordinates) },
  }));
  writeGeo('admin1.geojson', data);
}

// One label point per country, so huge countries (Russia, China) don't get a
// duplicate label per internal map tile. Natural Earth ships hand-placed
// LABEL_X/LABEL_Y coordinates; fall back to largest-ring centroid without them.
// Curated "default focus region" for countries whose full legal extent includes
// distant detached parts that would make the mainland a speck on double-click.
// Default zoom is a cartographic decision; political status is separate — every
// other country uses its full geometry bbox (so archipelagos stay whole).
// Each entry is [west, south, east, north]. Seed of a future component model.
const DEFAULT_FOCUS = {
  USA: [-125.0, 24.4, -66.9, 49.4], // contiguous lower-48
  FRA: [-5.3, 41.3, 9.7, 51.2], // metropolitan France
  ESP: [-9.4, 35.0, 4.4, 43.9], // Iberia + Balearics + Ceuta/Melilla; drops Canaries
  PRT: [-9.6, 36.9, -6.1, 42.2], // mainland; drops Azores/Madeira
  ECU: [-81.2, -5.1, -75.0, 1.6], // mainland; drops Galápagos
  CHL: [-75.9, -56.0, -66.3, -17.4], // mainland; drops Easter Island
  NOR: [4.5, 57.8, 31.5, 71.3], // mainland; drops Svalbard/Jan Mayen/Bouvet
  NLD: [3.3, 50.7, 7.3, 53.7], // European Netherlands; drops Caribbean
  NZL: [166.3, -47.4, 178.7, -34.3], // North + South Islands; drops Chatham
  AUS: [112.8, -43.8, 153.8, -10.6], // mainland + Tasmania; drops Christmas/Cocos/Norfolk
  // These have no detached integral parts; the focus = the mainland and just
  // enables the "back to mainland" home box when viewing a dependency.
  GBR: [-8.7, 49.8, 1.9, 61.0], // Great Britain + Northern Ireland
  DNK: [8.0, 54.5, 15.3, 57.9], // metropolitan Denmark
  CHN: [73.6, 15.8, 134.8, 53.6], // mainland China
  FIN: [20.5, 59.7, 31.7, 70.2], // mainland Finland
};

// MAPCOLOR13 → fill (mirror of src/map/colors.ts) so insets match the map.
const COUNTRY_COLORS = {
  1: '#E0706B', 2: '#34B5A4', 3: '#4E92D4', 4: '#74C36B', 5: '#F2C744',
  6: '#B07ACB', 7: '#F0913C', 8: '#45CBDD', 9: '#B6C94A', 10: '#D873A0',
  11: '#8568C9', 12: '#F0928A', 13: '#4FBE7D',
};

// Inset components per country (curated; seed = USA). admin1 = pull from
// admin1.geojson by name; adm0 = pull from countries-10m by ADM0_A3.
const INSET_COUNTRIES = {
  USA: [
    { key: 'AK', name: 'Alaska', tier: 2, admin1: 'Alaska', legalStatus: 'U.S. state',
      description: 'The largest U.S. state by area — bought from Russia in 1867 for $7.2 million.' },
    { key: 'HI', name: 'Hawaii', tier: 2, admin1: 'Hawaii', legalStatus: 'U.S. state',
      // NE's Hawaii admin-1 stretches to the uninhabited leeward chain (~-178°);
      // fly to the main 8 islands instead so they fill the screen.
      flyToFix: [-160.3, 18.86, -154.7, 22.25],
      description: 'A volcanic archipelago in the Central Pacific; the 50th state, admitted in 1959.' },
    { key: 'PRI', name: 'Puerto Rico', tier: 3, adm0: 'PRI', legalStatus: 'Unincorporated U.S. territory (commonwealth)',
      description: 'The most populous U.S. territory (~3.2M). Residents are U.S. citizens but cannot vote in presidential elections.' },
    { key: 'VIR', name: 'U.S. Virgin Islands', tier: 3, adm0: 'VIR', legalStatus: 'Unincorporated U.S. territory',
      description: 'A Caribbean territory bought from Denmark in 1917 — St. Thomas, St. John, and St. Croix.' },
    { key: 'GUM', name: 'Guam', tier: 3, adm0: 'GUM', legalStatus: 'Unincorporated U.S. territory',
      description: 'A strategic island in Micronesia hosting major U.S. military bases.' },
    { key: 'ASM', name: 'American Samoa', tier: 3, adm0: 'ASM', legalStatus: 'Unincorporated U.S. territory', emphasize: true,
      description: 'The southernmost U.S. territory; people born here are U.S. nationals, not citizens by birth.' },
    { key: 'MNP', name: 'Northern Mariana Islands', tier: 3, adm0: 'MNP', legalStatus: 'U.S. commonwealth', emphasize: true,
      description: 'A commonwealth in the Western Pacific, centered on the island of Saipan.' },
    { key: 'UMI', name: 'U.S. Minor Outlying Islands', tier: 4, adm0: 'UMI', noFly: true,
      legalStatus: 'Unincorporated U.S. possessions',
      description: 'Nine small, mostly uninhabited islands across the Pacific and Caribbean: Baker, Howland, Jarvis, Johnston, Kingman, Midway, Palmyra, Wake, and Navassa.' },
  ],

  FRA: [
    // Tier 2 — overseas departments/regions (DROM): integral parts of France & the EU.
    // Pulled from the dissolved France admin-1 by region name.
    { key: 'GUF', name: 'French Guiana', tier: 2, admin1: 'Guyane française', legalStatus: 'Overseas department and region of France',
      description: 'On the northeast coast of South America — home to the Guiana Space Centre, the EU’s spaceport.' },
    { key: 'GLP', name: 'Guadeloupe', tier: 2, admin1: 'Guadeloupe', legalStatus: 'Overseas department and region of France',
      description: 'A Caribbean archipelago shaped like a butterfly; an integral part of France and the EU.' },
    { key: 'MTQ', name: 'Martinique', tier: 2, admin1: 'Martinique', legalStatus: 'Overseas department and region of France',
      description: 'A volcanic Caribbean island dominated by Mont Pelée.' },
    { key: 'REU', name: 'Réunion', tier: 2, admin1: 'Réunion', legalStatus: 'Overseas department and region of France',
      description: 'An island in the Indian Ocean east of Madagascar; the EU’s outermost region in that ocean.' },
    { key: 'MYT', name: 'Mayotte', tier: 2, admin1: 'Mayotte', legalStatus: 'Overseas department and region of France', emphasize: true,
      description: 'An island in the Mozambique Channel; France’s newest overseas department (2011).' },
    // Tier 3 — overseas collectivities (autonomous, varied status).
    { key: 'PYF', name: 'French Polynesia', tier: 3, adm0: 'PYF', legalStatus: 'Overseas Collectivity of France', emphasize: true,
      description: 'An autonomous collectivity of 118 islands across the South Pacific, including Tahiti.' },
    { key: 'NCL', name: 'New Caledonia', tier: 3, adm0: 'NCL', legalStatus: 'Special Autonomous Collectivity of France',
      description: 'A South Pacific archipelago with a unique self-governing status and a path toward possible independence.' },
    { key: 'SPM', name: 'St. Pierre & Miquelon', tier: 3, adm0: 'SPM', legalStatus: 'Overseas Collectivity of France',
      description: 'A small archipelago off Newfoundland — the last remnant of New France in North America.' },
    { key: 'WLF', name: 'Wallis & Futuna', tier: 3, adm0: 'WLF', legalStatus: 'Overseas Collectivity of France', emphasize: true,
      description: 'A Polynesian collectivity in the South Pacific governed alongside three traditional kingdoms.' },
    { key: 'BLM', name: 'Saint-Barthélemy', tier: 3, adm0: 'BLM', legalStatus: 'Overseas Collectivity of France', emphasize: true,
      description: 'A small, affluent Caribbean island that left Guadeloupe to become its own collectivity in 2007.' },
    { key: 'MAF', name: 'Saint-Martin', tier: 3, adm0: 'MAF', legalStatus: 'Overseas Collectivity of France', emphasize: true,
      description: 'The French northern half of the island of Saint Martin, shared with Dutch Sint Maarten.' },
    // Tier 4 — remote, (near-)uninhabited.
    { key: 'ATF', name: 'French Southern & Antarctic Lands', tier: 4, adm0: 'ATF', legalStatus: 'Overseas territory of France',
      description: 'Scattered sub-Antarctic islands (Kerguelen, Crozet…) plus a claimed slice of Antarctica — only research staff live there.' },
    { key: 'CLP', name: 'Clipperton Island', tier: 4, adm0: 'CLP', legalStatus: 'Overseas state private property of France', emphasize: true,
      description: 'An uninhabited coral atoll in the eastern Pacific — France’s only atoll.' },
  ],

  NLD: [
    // Tier 2 — Caribbean Netherlands (BES): special municipalities of the Netherlands proper.
    { key: 'BES', name: 'Caribbean Netherlands', tier: 2, adm0: 'NLD',
      clip: [-68.5, 11.9, -62.9, 17.7], flyToFix: [-68.5, 12.0, -68.1, 12.35], emphasize: true,
      legalStatus: 'Special municipalities of the Netherlands',
      description: 'Bonaire, Sint Eustatius, and Saba — three Caribbean islands that are part of the Netherlands proper.' },
    // Tier 3 — constituent countries of the Kingdom of the Netherlands.
    { key: 'ABW', name: 'Aruba', tier: 3, adm0: 'ABW', legalStatus: 'Constituent country of the Kingdom of the Netherlands',
      description: 'A self-governing country of the Kingdom off the coast of Venezuela.' },
    { key: 'CUW', name: 'Curaçao', tier: 3, adm0: 'CUW', legalStatus: 'Constituent country of the Kingdom of the Netherlands',
      description: 'The largest of the Dutch Caribbean countries, with a strong autonomy.' },
    { key: 'SXM', name: 'Sint Maarten', tier: 3, adm0: 'SXM', legalStatus: 'Constituent country of the Kingdom of the Netherlands', emphasize: true,
      description: 'The Dutch southern half of Saint Martin, shared with French Saint-Martin.' },
  ],

  NOR: [
    // Tier 2 — integral Arctic territories.
    { key: 'SJ', name: 'Svalbard', tier: 2, admin1: 'Svalbard', legalStatus: 'Integral part of Norway (Svalbard Treaty)',
      description: 'A high-Arctic archipelago governed by the 1920 Svalbard Treaty, open to all signatory nations for commerce.' },
    { key: 'JAN', name: 'Jan Mayen', tier: 2, adm0: 'NOR', clip: [-9.2, 70.7, -7.7, 71.25], flyToFix: [-9.2, 70.7, -7.7, 71.25], emphasize: true,
      legalStatus: 'Integral part of Norway',
      description: 'A remote volcanic island in the Arctic Ocean, home only to military and meteorological staff.' },
    // Tier 4 — uninhabited dependency.
    { key: 'BVT', name: 'Bouvet Island', tier: 4, admin1: 'Bouvet Island', legalStatus: 'Dependency of Norway', emphasize: true,
      description: 'A glacier-covered sub-Antarctic island — one of the most remote places on Earth.' },
  ],

  ECU: [
    // Tier 2 — Galápagos: a province of Ecuador, extracted from the mainland geometry.
    { key: 'GAL', name: 'Galápagos Islands', tier: 2, adm0: 'ECU',
      clip: [-91.8, -1.5, -89.0, 0.8], flyToFix: [-91.8, -1.5, -89.0, 0.8], emphasize: true,
      legalStatus: 'Province of Ecuador',
      description: 'A volcanic archipelago ~1,000 km off the mainland whose wildlife inspired Darwin’s theory of evolution.' },
  ],

  GBR: [
    // Tier 3 — inhabited British Overseas Territories.
    { key: 'GIB', name: 'Gibraltar', tier: 3, adm0: 'GIB', legalStatus: 'British Overseas Territory', emphasize: true,
      description: 'A strategic rocky headland at the entrance to the Mediterranean, held by Britain since 1713.' },
    { key: 'BMU', name: 'Bermuda', tier: 3, adm0: 'BMU', legalStatus: 'British Overseas Territory', emphasize: true,
      description: 'An affluent North Atlantic island group ~1,000 km off the U.S. east coast.' },
    { key: 'CYM', name: 'Cayman Islands', tier: 3, adm0: 'CYM', legalStatus: 'British Overseas Territory', emphasize: true,
      description: 'A Caribbean territory and major offshore financial centre.' },
    { key: 'VGB', name: 'British Virgin Islands', tier: 3, adm0: 'VGB', legalStatus: 'British Overseas Territory', emphasize: true,
      description: 'A Caribbean archipelago east of Puerto Rico, a popular sailing destination.' },
    { key: 'TCA', name: 'Turks & Caicos', tier: 3, adm0: 'TCA', legalStatus: 'British Overseas Territory', emphasize: true,
      description: 'A low-lying Caribbean archipelago southeast of the Bahamas.' },
    { key: 'AIA', name: 'Anguilla', tier: 3, adm0: 'AIA', legalStatus: 'British Overseas Territory', emphasize: true,
      description: 'A small flat Caribbean island in the northern Leeward Islands.' },
    { key: 'MSR', name: 'Montserrat', tier: 3, adm0: 'MSR', legalStatus: 'British Overseas Territory', emphasize: true,
      description: 'A Caribbean island half-buried by the still-active Soufrière Hills volcano.' },
    { key: 'FLK', name: 'Falkland Islands', tier: 3, adm0: 'FLK', legalStatus: 'British Overseas Territory',
      description: 'A South Atlantic archipelago east of Argentina, the focus of the 1982 war.' },
    { key: 'SHN', name: 'St Helena, Ascension & Tristan da Cunha', tier: 3, adm0: 'SHN', legalStatus: 'British Overseas Territory',
      description: 'Three remote South Atlantic island groups — Napoleon’s final exile was on St Helena.' },
    { key: 'PCN', name: 'Pitcairn Islands', tier: 3, adm0: 'PCN', legalStatus: 'British Overseas Territory',
      description: 'A tiny South Pacific group settled by the Bounty mutineers; ~40 inhabitants.' },
    // Tier 3 — Crown Dependencies (possessions of the Crown, not part of the UK).
    { key: 'IMN', name: 'Isle of Man', tier: 3, adm0: 'IMN', legalStatus: 'British Crown Dependency', emphasize: true,
      description: 'A self-governing island in the Irish Sea with its own ancient parliament, Tynwald.' },
    { key: 'JEY', name: 'Jersey', tier: 3, adm0: 'JEY', legalStatus: 'British Crown Dependency', emphasize: true,
      description: 'The largest Channel Island, off the coast of Normandy.' },
    { key: 'GGY', name: 'Guernsey', tier: 3, adm0: 'GGY', legalStatus: 'British Crown Dependency', emphasize: true,
      description: 'A Channel Island bailiwick off the coast of Normandy.' },
    // Tier 4 — uninhabited / base areas.
    { key: 'IOT', name: 'British Indian Ocean Territory', tier: 4, adm0: 'IOT', legalStatus: 'British Overseas Territory', emphasize: true,
      description: 'The Chagos Archipelago, hosting the joint UK–US base on Diego Garcia.' },
    { key: 'SGS', name: 'South Georgia & South Sandwich Is.', tier: 4, adm0: 'SGS', legalStatus: 'British Overseas Territory',
      description: 'Sub-Antarctic islands with no permanent population, only research and support staff.' },
    { key: 'WSB', name: 'Akrotiri', tier: 4, adm0: 'WSB', legalStatus: 'Sovereign Base Area (UK)', emphasize: true,
      description: 'A British military base area on Cyprus retained at independence in 1960.' },
    { key: 'ESB', name: 'Dhekelia', tier: 4, adm0: 'ESB', legalStatus: 'Sovereign Base Area (UK)', emphasize: true,
      description: 'A British military base area on Cyprus retained at independence in 1960.' },
  ],

  AUS: [
    // Tier 3 — inhabited external territories.
    { key: 'NFK', name: 'Norfolk Island', tier: 3, adm0: 'NFK', legalStatus: 'External territory of Australia', emphasize: true,
      description: 'A small South Pacific island once used as a penal colony, settled partly by Bounty descendants.' },
    { key: 'IOA', name: 'Christmas & Cocos (Keeling) Islands', tier: 3, adm0: 'IOA', legalStatus: 'External territories of Australia', emphasize: true,
      description: 'Australia’s Indian Ocean territories — Christmas Island’s red-crab migration is world-famous.' },
    // Tier 4 — uninhabited.
    { key: 'CSI', name: 'Coral Sea Islands', tier: 4, adm0: 'CSI', legalStatus: 'External territory of Australia', emphasize: true,
      description: 'Scattered uninhabited reefs and cays northeast of Queensland.' },
    { key: 'HMD', name: 'Heard & McDonald Islands', tier: 4, adm0: 'HMD', legalStatus: 'External territory of Australia', emphasize: true,
      description: 'Subantarctic volcanic islands with Australia’s only active volcano; no permanent residents.' },
    { key: 'ATC', name: 'Ashmore & Cartier Islands', tier: 4, adm0: 'ATC', legalStatus: 'External territory of Australia', emphasize: true,
      description: 'Uninhabited Indian Ocean islets off the northwest coast.' },
  ],

  DNK: [
    // Tier 3 — autonomous countries of the Kingdom of Denmark.
    { key: 'GRL', name: 'Greenland', tier: 3, adm0: 'GRL', legalStatus: 'Autonomous territory of the Kingdom of Denmark',
      description: 'The world’s largest island, self-governing since 2009, mostly covered by ice sheet.' },
    { key: 'FRO', name: 'Faroe Islands', tier: 3, adm0: 'FRO', legalStatus: 'Autonomous territory of the Kingdom of Denmark', emphasize: true,
      description: 'A self-governing North Atlantic archipelago between Scotland and Iceland.' },
  ],

  CHN: [
    // Tier 3 — Special Administrative Regions ("one country, two systems").
    { key: 'HKG', name: 'Hong Kong', tier: 3, adm0: 'HKG', legalStatus: 'Special Administrative Region of China', emphasize: true,
      description: 'A former British colony returned in 1997; a global financial hub with its own legal system.' },
    { key: 'MAC', name: 'Macau', tier: 3, adm0: 'MAC', legalStatus: 'Special Administrative Region of China', emphasize: true,
      description: 'A former Portuguese colony returned in 1999, now the world’s largest gambling centre.' },
  ],

  NZL: [
    // Tier 2 — integral part of New Zealand.
    { key: 'CHA', name: 'Chatham Islands', tier: 2, adm0: 'NZL',
      clip: [-177.1, -44.5, -176.0, -43.5], flyToFix: [-177.1, -44.5, -176.0, -43.5], emphasize: true,
      legalStatus: 'Territory of New Zealand',
      description: 'A small archipelago ~800 km east of the South Island, the first inhabited land to see each new day.' },
    // Tier 3 — self-governing states in free association with New Zealand.
    { key: 'COK', name: 'Cook Islands', tier: 3, adm0: 'COK', legalStatus: 'Associated state of New Zealand', emphasize: true,
      description: 'A self-governing South Pacific nation in free association with New Zealand.' },
    { key: 'NIU', name: 'Niue', tier: 3, adm0: 'NIU', legalStatus: 'Associated state of New Zealand', emphasize: true,
      description: 'One of the world’s largest raised coral atolls, self-governing in association with New Zealand.' },
  ],

  ESP: [
    // Tier 2 — autonomous community in the Atlantic, integral part of Spain & the EU.
    { key: 'CNY', name: 'Canary Islands', tier: 2, adm0: 'ESP',
      clip: [-18.3, 27.4, -13.3, 29.5], flyToFix: [-18.3, 27.4, -13.3, 29.5], emphasize: true,
      legalStatus: 'Autonomous community of Spain',
      description: 'A volcanic archipelago off northwest Africa — an outermost region of the EU.' },
  ],

  PRT: [
    // Tier 2 — autonomous regions, integral parts of Portugal & the EU.
    { key: 'AZO', name: 'Azores', tier: 2, adm0: 'PRT',
      clip: [-31.5, 36.8, -24.9, 39.8], flyToFix: [-31.5, 36.8, -24.9, 39.8], emphasize: true,
      legalStatus: 'Autonomous region of Portugal',
      description: 'A mid-Atlantic volcanic archipelago, the westernmost point of Europe.' },
    { key: 'MAD', name: 'Madeira', tier: 2, adm0: 'PRT',
      clip: [-17.4, 32.3, -16.2, 33.2], flyToFix: [-17.4, 32.3, -16.2, 33.2], emphasize: true,
      legalStatus: 'Autonomous region of Portugal',
      description: 'A subtropical Atlantic island famed for its fortified wine and steep terrain.' },
  ],

  CHL: [
    // Tier 2 — special territory of Chile in the South Pacific.
    { key: 'RAP', name: 'Easter Island', tier: 2, adm0: 'CHL',
      clip: [-109.6, -27.3, -109.1, -26.9], flyToFix: [-109.6, -27.3, -109.1, -26.9], emphasize: true,
      legalStatus: 'Special territory of Chile',
      description: 'Rapa Nui — one of the most remote inhabited islands on Earth, famed for its moai statues.' },
  ],

  FIN: [
    // Tier 2 — autonomous, demilitarised, Swedish-speaking region of Finland.
    { key: 'ALD', name: 'Åland Islands', tier: 2, adm0: 'ALD', emphasize: true,
      legalStatus: 'Autonomous region of Finland',
      description: 'A Swedish-speaking, demilitarised archipelago between Finland and Sweden.' },
  ],
};

// Project a feature's geometry to a normalized SVG path (outer rings of all
// polygons), antimeridian-aware, with a cos(lat) aspect correction so shapes
// aren't horizontally stretched at high latitudes (e.g. Alaska).
function geomToSvg(geometry, clip) {
  let rings = [];
  if (geometry.type === 'Polygon') rings.push(geometry.coordinates[0]);
  else if (geometry.type === 'MultiPolygon') for (const poly of geometry.coordinates) rings.push(poly[0]);
  if (!rings.length) return null;

  // Clip to a bbox (e.g. Hawaii's main islands) so a detached chain doesn't
  // shrink the visible shape. Keep rings with any vertex inside the box.
  if (clip) {
    const [cw, cs, ce, cn] = clip;
    const kept = rings.filter((r) => r.some((p) => p[0] >= cw && p[0] <= ce && p[1] >= cs && p[1] <= cn));
    if (kept.length) rings = kept;
  }

  let minLon = Infinity, maxLon = -Infinity;
  for (const r of rings) for (const p of r) { if (p[0] < minLon) minLon = p[0]; if (p[0] > maxLon) maxLon = p[0]; }
  const shift = maxLon - minLon > 180;
  const nx = (x) => (shift && x < 0 ? x + 360 : x);

  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (const r of rings) for (const p of r) {
    const X = nx(p[0]);
    if (X < xMin) xMin = X; if (X > xMax) xMax = X;
    if (p[1] < yMin) yMin = p[1]; if (p[1] > yMax) yMax = p[1];
  }
  const aspect = Math.max(0.15, Math.cos(((yMin + yMax) / 2) * Math.PI / 180));
  const geoW = (xMax - xMin) * aspect, geoH = yMax - yMin;
  const PAD = 2, SIZE = 100;
  const scale = (SIZE - 2 * PAD) / Math.max(geoW, geoH, 1e-6);
  const viewW = Math.round(geoW * scale + 2 * PAD);
  const viewH = Math.round(geoH * scale + 2 * PAD);
  // Integer pixel rounding (1px resolution at this size) collapses fine
  // coastline detail and sub-pixel islands — keeps the path tiny.
  const proj = (x, y) => [
    Math.round(PAD + (nx(x) - xMin) * aspect * scale),
    Math.round(PAD + (yMax - y) * scale),
  ];

  let d = '';
  for (const r of rings) {
    let seg = '', prev = null;
    for (const p of r) {
      const [px, py] = proj(p[0], p[1]);
      if (prev && prev[0] === px && prev[1] === py) continue;
      seg += (seg ? 'L' : 'M') + px + ' ' + py + ' ';
      prev = [px, py];
    }
    if (seg.includes('L')) d += seg + 'Z ';
  }
  return { svgPath: d.trim(), viewW, viewH };
}

// "Home" box: the core/mainland region, used to navigate back from a territory.
const HOME_LABEL = {
  USA: 'Contiguous U.S.', FRA: 'Metropolitan France', NLD: 'European Netherlands',
  NOR: 'Mainland Norway', ECU: 'Mainland Ecuador',
  GBR: 'Great Britain', ESP: 'Mainland Spain', PRT: 'Mainland Portugal',
  DNK: 'Denmark', AUS: 'Mainland Australia', CHN: 'Mainland China',
  NZL: 'Mainland New Zealand', CHL: 'Mainland Chile', FIN: 'Mainland Finland',
};
const HOME_DESC = {
  USA: 'The 48 contiguous states plus D.C. — the U.S. mainland.',
  FRA: 'European France — the mainland often called l’Hexagone.',
  NLD: 'The European part of the Kingdom of the Netherlands.',
  NOR: 'Mainland Norway on the Scandinavian Peninsula.',
  ECU: 'Continental Ecuador on the Pacific coast of South America.',
  GBR: 'Great Britain and Northern Ireland — the United Kingdom’s home nations.',
  ESP: 'Peninsular Spain on the Iberian Peninsula.',
  PRT: 'Mainland Portugal on the Iberian Peninsula.',
  DNK: 'Metropolitan Denmark in northern Europe.',
  AUS: 'The Australian mainland and Tasmania.',
  CHN: 'Mainland China in East Asia.',
  NZL: 'The North and South Islands of New Zealand.',
  CHL: 'Continental Chile along South America’s Pacific coast.',
  FIN: 'Mainland Finland in northern Europe.',
};

function buildInsets() {
  const countries = readGeo('countries-10m.geojson');
  const admin1 = readGeo('admin1.geojson');
  const findAdm0 = (code) => countries.features.find((f) => f.properties.ADM0_A3 === code);
  const findAdmin1 = (name) => admin1.features.find((f) => f.properties.name === name);

  const out = {};
  for (const [adm0, comps] of Object.entries(INSET_COUNTRIES)) {
    const parent = findAdm0(adm0);
    const fill = COUNTRY_COLORS[parent?.properties.MAPCOLOR13] || '#CCCCCC';
    const parentName = NAME_OVERRIDES[adm0]?.name || parent?.properties.NAME || adm0;

    const built = comps.map((c) => {
      const feat = c.admin1 ? findAdmin1(c.admin1) : findAdm0(c.adm0);
      if (!feat) { console.warn(`  inset: missing geometry for ${adm0}/${c.key}`); return null; }
      const clip = c.clip || c.flyToFix; // crop the drawn shape to the part that matters
      const svg = geomToSvg(feat.geometry, clip);
      // For a component cut out of its parent's geometry (clip/flyToFix), fly &
      // center on that region — not the whole parent. Otherwise use its own bbox.
      const refBox = c.flyToFix || c.clip || countryBbox(feat.geometry);
      const center = [(refBox[0] + refBox[2]) / 2, (refBox[1] + refBox[3]) / 2];
      return {
        key: c.key, name: c.name, tier: c.tier, fill, emphasize: !!c.emphasize,
        badge: c.legalStatus, description: c.description,
        // ADM0_A3 of the separate feature this component came from (null for
        // clip-derived parts of the parent) — used to highlight all territories.
        srcAdm0: c.adm0 && c.adm0 !== adm0 ? c.adm0 : null,
        svgPath: svg?.svgPath || '', viewW: svg?.viewW || 100, viewH: svg?.viewH || 100,
        flyTo: c.noFly ? null : refBox, center,
      };
    }).filter(Boolean);

    // Full legal extent: antimeridian-aware union of every component box (incl.
    // the UMI-style noFly ones via their feature bbox) + the mainland focus box.
    const allBoxes = [];
    if (DEFAULT_FOCUS[adm0]) allBoxes.push(DEFAULT_FOCUS[adm0]);
    for (const c of comps) {
      const feat = c.admin1 ? findAdmin1(c.admin1) : findAdm0(c.adm0);
      if (!feat) continue;
      allBoxes.push(c.flyToFix || c.clip || countryBbox(feat.geometry));
    }
    const fullBbox = unionBoxes(allBoxes);

    // Prepend a "back to mainland" box drawn from the core focus region.
    const focusBox = DEFAULT_FOCUS[adm0];
    if (parent && focusBox) {
      const svg = geomToSvg(parent.geometry, focusBox);
      built.unshift({
        key: 'HOME', name: HOME_LABEL[adm0] || `Mainland ${parentName}`, tier: 0, fill,
        emphasize: false, homeNav: true, badge: parentName,
        description: HOME_DESC[adm0] || `The mainland of ${parentName}.`,
        // Union of mainland + every territory box — for the "full extent" view.
        fullExtent: fullBbox,
        svgPath: svg?.svgPath || '', viewW: svg?.viewW || 100, viewH: svg?.viewH || 100,
        flyTo: focusBox, center: [(focusBox[0] + focusBox[2]) / 2, (focusBox[1] + focusBox[3]) / 2],
      });
    }
    out[adm0] = built;
  }
  writeGeo('insets.json', out);
}

// One label per major ocean, placed near the centre of each. Replaces the old
// repeated literal "Ocean" labels.
const OCEAN_LABELS = [
  { name: 'Pacific Ocean', coordinates: [-145, 0] },
  { name: 'Atlantic Ocean', coordinates: [-28, 2] },
  { name: 'Indian Ocean', coordinates: [76, -26] },
  { name: 'Arctic Ocean', coordinates: [10, 82] },
  { name: 'Southern Ocean', coordinates: [20, -62] },
];
function buildOceanLabels() {
  writeGeo('ocean-labels.geojson', {
    type: 'FeatureCollection',
    features: OCEAN_LABELS.map((o) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: o.coordinates },
      properties: { name: o.name },
    })),
  });
}

// One label point per named sea/gulf/strait — symbol layers on the big marine
// polygons would otherwise repeat the name once per internal tile (the
// "five Mediterranean Seas" bug, same as Russia's duplicate country labels).
function buildSeaLabels() {
  const data = readGeo('seas.geojson');
  const best = new Map(); // name -> {feature, ringLen}
  for (const f of data.features) {
    const name = f.properties.name;
    if (!name) continue;
    const ring = largestRing(f.geometry);
    if (!ring) continue;
    const cur = best.get(name);
    if (!cur || ring.length > cur.ringLen) best.set(name, { f, ring, ringLen: ring.length });
  }
  const points = [...best.values()].map(({ f, ring }) => {
    // Curated seas can pin their label point (a clipped bay's vertex-average
    // centroid drifts toward the crenellated coast side); else use the centroid.
    let coords;
    if (f.properties.label_lon != null) {
      coords = [f.properties.label_lon, f.properties.label_lat];
    } else {
      let x = 0, y = 0;
      for (const c of ring) { x += c[0]; y += c[1]; }
      coords = [x / ring.length, y / ring.length];
    }
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: coords },
      properties: {
        name: f.properties.name,
        scalerank: f.properties.scalerank ?? 5,
        featurecla: f.properties.featurecla,
        selection_name: f.properties.selection_name,
        water_parent: f.properties.water_parent, water_path: f.properties.water_path,
        water_depth: f.properties.water_depth, water_children: f.properties.water_children,
      },
    };
  });
  writeGeo('sea-labels.geojson', { type: 'FeatureCollection', features: points });
}

// Curated marine polygons for named waters Natural Earth's 50m marine layer omits.
// Without a polygon a body of water has no label AND a click falls through to the
// open ocean, which gets named by nearest ocean-label point — so clicking the Sea
// of Azov currently reports "Arctic Ocean". The smallest overlapping sea wins a
// click, so a gulf nested in a sea resolves to the gulf. `curated: true` makes
// enrichSeas idempotent across re-runs.
//
// `ring` is a DELIBERATELY GENEROUS outline that covers the water AND spills onto
// the surrounding land — enrichSeas subtracts the real 10m coastline from it, so
// the drawn boundary snaps to the true coast and only the seaward "mouth" stays a
// straight line. This makes adding nook-and-cranny bays NE omits (Delaware Bay,
// etc.) a matter of a rough 5-point sketch, not hand-tracing a coastline. `labelAt`
// pins the label point (the clipped polygon's centroid can drift on a curvy coast).
// Bay mouths are generalized editorial limits, not maritime legal boundaries.
// References: doi:10.1371/journal.pone.0050722 (Bohai's three bays),
// doi:10.3390/w13121702 (upper Gulf of Thailand: Hua Hin–Ko Samaesarn),
// NGA Sailing Directions Pub.157, sector 6 (Hangzhou Wan entrances).
const SEA_ADD = [
  // Geographic gulf limits; these do not depict territorial-water claims.
  {name:'Gulf of Taranto',featurecla:'gulf',scalerank:4,labelAt:[17.35,40.05],keepLabelComponent:true,
    coastBetween:{country:'ITA',entrance:[[17.206391,39.029486],[18.368337,39.796617]]}},
  // Broad Norman–Breton gulf: offshore bow includes the Channel Islands.
  {name:'Gulf of Saint-Malo',featurecla:'gulf',scalerank:5,labelAt:[-2.35,48.95],keepLabelComponent:true,
    ring:[[-3.116444,48.874091],[-3.15,49.55],[-2.1,49.8],[-1.939565,49.716457],[-1.2,49.4],[-1.2,48.3],[-3.4,48.3],[-3.116444,48.874091]]},
  // Generalized offshore limits; the original 10m land supplies every shoreline.
  // Restore the parent cape-to-cape envelope instead of its old São Tomé shortcut.
  {name:'Gulf of Guinea',featurecla:'gulf',scalerank:2,labelAt:[2,3],keepLabelComponent:true,
    ring:[[-7.72,4.36],[8.709271,-.629817],[12,-1],[12,8],[-8,8],[-7.72,4.36]]},
  {name:'Bight of Benin',featurecla:'gulf',scalerank:4,labelAt:[3.3,5.8],keepLabelComponent:true,
    ring:[[.982233,5.816680],[6.093969,4.281211],[7,5],[6,7],[.4,7],[.982233,5.816680]]},
  {name:'Bight of Bonny',featurecla:'gulf',scalerank:4,labelAt:[8.2,2.5],keepLabelComponent:true,
    ring:[[6.093969,4.281211],[8.709271,-.629817],[11,-1],[11,3],[10,5],[7,6],[6.093969,4.281211]]},
  {name:'Corisco Bay',featurecla:'bay',scalerank:6,labelAt:[9.45,.95],keepLabelComponent:true,
    ring:[[9.34669,1.181708],[9.05,1.1],[9.05,.75],[9.307899,.600876],[9.9,.5],[10,1.4],[9.34669,1.181708]]},
  {name:'Gulf of Lion',featurecla:'gulf',scalerank:4,labelAt:[4.2,43.0],keepLabelComponent:true,
    ring:[[3.317719,42.322984],[5.856605,43.044829],[6.1,43.4],[5,44],[3,44],[2.5,42.5],[3.317719,42.322984]]},

  {name:'Gulf of Suez',featurecla:'gulf',scalerank:4,labelAt:[33.05,28.65],keepLabelComponent:true,
    ring:[[33.65,27.45],[34.033333,27.45],[34.25,27.716667],[34.4,28],[33.7,29.6],[32.6,30.2],[32.1,30.1],[32.1,29.4],[33,28],[33.65,27.45]]},
  {name:'Gulf of Aqaba',featurecla:'gulf',scalerank:4,labelAt:[34.75,29.15],keepLabelComponent:true,
    ring:[[34.35,27.913889],[34.55,27.913889],[34.583333,27.969444],[34.619974,28.031181],[34.75,28.2],[35.4,29.65],[34.8,29.8],[34.3,29.5],[34,28.5],[34.35,27.913889]]},


  {name:'Taman Bay', featurecla:'bay', scalerank:6, labelAt:[36.78,45.27],
    coastBetween:{country:'RUS',entrance:[[36.687999,45.331488],[36.594737,45.20482]]}, keepLabelComponent:true},
  {name:'Dnieper-Bug Estuary', featurecla:'estuary', scalerank:5, labelAt:[31.99,46.64],
    ring:[[31.53,46.61],[31.51,46.53],[32.4,46.3],[32.8,46.7],[32.5,47.0],[32.2,46.99],[31.8,46.99],[31.53,46.61]], keepLabelComponent:true},
  {name:'Burgas Bay', featurecla:'bay', scalerank:6, labelAt:[27.6,42.5],
    coastBetween:{country:'BGR',entrance:[[27.892263,42.710517],[27.699067,42.413886]]}, keepLabelComponent:true},
  {name:'Gulf of Odessa', featurecla:'gulf', scalerank:6, labelAt:[30.83,46.47],
    coastBetween:{country:'UKR',entrance:[[30.772472,46.39643],[31.054535,46.612738]]}, keepLabelComponent:true},
  {name:'Karkinit Bay', featurecla:'bay', scalerank:5, labelAt:[32.8,45.85],
    ring:[[31.53,46.23],[32.49,45.34],[32.6,45.42],[33.2,45.5],[34.1,45.7],[34.1,46.6],[32.2,46.7],[31.53,46.23]], keepLabelComponent:true},
  {name:'Kalamita Bay', featurecla:'bay', scalerank:6, labelAt:[33.42,45.0],
    ring:[[33.28,45.16],[33.55,44.84],[33.9,44.8],[33.9,45.4],[33.2,45.4],[33.28,45.16]], keepLabelComponent:true},
  {name:'Taganrog Bay', featurecla:'bay', scalerank:5, labelAt:[38.5,46.9],
    ring:[[37.335216,46.882473],[37.737559,46.676337],[38.2,46.3],[39.6,46.6],[39.8,47.5],[38.4,47.6],[37.1,47.1],[37.335216,46.882473]], keepLabelComponent:true},

  // Gujarat gulfs: detailed Indian coastline, with only the seaward mouth closed.
  // Khambhat uses the Gopnath–Daman entrance convention (NCCR gulf profile).
  { name: 'Gulf of Khambhat', featurecla: 'gulf', scalerank: 5, labelAt: [72.4,21.6],
    coastBetween: {country:'IND', entrance:[[72.104747,21.205064],[72.82309,20.416815]]}, keepLabelComponent: true },
  { name: 'Gulf of Kutch', featurecla: 'gulf', scalerank: 4, labelAt: [69.6,22.6],
    coastBetween: {country:'IND', entrance:[[68.866222,23.019965],[68.992931,22.431586]]}, keepLabelComponent: true },

  // NOAA/IHO maps Palk Strait with adjoining Palk Bay: close at Point
  // Calimere–Point Pedro and Adam's Bridge, then keep the connected basin.
  { name: 'Palk Strait', featurecla: 'strait', scalerank: 5, labelAt: [79.75,10.05],
    ring: [[78.5,8.5],[80.8,8.5],[80.8,10.7],[78.5,10.7],[78.5,8.5]],
    entrances: [[[79.875,10.291667],[80.25,9.825]],[[79.435,9.171],[79.724,9.103]]], keepLabelComponent: true },
  // Krasnovodsk/Türkmenbaşy Bay: the entrance is between the western spits;
  // generous inland vertices include the eastern Balkan embayment.
  { name: 'Türkmenbaşy Gulf', featurecla: 'gulf', scalerank: 5, labelAt: [53.2,39.85],
    coastBetween: {country:'TKM', entrance:[[53.04005,39.742011],[53.27589,39.664862]]}, keepLabelComponent: true },

  // NOAA/IHO entrance lines: Trafalgar–Spartel (west), Europa–Almina (east).
  // Other vertices lie inland; the detailed coastline cuts the actual shores.
  { name: 'Strait of Gibraltar', featurecla: 'strait', scalerank: 4, labelAt: [-5.65,35.96],
    ring: [[-6.033333,36.183333],[-5.923333,35.793333],[-5.9,35.6],[-5.5,35.6],[-5.4,35.8],[-5.282222,35.898056],[-5.344444,36.110556],[-5.5,36.4],[-6.0,36.4],[-6.033333,36.183333]] },
  { name: 'Gulf of Cádiz', featurecla: 'gulf', scalerank: 4, labelAt: [-7.3,36.7],
    // Cape St Vincent–Cape Trafalgar offshore closing line.
    ring: [[-8.996,37.025],[-6.036,36.185],[-5.3,36.6],[-6.0,38.0],[-8.0,38.0],[-8.996,37.025]] },
  { name: 'Kerch Strait', featurecla: 'strait', scalerank: 5, labelAt: [36.57,45.30],
    // Takil Point–Panagia Point southern entrance; north into the Azov.
    ring: [[36.45,45.10],[36.6333,45.1333],[37.1,45.15],[37.1,45.35],[36.8,45.45],[36.62,45.45],[36.2,45.35],[36.45,45.10]] },
  // Kattegat proper: southern entrances between Hasenore/Gniben and
  // Gilbjerg Hoved/Kullen; the historic Skagen–Pater Noster northern line
  // shares the Natural Earth Skagerrak boundary.
  { name: 'Kattegat', featurecla: 'sea', scalerank: 4, labelAt: [11.2,56.9],
    ring: [[10.580833,57.736373],[11.256554,58.370313],[12.5,58.4],[13.0,56.7],[12.45,56.3],[12.3,56.13],[11.8,55.9],[11.5,55.8],[11.29,56.0],[10.36,56.14],[9.6,56.0],[9.8,57.2],[10.580833,57.736373]] },
  // Cantabrian is the coastal southern Bay of Biscay. The offshore limit is
  // generalized; Estaca de Bares is the western cape (Turismo de Galicia).
  { name: 'Cantabrian Sea', featurecla: 'sea', scalerank: 4, labelAt: [-4.2,44.0],
    ring: [[-7.69,43.79],[-7.69,44.7],[-1.5,44.7],[-1.1,43.5],[-2.0,42.8],[-7.8,43.0],[-7.69,43.79]] },
  // NOAA Tatarskiy Proliv southern entrance: Cape Belkina–Cape Kuznetsova;
  // the northern connection runs through Nevelskoy Strait to the Amur liman.
  { name: 'Strait of Tartary', featurecla: 'strait', scalerank: 4, labelAt: [140.8,49.4],
    ring: [[137.69,45.82],[142.08,46.03],[142.5,49.5],[142.2,53.4],[140.7,53.4],[139.4,50.2],[137.0,47.0],[137.69,45.82]] },
  // Penzhina's mouth: Cape Taygonos–Cape Bozhedomova. Inland edges are
  // deliberately generous so all branches are cut from the detailed coast.
  { name: 'Penzhina Bay', featurecla: 'bay', scalerank: 5, labelAt: [163.0,61.5],
    ring: [[160.1833,60.5667],[161.8833,60.3],[164.0,60.9],[166.2,62.7],[164.5,63.2],[161.0,62.0],[160.1833,60.5667]] },
  { name: 'Academy Bay', featurecla: 'bay', scalerank: 5, labelAt: [138.05,54.1],
    ring: [[137.733,54.317],[138.719249,54.317613],[139.1,54.0],[138.6,53.1],[137.0,53.1],[137.1,54.0],[137.733,54.317]] },
  { name: 'Gulf of Bangkok', featurecla: 'gulf', scalerank: 5, labelAt: [100.4, 13.0],
    ring: [[99.9,12.55],[100.95,12.55],[101.3,13.9],[99.5,14.0],[99.9,12.55]] },
  { name: 'Laizhou Bay', featurecla: 'bay', scalerank: 5, labelAt: [119.35,37.35],
    ring: [[118.85,38.1],[120.35,37.75],[120.0,36.7],[118.4,36.7],[118.85,38.1]] },
  { name: 'Bohai Bay', featurecla: 'bay', scalerank: 5, labelAt: [118.1,38.7],
    ring: [[119.0,39.25],[118.85,38.1],[117.0,37.7],[116.8,39.7],[119.0,39.25]] },
  { name: 'Liaodong Bay', featurecla: 'bay', scalerank: 5, labelAt: [121.0,40.15],
    ring: [[119.5,39.7],[121.65,39.1],[122.6,40.5],[121.8,41.3],[119.5,41.0],[119.5,39.7]] },
  { name: 'Hangzhou Bay', featurecla: 'bay', scalerank: 5, labelAt: [121.15,30.35],
    ring: [[121.95,30.9],[121.95,29.95],[121.5,29.7],[120.2,29.9],[120.1,30.5],[121.6,31.15],[121.95,30.9]] },
  {
    name: 'Sea of Azov', featurecla: 'sea', scalerank: 4, labelAt: [37.0, 46.1],
    // Keep every non-entrance edge inland: the old diagonal from Kerch
    // to Taganrog sliced off the southeastern sea and Kuban coastal bays.
    ring: [[34.6,45.1],[36.45,45.10],[36.6333,45.1333],[37.5,44.9],[39.2,45.5],[40.0,46.6],[40.0,47.6],[36.8,47.7],[34.5,46.8],[34.6,45.1]],
  },
  {
    name: 'Gulf of Martaban', featurecla: 'gulf', scalerank: 4, labelAt: [96.5, 16.0],
    // One offshore mouth across the delta–Mon coast; other edges lie inland.
    // Extend above the Sittaung estuary so the northern head is not cut off.
    ring: [[95.15, 15.65], [97.85, 15.2], [98.6, 16.5], [98.0, 18.3], [95.0, 18.3], [94.7, 16.5], [95.15, 15.65]],
  },
  {
    name: 'Delaware Bay', featurecla: 'gulf', scalerank: 5, labelAt: [-75.15, 39.15],
    // seaward mouth = Cape May Point -> Cape Henlopen (first two pts); DE shore up the west,
    // capped at Liston Point (bay/river line ~39.42), NJ shore down the east (juts W at Egg Island Pt)
    ring: [
      [-74.955, 38.93], [-75.09, 38.785], [-75.27, 38.88], [-75.36, 39.0], [-75.44, 39.12],
      [-75.46, 39.25], [-75.52, 39.36], [-75.56, 39.42], [-75.42, 39.42], [-75.34, 39.36],
      [-75.26, 39.3], [-75.15, 39.25], [-74.99, 39.2], [-74.85, 39.15], [-74.88, 39.05],
      [-74.92, 38.98], [-74.955, 38.93],
    ],
  },
  {
    name: 'Norton Sound', featurecla: 'bay', scalerank: 5, labelAt: [-162.5, 63.9],
    openInto: 'Bering Sea', // seaward (W) edge snaps to the Bering Sea's boundary
    // Ring EXTENDS WEST into the Bering Sea (the -166/-167 points) so subtracting
    // the sea trims the mouth to its exact border; other edges spill onto Alaska.
    ring: [[-166.5, 63.2], [-162.8, 62.2], [-159.8, 63.6], [-159.7, 64.7], [-161.5, 65.4], [-165.0, 65.3], [-167.0, 64.4], [-166.5, 63.2]],
  },
  {
    name: 'Long Island Sound', featurecla: 'bay', scalerank: 5, labelAt: [-72.9, 41.1],
    ring: [[-73.95, 40.75], [-73.2, 41.35], [-72.0, 41.35], [-72.1, 40.95], [-73.6, 40.8], [-73.95, 40.75]],
  },
  {
    name: 'Cape Cod Bay', featurecla: 'bay', scalerank: 6, labelAt: [-70.4, 41.9],
    ring: [[-70.75, 41.72], [-70.0, 41.68], [-69.95, 41.95], [-70.1, 42.12], [-70.65, 42.1], [-70.75, 41.72]],
  },
  {
    name: 'Gulf of Tomini', featurecla: 'gulf', scalerank: 4, labelAt: [122.0, -0.1],
    // seaward mouth = the Molucca Sea's exact closing line (first pt -> last pt); the rest traces
    // inland of the northern (Minahasa) peninsula, the western isthmus, and the eastern arm
    ring: [
      [123.4986, 0.3022], [123.2, 0.5], [122.0, 0.55], [120.8, 0.55], [120.2, 0.5],
      [119.94, 0.2], [119.94, -0.75], [120.2, -1.0], [120.6, -1.4], [121.2, -1.45],
      [121.7, -1.2], [122.2, -1.0], [122.7, -0.85], [123.2, -0.8], [123.4812, -0.7233],
      [123.4986, 0.3022],
    ],
  },
  {
    name: 'Kotzebue Sound', featurecla: 'bay', scalerank: 5, labelAt: [-162.5, 66.7],
    // seaward mouth = the Chukchi Sea's exact closing line (first two pts, so the two abut);
    // the rest traces firmly inland of the Seward Peninsula (W/S) and Baldwin Peninsula (E) shores
    ring: [[-163.757363, 67.230677], [-164.080677, 66.609966], [-164.15, 66.15], [-163.8, 65.9], [-162.5, 65.85], [-161.3, 65.9], [-161.25, 66.5], [-161.25, 66.95], [-161.8, 67.2], [-162.8, 67.4], [-163.757363, 67.230677]],
  },
  {
    name: 'East Siberian Sea', featurecla: 'sea', scalerank: 3, labelAt: [163.0, 73.0],
    ring: [[140.0, 73.0], [148.0, 69.5], [162.0, 69.0], [176.0, 68.5], [180.0, 71.0], [180.0, 76.5], [158.0, 77.0], [141.0, 76.0], [140.0, 73.0]],
  },
];

// Plain (antimeridian-naive) bbox of a geometry — only used to reject far-away
// land features before the expensive polygon difference, so looseness is fine.
function roundMarineCoordinates(coords) {
  return typeof coords[0] === 'number' ? coords.map(v=>Math.round(v*1e6)/1e6) : coords.map(roundMarineCoordinates);
}

function plainBbox(geom) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const scan = (rings) => { for (const ring of rings) for (const [x, y] of ring) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; } };
  if (geom.type === 'Polygon') scan(geom.coordinates);
  else if (geom.type === 'MultiPolygon') for (const p of geom.coordinates) scan(p);
  return [w, s, e, n];
}

// Carve a curated ring down to open water by subtracting the land it overlaps
// (10m coastline) AND any `extra` polygons (adjacent named seas — see `openInto`).
// Subtracting land makes the coastal edges hug the real shore; subtracting the
// neighbouring sea makes the seaward edge land EXACTLY on that sea's boundary, so
// a gulf and the sea it opens into abut with no gap (Norton Sound ↔ Bering Sea).
// Returns a Polygon/MultiPolygon of just the water.
function clipRingToWater(ring, land, landBb, extra = []) {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const [x, y] of ring) { if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
  const clippers = [];
  land.features.forEach((f, i) => {
    const [w, s, e, n] = landBb[i];
    if (e < minx || w > maxx || n < miny || s > maxy) return; // bbox reject
    if (f.geometry) clippers.push(f.geometry.coordinates);
  });
  for (const g of extra) if (g) clippers.push(g.coordinates); // adjacent sea(s) — see openInto
  if (!clippers.length) return { type: 'Polygon', coordinates: [ring] };
  let diff = polygonClipping.difference([ring], ...clippers); // -> MultiPolygon coords
  if (!diff.length) return null;
  // Drop clip slivers (tiny detached bits): keep only polygons >= 5% of the
  // largest one's area, so a bay is its single water body, not a scatter of specks.
  const area = (poly) => { const r = poly[0]; let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return Math.abs(a / 2); };
  const maxA = Math.max(...diff.map(area));
  diff = diff.filter((poly) => area(poly) >= 0.05 * maxA);
  const r4 = (n) => Math.round(n * 1e6) / 1e6;
  return { type: 'MultiPolygon', coordinates: diff.map((poly) => poly.map((rg) => rg.map(([x, y]) => [r4(x), r4(y)]))) };
}

// Refit generalized bay coasts to the exact land source used at close zoom.
// A narrow envelope captures coastal discrepancies without replacing offshore
// limits. Long straight segments are the bay mouths and remain unbuffered.
function refitBayCoast(geometry, land, landBb) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const pieces = polygons.map(poly => [poly[0]]); // island holes come from the detailed land below
  for (const poly of polygons) {
    const ring = poly[0];
    for (let i = 0; i < ring.length - 1; i++) {
      const [a,b] = [ring[i],ring[i+1]];
      if (Math.hypot(a[0]-b[0],a[1]-b[1]) > 0.35) continue;
      const pad = 0.12;
      const w = Math.min(a[0],b[0])-pad, e = Math.max(a[0],b[0])+pad;
      const south = Math.min(a[1],b[1])-pad, north = Math.max(a[1],b[1])+pad;
      pieces.push([[[w,south],[e,south],[e,north],[w,north],[w,south]]]);
    }
  }
  let envelope = polygonClipping.union(...pieces);
  // Keep the original mouth lines exactly: without these half-plane clips,
  // the shoreline envelope leaves small square ears beside their endpoints.
  for (const poly of polygons) {
    const ring = poly[0];
    const signedArea = ring.slice(1).reduce((sum,b,i) => sum + ring[i][0]*b[1]-b[0]*ring[i][1],0);
    for (let i=0; i<ring.length-1; i++) {
      const a=ring[i], b=ring[i+1];
      if (Math.hypot(a[0]-b[0],a[1]-b[1]) <= 1) continue;
      const side = p => Math.sign(signedArea)*((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]));
      const [w,s,e,n] = plainBbox({type:'MultiPolygon',coordinates:envelope});
      const box=[[w-1,s-1],[e+1,s-1],[e+1,n+1],[w-1,n+1]];
      const clipped=[];
      for (let j=0;j<box.length;j++) {
        const from=box[j], to=box[(j+1)%box.length], d1=side(from), d2=side(to);
        if (d1>=0) clipped.push(from);
        if ((d1>=0)!==(d2>=0)) {
          const t=d1/(d1-d2);
          clipped.push([from[0]+t*(to[0]-from[0]),from[1]+t*(to[1]-from[1])]);
        }
      }
      clipped.push(clipped[0]);
      envelope=polygonClipping.intersection(envelope,[clipped]);
    }
  }
  const [w,south,e,north] = plainBbox({type:'MultiPolygon',coordinates:envelope});
  const clippers = land.features.filter((f,i) => {
    const [lw,ls,le,ln] = landBb[i];
    return f.geometry && le >= w && lw <= e && ln >= south && ls <= north;
  }).map(f => f.geometry.coordinates);
  return {type:'MultiPolygon',coordinates:polygonClipping.difference(envelope,...clippers)};
}

// For narrow spit entrances, follow the actual containing coastline between
// the two cape vertices and close only the mouth. This avoids sketch edges
// crossing the inner branches of the gulf.
function coastalBayRing(land,{country,entrance:[a,b]}) {
  const feature=land.features.find(f=>f.properties.ADM0_A3===country);
  const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates;
  const matches=(p,q)=>Math.hypot(p[0]-q[0],p[1]-q[1])<1e-7;
  for(const polygon of polygons) {
    const ring=polygon[0].slice(0,-1), ia=ring.findIndex(p=>matches(p,a)),ib=ring.findIndex(p=>matches(p,b));
    if(ia<0||ib<0) continue;
    const forward=(from,to)=>from<to?ring.slice(from,to+1):[...ring.slice(from),...ring.slice(0,to+1)];
    const length=path=>path.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-path[i][0],p[1]-path[i][1]),0);
    const first=forward(ia,ib),second=forward(ib,ia);
    const coast=length(first)<length(second)?first:second;
    return [...coast,coast[0]];
  }
  throw new Error(`Cannot find bay entrance capes on ${country} coastline`);
}

// Clip a coastal mask to the waterward side of a real entrance. The broad
// rectangle is only a construction aid; its edges never become bay boundaries.
function clipMarineAtEntrance(geometry, [a,b], interior) {
  const cross=p=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
  const sign=Math.sign(cross(interior));
  const [w,s,e,n]=plainBbox(geometry);
  const box=[[w-1,s-1],[e+1,s-1],[e+1,n+1],[w-1,n+1]], ring=[];
  for(let i=0;i<box.length;i++) {
    const from=box[i],to=box[(i+1)%box.length],d1=sign*cross(from),d2=sign*cross(to);
    if(d1>=0) ring.push(from);
    if((d1>=0)!==(d2>=0)) {
      const t=d1/(d1-d2);
      ring.push([from[0]+t*(to[0]-from[0]),from[1]+t*(to[1]-from[1])]);
    }
  }
  ring.push(ring[0]);
  return {type:'MultiPolygon',coordinates:polygonClipping.intersection(geometry.coordinates,[ring])};
}

function enrichSeas() {
  const data = readRaw('seas-raw.geojson');
  data.features = data.features.filter((f) => !f.properties.curated && !SEA_ADD.some(s=>s.name===(f.properties.name==='Golfe du Lion'?'Gulf of Lion':f.properties.name))); // curated masks replace source fragments
  // Retained subset of Natural Earth's 10m marine source; unrelated names
  // never enter the personal atlas. Keep membership decisions in this script.
  const additions=JSON.parse(fs.readFileSync(path.join(__dirname,'..','data','marine-additions.geojson')));
  const requested=new Set(['Sea of Crete','Dardanelles','Sea of Marmara','Bosporus','Alboran Sea','Ligurian Sea','Skagerrak','Gulf of Ob','Khatanga Gulf']);
  data.features.push(...additions.features.filter(f=>requested.has(f.properties.name)));
  for (const f of data.features) {
    if(f.properties.name==='Golfe du Lion')f.properties.name='Gulf of Lion';
    Object.assign(f.properties,FEATURE_ADDITIONS[f.properties.name]??{});
    if (f.properties.name === 'Shelikhova Gulf') f.properties.name='Shelikhov Gulf';
    if (['Skagerrak','Dardanelles'].includes(f.properties.name)) f.properties.featurecla='strait';
    const label = {'Sea of Crete':[25.0,35.8], 'Sea of Marmara':[28.2,40.75], 'Bosporus':[29.066735,41.107001], 'Dardanelles':[26.43,40.2], 'Ligurian Sea':[8.9,43.8], 'Skagerrak':[9.3,57.9], 'Gulf of Ob':[73.1,70.5], 'Khatanga Gulf':[110.5,73.7]}[f.properties.name];
    if(label) {f.properties.label_lon=label[0];f.properties.label_lat=label[1];}

  }
  const land = readRaw('countries-10m-raw.geojson');
  const landBb = land.features.map((f) => (f.geometry ? plainBbox(f.geometry) : [0, 0, 0, 0]));
  for (const name of ['Hudson Bay', 'James Bay']) {
    const bay = data.features.find(f => f.properties.name === name);
    if (!bay) throw new Error(`Missing bay to refit: ${name}`);
    bay.geometry = refitBayCoast(bay.geometry, land, landBb);
  }
  // NE closes the Andaman Sea across the Gulf of Martaban. Restore its
  // northern coastal water before computing either hit targets or outlines.
  const andaman = data.features.find(f => f.properties.name === 'Andaman Sea');
  const northAndaman = clipRingToWater(
    [[95.1,15.6],[95.0,18.3],[98.6,18.3],[98.6,14.6],[97.7,14.6],[95.1,15.6]], land, landBb);
  if (!andaman || !northAndaman) throw new Error('Cannot repair northern Andaman Sea');
  andaman.geometry = { type: 'MultiPolygon', coordinates: polygonClipping.union(andaman.geometry.coordinates, northAndaman.coordinates) };
  for (const s of SEA_ADD) {
    // `openInto`: name(s) of the adjacent sea/ocean this body opens into. Its
    // polygon is subtracted too, so the seaward edge coincides with that sea's
    // boundary (draw the ring EXTENDING INTO that sea; the overlap gets trimmed).
    const extra = [];
    for (const nm of [].concat(s.openInto || [])) {
      const adj = data.features.find((f) => f.properties.name === nm);
      if (adj) extra.push(adj.geometry);
      else console.warn(`  ${s.name}: openInto "${nm}" not found among seas — seaward edge stays a drawn line`);
    }
    const ring=s.coastBetween?coastalBayRing(land,s.coastBetween):s.ring;
    let geometry = clipRingToWater(ring, land, landBb, extra);
    if (!geometry && (s.entrances || s.coastBetween)) throw new Error(`Cannot clip ${s.name} to water`);
    geometry ||= { type: 'Polygon', coordinates: [ring] };
    for(const entrance of s.entrances || []) geometry=clipMarineAtEntrance(geometry,entrance,s.labelAt);
    if(s.keepLabelComponent) {
      const connected=geometry.coordinates.filter(poly=>pointInGeom(s.labelAt,{type:'Polygon',coordinates:poly}));
      if(connected.length!==1) throw new Error(`Cannot identify connected water for ${s.name}`);
      geometry={type:'MultiPolygon',coordinates:connected};
    }
    const props = { name: s.name, featurecla: s.featurecla, scalerank: s.scalerank, curated: true, ...(FEATURE_ADDITIONS[s.name] ?? {}) };
    if (s.labelAt) { props.label_lon = s.labelAt[0]; props.label_lat = s.labelAt[1]; }
    data.features.push({ type: 'Feature', properties: props, geometry });
  }
  // Apply the same detailed coastline to every marine hit target and outline.
  // Caspian is an inland lake: the country land source covers its water, so it
  // must retain its lake shoreline rather than be subtracted as ocean coast.
  const coast = coastlineIndex(land);
  const audit=[];
  for (const feature of data.features) {
    const name=feature.properties.name;
    if (feature.properties.featurecla === 'ocean' || name === 'Caspian Sea' || PERSONAL_MARINE_EXCLUDED.has(name)) continue;
    const alreadyFitted = feature.properties.curated || ['Hudson Bay','James Bay'].includes(name);
    console.log(`  refit coast: ${name}`);
    const result=alreadyFitted ? {geometry:feature.geometry,matched:0,maxShift:0} : refitMarineCoast(feature.geometry,coast,land);
    feature.geometry=result.geometry;
    audit.push({name,coastalSegments:result.matched,maxShoreShiftDegrees:result.maxShift});
  }
  // Keep the shared land/marine topology on one precision grid before the
  // hierarchy unions, avoiding almost-coincident edges between nested waters.
  for (const f of data.features) {
    if (f.properties.featurecla === 'ocean' || f.properties.name === 'Caspian Sea') continue;
    const coordinates=polygonClipping.union(roundMarineCoordinates(f.geometry.coordinates));
    if (!coordinates.length) throw new Error(`Marine precision grid erased ${f.properties.name}`);
    f.geometry={type:'MultiPolygon',coordinates};
  }
  // Sibling hit targets share exact entrance edges; the selection hierarchy
  // dissolves them back into the complete Gulf of Guinea.
  const guinea=data.features.find(f=>f.properties.name==='Gulf of Guinea');
  const benin=data.features.find(f=>f.properties.name==='Bight of Benin');
  const bonny=data.features.find(f=>f.properties.name==='Bight of Bonny');
  const corisco=data.features.find(f=>f.properties.name==='Corisco Bay');
  if(!guinea||!benin||!bonny||!corisco)throw Error('Missing Gulf of Guinea waters');
  bonny.geometry={type:'MultiPolygon',coordinates:polygonClipping.difference(bonny.geometry.coordinates,corisco.geometry.coordinates)};
  guinea.geometry={type:'MultiPolygon',coordinates:polygonClipping.difference(guinea.geometry.coordinates,benin.geometry.coordinates,bonny.geometry.coordinates,corisco.geometry.coordinates)};
  // Shared Red Sea entrances: restore the northern coastal water, then let
  // each gulf own its complete footprint up to the common mouth boundary.
  const redSea=data.features.find(f=>f.properties.name==='Red Sea');
  const northRedSea=clipRingToWater([[32,27.2],[35.5,27.2],[35.5,30.2],[32,30.2],[32,27.2]],land,landBb);
  const redGulfs=['Gulf of Suez','Gulf of Aqaba'].map(name=>data.features.find(f=>f.properties.name===name));
  if(!redSea||!northRedSea||redGulfs.some(f=>!f))throw Error('Missing northern Red Sea geometry');
  redSea.geometry={type:'MultiPolygon',coordinates:polygonClipping.difference(polygonClipping.union(redSea.geometry.coordinates,northRedSea.coordinates),...redGulfs.map(f=>f.geometry.coordinates))};
  // Razim–Sinoe lagoon coast: the generalized marine outline skips water
  // that the detailed country source exposes. Restore the coastal envelope,
  // using only original land to define the shoreline; no shore is redrawn.
  const blackSea=data.features.find(f=>f.properties.name==='Black Sea');
  const razimWater=clipRingToWater([[28.3,44.2],[30.2,44.2],[30.2,45.4],[28.3,45.4],[28.3,44.2]],land,landBb);
  if(!blackSea||!razimWater)throw Error('Cannot repair Romanian Black Sea coastline');
  const joined=polygonClipping.union(blackSea.geometry.coordinates,razimWater.coordinates);
  // Keep only water connected to the source sea, excluding inland lake holes.
  const connected=joined.filter(poly=>polygonClipping.intersection([poly],blackSea.geometry.coordinates).length);
  blackSea.geometry={type:'MultiPolygon',coordinates:connected};
  // Northern Bosporus: source geometry stops south of the lighthouse entrance.
  // Turkish Ministry entrance definition (2024 fisheries notice, map 2):
  // https://trabzon.tarimorman.gov.tr/Sayfalar/Detay.aspx?Liste=Duyuru&OgeId=240
  // Project lighthouse positions to original 10m shore; only the mouth is drawn.
  const bosporus=data.features.find(f=>f.properties.name==='Bosporus');
  const northBosporus=clipRingToWater([[29.109223,41.235297],[29.150487,41.222829],[29.20,41.16],[29.02,41.16],[29.109223,41.235297]],land,landBb);
  if(!bosporus||!northBosporus)throw Error('Missing northern Bosporus water');
  const bosporusParts=polygonClipping.union(bosporus.geometry.coordinates,roundMarineCoordinates(northBosporus.coordinates));
  // Exclude the tiny detached artifact beside the southern entrance.
  bosporus.geometry={type:'MultiPolygon',coordinates:bosporusParts.filter(poly=>pointInGeom([29.066735,41.107001],{type:'Polygon',coordinates:poly}))};
  // Rebuild the containing basin at each gulf entrance before cutting one
  // common seam. Original land supplies the coast, including islands/lagoon holes.
  for(const [basinName,gulfName,ring] of [
    ['Mediterranean Sea','Gulf of Lion',[[2.5,42],[6.3,42],[6.3,44],[2.5,44],[2.5,42]]],
    ['Ionian Sea','Gulf of Taranto',[[16,38.8],[18.6,38.8],[18.6,40.8],[16,40.8],[16,38.8]]],
    ['English Channel','Gulf of Saint-Malo',[[-3.5,48.2],[-1.1,48.2],[-1.1,49.9],[-3.5,49.9],[-3.5,48.2]]],
  ]) {
    const basin=data.features.find(f=>f.properties.name===basinName);
    const gulf=data.features.find(f=>f.properties.name===gulfName);
    const patch=clipRingToWater(ring,land,landBb);
    if(!basin||!gulf||!patch)throw Error(`Missing gulf seam: ${gulfName}`);
    const merged=polygonClipping.union(basin.geometry.coordinates,roundMarineCoordinates(patch.coordinates));
    const connected=merged.filter(poly=>polygonClipping.intersection([poly],basin.geometry.coordinates).length);
    basin.geometry={type:'MultiPolygon',coordinates:polygonClipping.difference(connected,gulf.geometry.coordinates)};
  }
  // Lion and Balearic are sibling regions; Taranto also has no duplicate
  // hit target in the broad Mediterranean base.
  for(const [basinName,gulfName] of [['Balearic Sea','Gulf of Lion'],['Mediterranean Sea','Gulf of Taranto']]) {
    const basin=data.features.find(f=>f.properties.name===basinName),gulf=data.features.find(f=>f.properties.name===gulfName);
    basin.geometry={type:'MultiPolygon',coordinates:polygonClipping.difference(basin.geometry.coordinates,gulf.geometry.coordinates)};
  }
  // Shared entrance seams: extend the neighbouring basin across the legacy
  // generalized edge, then cut it with the actual fitted strait polygon.
  // The mask sides lie inland or inside existing basin water, not offshore.
  for(const [basinName,straitName,ring] of [
    ['Black Sea','Bosporus',[[28.95,41.18],[29.30,41.18],[29.30,41.35],[28.95,41.35],[28.95,41.18]]],
    ['Aegean Sea','Dardanelles',[[26.0,39.8],[26.5,39.8],[26.5,40.0],[26.1,40.12],[26.0,39.8]]],
    ['Sea of Marmara','Bosporus',[[28.85,40.92],[29.15,40.92],[29.15,41.04],[28.85,41.04],[28.85,40.92]]],
  ]) {
    const basin=data.features.find(f=>f.properties.name===basinName);
    const strait=data.features.find(f=>f.properties.name===straitName);
    const patch=clipRingToWater(ring,land,landBb);
    if(!patch) throw new Error(`Empty entrance repair: ${straitName}`);
    basin.geometry={type:'MultiPolygon',coordinates:polygonClipping.difference(
      polygonClipping.union(basin.geometry.coordinates,patch.coordinates),strait.geometry.coordinates)};
  }
  // Repair the containing basin too: its old Gujarat coast/mouth approximation
  // leaves a wedge outside Khambhat and a second entrance beside Kutch.
  // The offshore edges of this generous repair mask lie inside Arabian Sea;
  // land clips its coastal side. Child mouths then become the shared edges.
  const arabian = data.features.find(f => f.properties.name === 'Arabian Sea');
  const gujaratCoast = clipRingToWater([[68,21],[68,23.5],[69.5,24],[74,23],[74,19],[72,19],[68,21]], land, landBb);
  if (!gujaratCoast) throw new Error('Gujarat basin repair produced no water');
  const gujaratGulfs = ['Gulf of Kutch','Gulf of Khambhat'].map(name => data.features.find(f => f.properties.name === name));
  arabian.geometry = {type:'MultiPolygon', coordinates:polygonClipping.difference(
    polygonClipping.union(arabian.geometry.coordinates, gujaratCoast.coordinates),
    ...gujaratGulfs.map(f => f.geometry.coordinates))};
  // Gibraltar is an Atlantic sibling, not part of either neighbouring polygon
  // or the Mediterranean selection. Remove shared water, not just label overlap.
  const gibraltar=data.features.find(f=>f.properties.name==='Strait of Gibraltar');
  // Limit the coastal mask to the two entrance half-planes, including the
  // small shoreline discrepancy at Spartel between the source datasets.
  const west=[[-6.033333,36.183333],[-5.923333,35.793333]];
  const east=[[-5.344444,36.110556],[-5.282222,35.898056]];
  const atLatitude=(line,y)=>[line[0][0]+(y-line[0][1])*(line[1][0]-line[0][0])/(line[1][1]-line[0][1]),y];
  const limits=[atLatitude(west,35.4),atLatitude(east,35.4),atLatitude(east,36.6),atLatitude(west,36.6),atLatitude(west,35.4)];
  gibraltar.geometry={type:'MultiPolygon',coordinates:polygonClipping.intersection(gibraltar.geometry.coordinates,[limits])};

  for (const name of ['Gulf of Cádiz','Alboran Sea','Mediterranean Sea']) {
    const neighbour=data.features.find(f=>f.properties.name===name);
    const coordinates=polygonClipping.difference(neighbour.geometry.coordinates,gibraltar.geometry.coordinates);
    if (!coordinates.length) throw new Error(`Gibraltar separation erased ${name}`);
    neighbour.geometry={type:'MultiPolygon',coordinates};
  }
  // Sibling selections under Black Sea: Kerch owns its strait water, while
  // Azov ends at the same entrance boundary, with no shared fill or hit area.
  const kerch=data.features.find(f=>f.properties.name==='Kerch Strait');
  const azov=data.features.find(f=>f.properties.name==='Sea of Azov');
  const azovCoordinates=polygonClipping.difference(azov.geometry.coordinates,kerch.geometry.coordinates);
  if (!azovCoordinates.length) throw new Error('Kerch separation erased Sea of Azov');
  // Removing the strait disconnects a few legacy mask fragments in the
  // Black Sea. Retain the main continuous Azov water body, including its holes.
  const polygonArea=poly=>Math.abs(poly[0].slice(1).reduce((sum,b,i)=>sum+poly[0][i][0]*b[1]-b[0]*poly[0][i][1],0));
  const azovMain=azovCoordinates.reduce((largest,poly)=>polygonArea(poly)>polygonArea(largest)?poly:largest);
  azov.geometry={type:'MultiPolygon',coordinates:[azovMain]};
  fs.writeFileSync(path.join(__dirname,'..','docs','marine-coast-audit.json'),JSON.stringify(audit,null,2)+'\n');
  writeGeo('seas.geojson', data);
  console.log(`  added ${SEA_ADD.length} curated seas, clipped to 10m coastline (${SEA_ADD.map((s) => s.name).join(', ')})`);
}

// Curated max elevations (m, approximate — they only drive the hypsometric
// tint ramp) for ranges whose NE polygon contains no NE elevation point.
// Keys are normalized: uppercase, single-spaced, straight apostrophes.
const RANGE_MAX_ELEV = {
  'URAL MOUNTAINS': 1895, 'TRANSANTARCTIC MOUNTAINS': 4528, 'ZAGROS MOUNTAINS': 4409,
  'GREATER KHINGAN RANGE': 2035, 'STANOVOY RANGE': 2419, 'CHAÎNE ANNAMITIQUE': 2819,
  'SIWALIK HILLS': 2000, 'COAST MOUNTAINS': 4019, 'PENSACOLA MOUNTAINS': 2150,
  'QUEEN MAUD MOUNTAINS': 4070, 'ATLAS SAHARIEN': 2236, 'CRYSTAL MOUNTAINS': 1000,
  'TIBESTI MTS.': 3445, 'AHAGGAR MTS.': 2908, 'AÏR MTS.': 2022,
  'LESSER KHINGAN RANGE': 1374, "SIKHOTE-ALIN' RANGE": 2090, 'VERKHOYANSK RANGE': 2283,
  'CENTRAL HIGHLANDS': 2500, 'QUILIAN MOUNTAINS': 5808, 'DABIE MTS.': 1777,
  'NAN LING MTS.': 1900, 'WESTERN GHATS': 2695, 'EASTERN GHATS': 1680,
  'VINDHYA RANGE': 752, 'WUYI MTS.': 2158, 'TARBAGATAY RA.': 2992,
  'ALTUN MTS.': 6295, 'HEJAZ MTS.': 2400, 'ASIR MTS.': 3000,
  'ELBURZ MTS.': 5610, 'KJØLEN MOUNTAINS': 2469, 'CARPATHIAN MOUNTAINS': 2655,
  'APPENNINI': 2912, 'PYRENEES': 3404, 'SIERRA MADRE DEL SUR': 3720,
  'COAST RANGES': 2400, 'SIERRA MADRE ORIENTAL': 3700, 'SIERRA MADRE OCCIDENTAL': 3312,
  'CHUGACH MTS.': 4016, 'MACKENZIE MTS.': 2972, 'CORDILLERA OCCIDENTAL': 4700,
  'CORDILLERA REAL': 5800, 'CORDILLERA ORIENTAL': 5400, 'CORD. CENTRAL': 3100,
  'SOUTHERN ALPS': 3724, 'ANTI ATLAS': 2531, 'MUCHINGA MTS.': 1800,
  'SERRA DO MAR': 2200, 'SERRA GERAL': 1800, 'SERRA DA MANTIQUEIRA': 2798,
  'SIERRA CHIAPAS': 4060, 'SELWYN MTS.': 2972, 'COLUMBIA MTS.': 3519,
  'TORNGAT MTS.': 1652, 'HAMGYONG MTS.': 2540, 'SREDINNYY RANGE': 3607,
  'KORYAK RANGE': 2562, 'KOLYMA RANGE': 2000, 'CHERSKIY RANGE': 3003,
  'CHIN HILLS': 3053, 'YIN MTS.': 2364, 'WESTERN SAYAN MTS.': 3120,
  'ABAKANSKIY RA.': 1984, 'TANNU-OLA RA.': 3060, 'LÜLIANG MTS.': 2831,
  'DALOU MTS.': 2200, 'DÂNGRÊK RA.': 750, 'NAGA HILLS': 3826,
  'ARAKAN YOMA': 2000, 'SOUTHERN GHATS': 2695, 'SATPURA RANGE': 1350,
  'SALT RA.': 1522, 'BOROHORO MTS.': 4300, 'ALATAW MTS.': 4622,
  'KHASI HILLS': 1966, 'LESSER CAUCASUS': 4090, 'PONTIC MOUNTAINS': 3937,
  'KUH RUD MOUNTAINS': 4500, 'BALKAN MTS.': 2376, 'DINARIC ALPS': 2694,
  'CORD. CANTÁBRICA': 2648, 'S. NEVADA': 3479, 'SIERRA MORENA': 1332,
  'HADHRAMAUT': 2200, 'ADMIRALTY MOUNTAINS': 4165, 'PRINCE ALBERT MOUNTAINS': 3000,
  'QUEEN ALEXANDRA RANGE': 4528, 'FLOOD RANGE': 3460, 'FORD RANGES': 1400,
  'PRINCE CHARLES MOUNTAINS': 3355, 'SCOTT MOUNTAINS': 1800, 'NAPIER MOUNTAINS': 2300,
  'SHACKLETON RANGE': 1875,
};

const normRangeName = (s) => s.toUpperCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();

// Curated label points [lon,lat] for ranges whose vertex-average centroid lands
// in a poor spot (crowded, off-range, or unrepresentative). Keyed by the
// NORMALIZED display name. Pin the label on the range's recognizable spine.
const RANGE_LABEL_POS = {
  'Appalachian Mountains': [-79.6, 38.0], // central Appalachians (VA/WV), not the NY Finger Lakes
};

// Display-name normalization for mountain ranges. Natural Earth ships range names
// inconsistently: SHOUTY CAPS mixed with Title Case, and abbreviations (CAUCASUS
// MTS., KARAKORAM RA., CORD. CENTRAL). We fix the DATA artifacts — expand the
// abbreviations and settle on Title Case (the map still renders caps via the
// range typography token's text-transform, but the InfoCard reads cleanly).
//
// We deliberately do NOT homogenize the generic suffix. English attaches
// "Mountains"/"Range" to ADJECTIVAL names (the Carpathian Mountains, the Rocky
// Mountains, the Atlas Mountains) but leaves standalone plural/collective NOUNS
// bare (the Alps, the Andes, the Pyrenees, the Himalayas) — "Alps Mountains" is
// wrong. NE already respects this, so normalization never adds or strips a suffix;
// it only expands abbreviations and re-cases. A small override table fixes foreign
// exonyms (APPENNINI → Apennines) and typos (Queen Maude → Queen Maud).
const RANGE_NAME_OVERRIDES = {
  APPENNINI: 'Apennines',
  'CHAÎNE ANNAMITIQUE': 'Annamite Range',
  'ATLAS SAHARIEN': 'Saharan Atlas',
  'HAUT ATLAS': 'High Atlas',
  'Queen Maude Mountains': 'Queen Maud Mountains',
};
const RANGE_ABBREV = { MTS: 'Mountains', 'MTS.': 'Mountains', RA: 'Range', 'RA.': 'Range', CORD: 'Cordillera', 'CORD.': 'Cordillera', 'S.': 'Sierra' };
// Connectives stay lowercase mid-name (Sierra Madre del Sur, Serra do Mar).
const RANGE_SMALL_WORDS = new Set(['of', 'the', 'and', 'del', 'de', 'la', 'las', 'los', 'du', 'des', 'do', 'da', 'das', 'di', 'e', 'y']);
const titleCaseToken = (t) =>
  t.split(/([-'’])/).map((part, i) => (i % 2 ? part : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())).join('');
function normalizeRangeName(raw) {
  if (RANGE_NAME_OVERRIDES[raw]) return RANGE_NAME_OVERRIDES[raw];
  return raw.trim().split(/\s+/).map((w, idx) => {
    const up = w.toUpperCase();
    if (RANGE_ABBREV[up]) return RANGE_ABBREV[up];
    if (idx > 0 && RANGE_SMALL_WORDS.has(w.toLowerCase())) return w.toLowerCase();
    return titleCaseToken(w);
  }).join(' ');
}

// Ray-cast point-in-polygon against outer rings (holes are irrelevant at the
// precision of NE's generalized range extents).
function pointInGeom([px, py], geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  return polys.some((poly) => {
    const ring = poly[0];
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  });
}

// Orography: mountain-range label points (from NE geography-region polygons,
// EXTENT-carrying so long ranges label big) and named peaks with elevation.
// The same regions file also holds deserts/plateaus/isthmuses — future themes.
function buildOrography() {
  const regions = readRaw('regions-raw.geojson');

  for (const [name, max, ring] of [
    ['Dolomites', 3343, [[11.45,46.1],[11.3,46.55],[11.7,46.85],[12.25,46.85],[12.65,46.65],[12.6,46.25],[12.15,46.05],[11.45,46.1]]],
    ['Bismarck Range', 4509, [[143.95,-5.8],[144.2,-5.45],[144.7,-5.3],[145.15,-5.65],[145.4,-6.1],[145.05,-6.35],[144.55,-6.1],[143.95,-5.8]]],
  ]) {
    const countryCode = name === 'Dolomites' ? 'ITA' : 'PNG';
    const country = readRaw('countries-10m-raw.geojson').features.find(f => f.properties.ADM0_A3 === countryCode);
    const coordinates = polygonClipping.intersection([ring], country.geometry.coordinates);
    if (!coordinates.length) throw new Error(`Empty curated range: ${name}`);
    regions.features.push({type:'Feature', properties:{NAME:name, FEATURECLA:'Range/mtn', SCALERANK:3}, geometry:{type:'MultiPolygon',coordinates}});
    RANGE_MAX_ELEV[normRangeName(name)] = max;
  }
  const elevRaw = readRaw('elevation-points-raw.geojson');
  const elevPts = elevRaw.features.filter(
    (f) => f.properties.featurecla === 'mountain' && f.properties.elevation != null,
  );

  // Max elevation per range drives the hypsometric fill (higher = darker):
  // NE elevation points inside the polygon where they exist, curated table
  // otherwise. Both sparse sources together cover all 129 ranges.
  const rangeMaxElev = (f) => {
    let max = null;
    for (const p of elevPts) {
      if (pointInGeom(p.geometry.coordinates, f.geometry)) {
        if (max == null || p.properties.elevation > max) max = p.properties.elevation;
      }
    }
    return max ?? RANGE_MAX_ELEV[normRangeName(f.properties.NAME)] ?? null;
  };

  // The range polygons themselves — NE's shapes are generalized label-support
  // extents (not precise geology), so the map renders them as a soft tint.
  // Curated endonyms ride on both the polygons (click → InfoCard) and the
  // label points (map label) — resolve against the raw NAME_XX columns first.
  const rangeNative = (f) => {
    const props = { ...f.properties, name: f.properties.NAME };
    applyFeatureNative(props, RANGE_NATIVE[f.properties.NAME]);
    return props.name_native
      ? { name_native: props.name_native, name_native_lang: props.name_native_lang, NATIVE_ON_MAP: props.NATIVE_ON_MAP }
      : {};
  };

  const rangePolys = regions.features
    .filter((f) => f.properties.FEATURECLA === 'Range/mtn' && f.properties.NAME)
    .map((f, i) => ({
      type: 'Feature',
      id: i,
      geometry: { ...f.geometry, coordinates: FEATURE_ADDITIONS[f.properties.NAME] ? roundMarineCoordinates(f.geometry.coordinates) : roundCoords(f.geometry.coordinates) },
      properties: {
        name: normalizeRangeName(f.properties.NAME),
        scalerank: f.properties.SCALERANK ?? 5,
        max_elev: rangeMaxElev(f),
        ...rangeNative(f),
        ...FEATURE_ADDITIONS[normalizeRangeName(f.properties.NAME)],
      },
    }));
  const noElev = rangePolys.filter((f) => f.properties.max_elev == null);
  if (noElev.length) {
    console.warn(`  ${noElev.length} ranges without max_elev:`, noElev.map((f) => f.properties.name).join(', '));
  }
  writeGeo('ranges.geojson', { type: 'FeatureCollection', features: rangePolys });

  const rangePoints = regions.features
    .filter((f) => f.properties.FEATURECLA === 'Range/mtn' && f.properties.NAME)
    .map((f) => {
      const ring = largestRing(f.geometry);
      if (!ring) return null;
      let x = 0, y = 0;
      for (const c of ring) { x += c[0]; y += c[1]; }
      const bb = countryBbox(f.geometry);
      const midLat = (bb[1] + bb[3]) / 2;
      const extent = Math.max((bb[2] - bb[0]) * Math.cos((midLat * Math.PI) / 180), bb[3] - bb[1]);
      const name = normalizeRangeName(f.properties.NAME);
      // The label sits at the ring's vertex-average centroid, which for a long,
      // irregular range lands wherever NE digitized the most vertices — for the
      // Appalachians that's the Finger Lakes of New York, a city/lake-dense spot
      // nowhere near where you'd read "the Appalachians". RANGE_LABEL_POS pins a
      // better, on-spine point for such cases.
      const pos = RANGE_LABEL_POS[name] || [x / ring.length, y / ring.length];
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: pos },
        properties: {
          name,
          scalerank: f.properties.SCALERANK ?? 5,
          EXTENT: Math.round(extent * 10) / 10,
          ...rangeNative(f),
          ...FEATURE_ADDITIONS[normalizeRangeName(f.properties.NAME)],
        },
      };
    })
    .filter(Boolean);
  writeGeo('range-labels.geojson', { type: 'FeatureCollection', features: rangePoints });

  const peaks = elevRaw.features
    .filter((f) => f.properties.featurecla === 'mountain' && f.properties.name)
    .map((f) => {
      applyFeatureNative(f.properties, PEAK_NATIVE[f.properties.name]);
      const p = f.properties;
      return {
        type: 'Feature',
        geometry: f.geometry,
        properties: {
          name: p.name,
          elevation: p.elevation ?? null,
          scalerank: p.scalerank ?? 5,
          ...(p.name_native
            ? { name_native: p.name_native, name_native_lang: p.name_native_lang, NATIVE_ON_MAP: p.NATIVE_ON_MAP }
            : {}),
        },
      };
    });
  writeGeo('peaks.geojson', { type: 'FeatureCollection', features: peaks });
}

// One label point per named lake (centroid of its largest ring), so big lakes
// like the Great Lakes get a single clean label. scalerank drives priority.
const LAKE_LABEL_POS = {'Lake Nasser':[32.7,23.5]};
function buildLakeLabels() {
  const data = readGeo('lakes.geojson');
  const points = data.features
    .filter((f) => f.properties.name)
    .map((f) => {
      const ring = largestRing(f.geometry);
      if (!ring) return null;
      let x = 0, y = 0;
      for (const c of ring) { x += c[0]; y += c[1]; }
      // Endonym rides on the label point too — resolved against the lake's own
      // NE name_xx columns (this runs before enrichLakes rewrites the file).
      applyFeatureNative(f.properties, LAKE_NATIVE[f.properties.name]);
      const p = f.properties;
      // On-screen size (cos-lat-corrected degree span) drives label priority AND
      // a zoom gate — NE's lake `scalerank` is 0 for ~75% of lakes, so tiny lakes
      // like Ayakkum Hu would otherwise label at continent zoom. EXTENT lets the
      // layer hide small lakes until you zoom in (see lakeLabel text-size).
      const bb = countryBbox(f.geometry);
      const midLat = (bb[1] + bb[3]) / 2;
      const extent = Math.max((bb[2] - bb[0]) * Math.cos((midLat * Math.PI) / 180), bb[3] - bb[1]);
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: LAKE_LABEL_POS[p.name] ?? [x / ring.length, y / ring.length] },
        properties: {
          name: p.name,
          scalerank: p.scalerank ?? 5,
          EXTENT: Math.round(extent * 100) / 100,
          ...(p.name_native
            ? { name_native: p.name_native, name_native_lang: p.name_native_lang, NATIVE_ON_MAP: p.NATIVE_ON_MAP }
            : {}),
        },
      };
    })
    .filter(Boolean);
  writeGeo('lake-labels.geojson', { type: 'FeatureCollection', features: points });
}

// Override Natural Earth's hand-placed label point for countries where it looks
// off-center on the map. NE puts Russia's label in populous European Russia
// (~45°E), which sits far west of the country's vast visual center.
const LABEL_POS = {
  RUS: [98, 64],
};

// Antimeridian-aware union of [w,s,e,n] boxes: some inputs may already be
// shifted (e > 180, e.g. Alaska). Compute two candidates — canonical [-180,180]
// representation vs. every western box shifted +360 — and keep the narrower
// span (e.g. USA: Guam 144°E → Maine 293° ≈ 151° wide, not 333°).
function unionBoxes(boxes) {
  if (!boxes.length) return null;
  const canon = boxes.map(([w, s, e, n]) => (e > 180 ? [w - 360, s, e - 360, n] : [w, s, e, n]));
  const shifted = canon.map(([w, s, e, n]) => (w < 0 ? [w + 360, s, e + 360, n] : [w, s, e, n]));
  const span = (bs) => Math.max(...bs.map((b) => b[2])) - Math.min(...bs.map((b) => b[0]));
  const pick = span(shifted) < span(canon) ? shifted : canon;
  const r = (v) => Math.round(v * 100) / 100;
  return [
    r(Math.min(...pick.map((b) => b[0]))),
    r(Math.min(...pick.map((b) => b[1]))),
    r(Math.max(...pick.map((b) => b[2]))),
    r(Math.max(...pick.map((b) => b[3]))),
  ];
}

// Bounding box of a country's full geometry, for double-click zoom-to-fit.
// Antimeridian-aware: if the naive box spans >180° of longitude (Russia, USA,
// Fiji...), recompute with western longitudes shifted +360 and keep the
// narrower box (MapLibre accepts longitudes beyond 180 in fitBounds).
function countryBbox(geometry) {
  const lons = [], lats = [];
  const walk = (coords) => {
    if (typeof coords[0] === 'number') { lons.push(coords[0]); lats.push(coords[1]); return; }
    for (const c of coords) walk(c);
  };
  walk(geometry.coordinates);
  const s = Math.min(...lats), n = Math.max(...lats);
  let w = Math.min(...lons), e = Math.max(...lons);
  if (e - w > 180) {
    const shifted = lons.map((l) => (l < 0 ? l + 360 : l));
    const w2 = Math.min(...shifted), e2 = Math.max(...shifted);
    if (e2 - w2 < e - w) { w = w2; e = e2; }
  }
  const r = (v) => Math.round(v * 100) / 100;
  return [r(w), r(s), r(e), r(n)];
}

// Tier-4 territories (uninhabited/remote/base areas) get no country label —
// scattered groups like the U.S. Minor Outlying Islands would otherwise plant
// a giant label in the middle of the ocean (their bbox spans the whole Pacific,
// inflating the EXTENT-driven font size). The inset panel covers them instead.
const NO_COUNTRY_LABEL = new Set(
  Object.values(INSET_COUNTRIES)
    .flat()
    .filter((c) => c.tier === 4 && c.adm0)
    .map((c) => c.adm0),
);

function buildCountryLabels() {
  const data = readRaw('countries-10m-raw.geojson');
  const points = data.features
    .map((f) => {
      const p = f.properties;
      const adm0 = p.ADM0_A3;
      if (NO_COUNTRY_LABEL.has(adm0)) return null;
      let coords = null;
      if (LABEL_POS[adm0]) {
        coords = LABEL_POS[adm0];
      } else if (typeof p.LABEL_X === 'number' && typeof p.LABEL_Y === 'number') {
        coords = [p.LABEL_X, p.LABEL_Y];
      } else {
        const ring = largestRing(f.geometry);
        if (!ring) return null;
        let x = 0, y = 0;
        for (const c of ring) { x += c[0]; y += c[1]; }
        coords = [x / ring.length, y / ring.length];
      }
      const bbox = countryBbox(f.geometry);
      const focusBox = DEFAULT_FOCUS[adm0] || bbox;
      // On-screen extent of the country's main body (degrees, cos-lat corrected
      // so it reflects real width). Drives label font size: bigger countries get
      // bigger labels at a given zoom. Uses the focus box so France measures
      // metropolitan France, not its overseas-spanning legal bbox.
      // Dependencies made of scattered islands (St Helena's group spans 32° of
      // Atlantic) measure their LARGEST island, not the archipelago bbox —
      // otherwise the label sizes as if the ocean between were land.
      const isDependent = ['Dependency', 'Lease'].includes(p.TYPE) ||
        (p.SOV_A3 && p.SOV_A3.slice(0, 2) !== adm0.slice(0, 2));
      let measureBox = focusBox;
      if (isDependent && !DEFAULT_FOCUS[adm0]) {
        const ring = largestRing(f.geometry);
        if (ring) {
          let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
          for (const c of ring) {
            if (c[0] < w) w = c[0]; if (c[0] > e) e = c[0];
            if (c[1] < s) s = c[1]; if (c[1] > n) n = c[1];
          }
          measureBox = [w, s, e, n];
        }
      }
      const midLat = (measureBox[1] + measureBox[3]) / 2;
      const extent = Math.max(
        (measureBox[2] - measureBox[0]) * Math.cos((midLat * Math.PI) / 180),
        measureBox[3] - measureBox[1],
      );
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: coords },
        properties: {
          NAME: NAME_OVERRIDES[adm0]?.name || p.NAME,
          ADM0_A3: adm0,
          POP_EST: p.POP_EST,
          BBOX: bbox,
          // Double-click fits here; full BBOX kept for a future "show full extent".
          FOCUS_BBOX: focusBox,
          EXTENT: Math.round(extent * 10) / 10,
        },
      };
    })
    .filter(Boolean);
  writeGeo('countries-labels.geojson', { type: 'FeatureCollection', features: points });
}

// One label point per admin-1 area (centroid of the largest polygon ring),
// so multi-polygon provinces don't repeat their name on every island.
function buildAdmin1Labels() {
  const data = readGeo('admin1.geojson');
  const points = data.features
    .map((f) => {
      const ring = largestRing(f.geometry);
      if (!ring) return null;
      let x = 0, y = 0;
      for (const c of ring) { x += c[0]; y += c[1]; }
      // Cos-lat-corrected span (like country EXTENT) so the label's font size
      // can scale with the subdivision's on-screen size — Xinjiang labels big,
      // a Salvadoran department stays at the floor. Antimeridian-aware via
      // countryBbox (Chukotka crosses 180°).
      const bb = countryBbox(f.geometry);
      const midLat = (bb[1] + bb[3]) / 2;
      const extent = Math.max((bb[2] - bb[0]) * Math.cos((midLat * Math.PI) / 180), bb[3] - bb[1]);
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [x / ring.length, y / ring.length] },
        properties: {
          name: f.properties.name,
          admin: f.properties.admin,
          iso_a2: f.properties.iso_a2,
          EXTENT: Math.round(extent * 10) / 10,
        },
      };
    })
    .filter(Boolean);
  writeGeo('admin1-labels.geojson', { type: 'FeatureCollection', features: points });
}

function largestRing(geometry) {
  if (geometry.type === 'Polygon') return geometry.coordinates[0];
  if (geometry.type === 'MultiPolygon') {
    let best = null, bestLen = 0;
    for (const poly of geometry.coordinates) {
      if (poly[0].length > bestLen) { bestLen = poly[0].length; best = poly[0]; }
    }
    return best;
  }
  return null;
}

// ---------------------------------------------------------------------------
// River flow orientation.
//
// The map animates a dash "flowing" along each river line in the direction its
// coordinates are stored. Natural Earth digitizes most centerlines source->mouth
// (so the Nile animates south->north, the Yangtze west->east for free), but a
// number of features are stored mouth-first and animate backwards.
//
// We reverse those. The mouth of a river is its terminus nearest the ocean, so
// per feature we find the two termini, pick the coast-ward one, and test whether
// the segments (by length) flow toward it. If they flow away, the feature is
// digitized backwards. Two guards keep this from misfiring:
//   1. AUTO reversal only when the mouth terminus is genuinely coastal (<60 km of
//      sea) AND the reversal is decisive (>=88% of length flows the wrong way).
//   2. A curated RIVER_REVERSE table for famous interior rivers.
// This deliberately leaves alone rivers that drain AWAY from their nearest ocean
// — Andes-sourced Amazon tributaries (Marañón, Ucayali, Pilcomayo…), the Niger
// bend, Rockies-to-Arctic rivers — where "nearest ocean" is the SOURCE, not the
// mouth, and blind reversal would break a correctly-drawn river.
//
// RIVER_REVERSE maps a name to an explicit mouth [lon,lat], or null to use the
// nearest-ocean terminus. The explicit mouth is essential for interior rivers
// whose SOURCE sits closer to a coast than their real (inland) mouth: the Ohio
// rises at Pittsburgh (304 km from the Atlantic) but drains to Cairo, IL (706 km,
// via the Mississippi), and the Missouri's Montana headwaters read closer to the
// sea than its St. Louis confluence — so "nearest ocean" picks the source and
// inverts the whole river. A coordinate pins the true mouth instead.
// Approximate downstream reference points (lon/lat), never nearest-coast guesses.
// Interior tributaries end at their confluence; endorheic rivers at their inland sink.
// Aliases are pooled before orientation so a name change cannot reverse the flow.
const PERSONAL_RIVER_BY_REACH = new Map(Object.entries(PERSONAL_RIVERS).flatMap(([name, members]) => members.map(member => [member, name])));
const RIVER_MOUTH_COORDS = {
  Seine: [0.1, 49.43],
  Yukon: [-164.6, 62.6], Mackenzie: [-135.5, 69.3], Mississippi: [-89.3, 29.0],
  Missouri: [-90.1, 38.8], Ohio: [-89.1, 37.0], Colorado: [-114.9, 31.8],
  Arkansas: [-91.1, 33.8], Tennessee: [-88.6, 37.1], Potomac: [-76.3, 38.0],
  'St. Lawrence': [-64.5, 49.1], Athabasca: [-110.8, 58.7], 'Rio Grande': [-97.1, 25.96],
  Amazon: [-50.0, -0.5], Orinoco: [-61.5, 8.6], Paraná: [-58.4, -34.0],
  Senegal: [-16.5, 15.9], Niger: [6.3, 4.3], Volta: [0.7, 5.8], Nile: [31.5, 31.4],
  'White Nile': [32.5, 15.6], 'Blue Nile': [32.5, 15.6], Congo: [12.4, -6.1],
  Orange: [16.45, -28.6], Limpopo: [33.6, -25.2], Zambezi: [36.4, -18.6],
  Euphrates: [47.44, 30.97], Tigris: [47.44, 30.97], Po: [12.5, 44.95],
  Tiber: [12.23, 41.74], Rhine: [4.1, 51.95], Rhône: [4.85, 43.3],
  Loire: [-2.2, 47.25], Thames: [0.7, 51.5], Danube: [29.7, 45.15],
  Dnieper: [32.3, 46.5], Volga: [48.6, 46.0], Ural: [51.8, 46.9],
  Ob: [71.5, 66.5], Lena: [126.7, 72.4], Yenisey: [82.5, 71.8],
  Amur: [140.7, 53.1], Songhua: [132.5, 47.7], Yalu: [124.3, 39.85],
  'Yellow River': [119.0, 37.75], Yangtze: [121.85, 31.4], 'Pearl River': [113.6, 22.2],
  Tarim: [88.32, 39.47], 'Syr Darya': [61.0, 46.2], 'Amu Darya': [59.5, 44.0],
  Helmand: [61.2, 31.1], Indus: [67.4, 24.0], Ganges: [90.5, 22.0],
  Brahmaputra: [89.75, 23.85], Irrawaddy: [95.1, 15.75], Mekong: [106.6, 9.5],
  Salween: [97.6, 16.5], Murray: [138.9, -35.55], Narmada: [72.6, 21.6],
  Godavari: [82.3, 16.7], Krishna: [80.9, 15.75],
};

// Additional downstream termini of a multi-outlet system. NE stops the
// Hooghly above the coastal ocean polygon and the Padma at its Jamuna junction;
// neither passes a generic coast-distance test, but both drain out of this graph.
// Match only actual terminal nodes within JOIN_KM, never nearby interior bends.
const RIVER_OUTLET_COORDS = {
  Ganges: [[88.087058,22.217714], [89.749282,23.848054]],
};

const RIVER_REVERSE = new Map([
  ['Nile', null], ['Tigris', null], ['Dicle', null], ['Tocantins', null],
  ['Don', null], ['Zambezi', null], ['Irtysh', null], ['Al Furat', null],
  ['Euphrates', null],
  // Interior rivers whose nearest-ocean terminus is the SOURCE, not the mouth —
  // pin the real mouth (Mississippi-tributary confluences) explicitly.
  ['Ohio', [-89.1, 37.0]],       // Cairo, IL — junction with the Mississippi
  ['Missouri', [-90.1, 38.8]],   // near St. Louis — junction with the Mississippi
  // Volga drains to the (endorheic) Caspian, correctly found as coastal, but it
  // ships as a mixed multi-segment network AUTO won't touch — pin + curate it.
  ['Volga', [48.6, 46.0]],       // Astrakhan delta, Caspian Sea
  // Dnipro (Dnieper) ships as two NE features; the upper one's mouth sits 77 km
  // inland, just past the coastal auto-gate, so name it to keep both halves
  // flowing the same way toward the Black Sea.
  ['Dnipro', null],
  // Rupert (Quebec, into James Bay) ships as two features; the main one auto-flips
  // but a 24 km stub is too short to clear the gradient gate, so both halves only
  // agree when Rupert is named here.
  ['Rupert', null],
  // Amur (mouth: Sea of Okhotsk at Nikolayevsk-on-Amur) is ~85% backwards but the
  // AUTO decisiveness ratio (down < up*0.12) doesn't quite clear on the full
  // multi-feature graph, leaving a mixed river; naming it forces every part.
  ['Amur', null],
  // Dalälven (mouth: Baltic Sea near Älvkarleby, Sweden) is majority-correct with
  // a backwards minority — AUTO requires majority-backwards to fire at all, so a
  // correctly-majority river with a wrong minority needs curation to finish it.
  ['Dalälven', null],
  // Loire ships as two parts both starting at the Nevers bend — one to the Atlantic
  // (correct), one back toward the Massif Central source — so it visibly diverges
  // mid-river. Nearest-ocean (Atlantic) mouth is right; curating flips the bad part.
  ['Loire', null],
  // Rhône: the Lake Geneva "Lake Centerline" segment is stored west→east (into the
  // lake from Geneva) — reversed. Mediterranean mouth is found fine; curate to flip.
  ['Rhône', null],
  // Bratul Chillia — the Danube's Chilia arm — is stored flowing inland; pin its
  // real mouth on the Black Sea so it drains east into the sea.
  ['Bratul Chillia', [29.71, 45.30]],
  // St. Lawrence: NE 50m ships only a stub near the Thousand Islands; RIVER_ADD
  // supplies the full Kingston→Gulf channel. Pin the Gulf mouth to orient both.
  ['St. Lawrence', [-64.5, 49.1]],
]);

// Curated river geometry to FILL GAPS in Natural Earth's 50m centerlines. NE
// drops some famous rivers where they widen into estuaries (the St. Lawrence
// below Montreal is simply absent), which reads as a broken, half-missing river.
// Each entry is a hand-traced centerline in DOWNSTREAM order (source→mouth) so the
// flow animation runs the right way; it's appended before orientation, so a curated
// RIVER_REVERSE entry still keeps it (and any overlapping NE stub) consistent.
const RIVER_ADD = [
  // Natural Earth stops at Tancarville; continue through the estuary to the
  // Channel rather than ending the selected river upstream of Le Havre.
  { name: 'Seine', scalerank: 4, coordinates: [[0.439255,49.473208],[0.37,49.455],[0.32,49.452],[0.27,49.43],[0.20,49.435],[0.10,49.43]] },
  {
    name: 'St. Lawrence',
    scalerank: 2,
    coordinates: [
      [-76.37, 44.22], // Lake Ontario outlet (Kingston)
      [-75.95, 44.35], // Thousand Islands
      [-75.30, 44.72],
      [-74.73, 45.01], // Cornwall (meets NE's existing stub)
      [-74.02, 45.25],
      [-73.55, 45.50], // Montreal
      [-73.10, 46.00], // Lac Saint-Pierre
      [-72.55, 46.35], // Trois-Rivières
      [-71.85, 46.62],
      [-71.21, 46.86], // Quebec City
      [-70.35, 47.25], // estuary
      [-69.55, 47.75],
      [-68.40, 48.40],
      [-66.90, 48.95],
      [-64.50, 49.10], // Gulf of St. Lawrence
    ],
  },
];

function riverOceanDistFn(oceanGeo) {
  const pts = [];
  const pushRing = (r) => { for (const [x, y] of r) pts.push([x, y]); };
  for (const f of oceanGeo.features) {
    const g = f.geometry;
    if (g.type === 'Polygon') g.coordinates.forEach(pushRing);
    else if (g.type === 'MultiPolygon') g.coordinates.forEach((poly) => poly.forEach(pushRing));
  }
  const rad = (d) => (d * Math.PI) / 180;
  return (p) => {
    let best = Infinity;
    const cx = Math.cos(rad(p[1]));
    for (const o of pts) {
      const dx = (p[0] - o[0]) * cx, dy = p[1] - o[1];
      const d = dx * dx + dy * dy;
      if (d < best) best = d;
    }
    return Math.sqrt(best) * 111; // squared-degrees -> km (approx)
  };
}

const riverSegKm = (a, b) => {
  const rad = (d) => (d * Math.PI) / 180;
  const cx = Math.cos(rad((a[1] + b[1]) / 2));
  return Math.hypot((a[0] - b[0]) * cx, a[1] - b[1]) * 111;
};
// Some named rivers (Rupert is the case that surfaced this) ship as multiple NE
// features whose own parts are internally INCONSISTENT — some correctly digitized
// source->mouth, others mouth->source. Reversing a whole feature as one block (the
// original approach) fixes the wrong parts but flips the already-correct ones,
// producing a river that visually "converges" mid-course instead of flowing
// continuously. So orientation must decide PER PART, grouped by name (so a
// river's parts across multiple NE features share one graph and one mouth).
//
// Reversal is per PART, not per feature: two guards keep this from misfiring on
// rivers that drain away from their nearest ocean (Andes-sourced Amazon
// tributaries, the Niger bend, Rockies-to-Arctic rivers — see RIVER_REVERSE).
//   1. AUTO: only when the named river's mouth is genuinely coastal (<60 km) and
//      the reversal is decisive (>=88% of the river's length currently flows
//      the wrong way) — near-zero false-positive risk.
//   2. CURATED (RIVER_REVERSE): hand-verified names where the nearest-ocean
//      terminus IS the real mouth — trusted per-part, including mixed-direction
//      rivers and short stubs too small to clear the AUTO gates.
// Two NE features representing the same named river (different digitization
// passes) can place what's really one junction up to ~500m apart — exact-string
// coordinate matching treats those as two unrelated dangling ends and silently
// loses the connection. Cluster endpoints by real distance instead: any two
// endpoints within JOIN_KM of each other are the same physical node.
const JOIN_KM = 2;
function clusterEndpoints(entries) {
  const pts = []; // one entry per (part, 'start'|'end')
  entries.forEach((e, i) => {
    pts.push({ coord: e.line[0], i, role: 'ka' });
    pts.push({ coord: e.line[e.line.length - 1], i, role: 'kb' });
  });
  const parent = pts.map((_, idx) => idx);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
  const rad = (d) => (d * Math.PI) / 180;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      if (pts[i].i === pts[j].i) continue; // don't merge a part's own two ends
      const [x1, y1] = pts[i].coord, [x2, y2] = pts[j].coord;
      const cx = Math.cos(rad((y1 + y2) / 2));
      if (Math.hypot((x1 - x2) * cx, y1 - y2) * 111 < JOIN_KM) union(i, j);
    }
  }
  const clusterCoord = new Map();
  pts.forEach((p, idx) => { const k = `c${find(idx)}`; if (!clusterCoord.has(k)) clusterCoord.set(k, p.coord); });
  pts.forEach((p, idx) => { entries[p.i][p.role] = `c${find(idx)}`; });
  return clusterCoord;
}

function orientRiverParts(rivers, distOcean) {
  const groups = new Map(); // name -> [{fi, pi, line}]
  rivers.features.forEach((f, fi) => {
    const name = PERSONAL_RIVER_BY_REACH.get(f.properties.name) ?? f.properties.name;
    if (!name) return; // unnamed rivers: no curation possible, leave as NE shipped them
    const g = f.geometry;
    const lines = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
    lines.forEach((line, pi) => {
      if (!line || line.length < 2) return;
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push({ fi, pi, line });
    });
  });

  const toReverse = []; // {fi, pi}
  for (const [name, entries] of groups) {
    const coord = clusterEndpoints(entries); // sets e.ka / e.kb as cluster ids
    const adj = new Map();
    const add = (a, b, length) => {
      if (!adj.has(a)) adj.set(a, new Map());
      const previous = adj.get(a).get(b) ?? Infinity;
      adj.get(a).set(b, Math.min(previous, length));
    };
    for (const e of entries) {
      let length = 0;
      for (let i = 1; i < e.line.length; i++) length += riverSegKm(e.line[i - 1], e.line[i]);
      add(e.ka, e.kb, Math.max(length, 0.001));
      add(e.kb, e.ka, Math.max(length, 0.001));
    }
    // Count distinct neighbours, not duplicate NE digitizations of the same edge.
    const deg = new Map([...adj].map(([key, neighbours]) => [key, neighbours.size]));
    const allTermini = [...deg.keys()].filter(k => deg.get(k) === 1);
    const curated = !!RIVER_MOUTH_COORDS[name] || RIVER_REVERSE.has(name);
    const mouthHint = RIVER_MOUTH_COORDS[name] ?? RIVER_REVERSE.get(name) ?? null;
    if (!curated && allTermini.length < 2) continue;
    const td = (allTermini.length ? allTermini : [...deg.keys()])
      .map(k => ({ k, d: distOcean(coord.get(k)) })).sort((a, b) => a.d - b.d);
    const gradient = td[td.length - 1].d - td[0].d > 150 && td[td.length - 1].d > td[0].d * 1.4;
    if (!curated && !gradient) continue;

    // Orient PER CONNECTED COMPONENT. NE frequently ships a river as two or more
    // overlapping digitizations that never share a node (the Volga is 16 parts in
    // two disconnected chains) — a single BFS from one mouth would leave the other
    // chain unoriented and guessing. Instead every component is oriented on its own
    // topology toward its own mouth-ward terminus: the one nearest the curated
    // mouth hint when given (Ohio/Missouri/Volga, whose true mouth is not their
    // nearest-ocean end), otherwise the one nearest the sea.
    const ref = mouthHint ? (k) => riverSegKm(coord.get(k), mouthHint) : (k) => distOcean(coord.get(k));
    const depth = new Map();
    const seen = new Set();
    for (const startNode of adj.keys()) {
      if (seen.has(startNode)) continue;
      const nodes = [startNode]; seen.add(startNode);
      for (let i = 0; i < nodes.length; i++) {
        for (const m of adj.get(nodes[i]).keys()) if (!seen.has(m)) { seen.add(m); nodes.push(m); }
      }
      // component mouth = its own terminus nearest the reference (hint or ocean);
      // a pure-cycle component (no terminus) falls back to its nearest-ref node.
      const choices = nodes.filter((k) => deg.get(k) === 1);
      const cmouth = (choices.length ? choices : nodes)
        .map((k) => ({ k, d: ref(k) })).sort((a, b) => a.d - b.d)[0].k;
      // Weighted distance avoids tied hop counts on unequal-length braids.
      // Seed all coastal outlets of a delta, so sibling distributaries do not
      // incorrectly flow back inland toward one arbitrarily chosen outlet.
      const canonicalFacts = PERSONAL_RIVER_INFO[name];
      const aliases = PERSONAL_RIVERS[name] ?? [];
      const mouthType = RIVER_SYSTEM[name]?.mouth?.type ?? canonicalFacts?.[2]
        ?? aliases.map(alias => RIVER_INFO[alias]?.mouth?.type).find(Boolean);
      const coastal = ['ocean', 'sea', 'gulf', 'bay', 'estuary'].includes(mouthType);
      const outlets = coastal && mouthHint ? choices.filter(k => ref(k) < 180 && distOcean(coord.get(k)) < 20) : [];
      const explicitOutlets=choices.filter(k=>(RIVER_OUTLET_COORDS[name]??[])
        .some(point=>riverSegKm(coord.get(k),point)<JOIN_KM));
      const roots = [...new Set([...outlets,...explicitOutlets])];
      if(!roots.length)roots.push(cmouth);
      for (const key of nodes) depth.set(key, Infinity);
      for (const key of roots) depth.set(key, 0);
      const pending = new Set(nodes);
      while (pending.size) {
        let nearest;
        for (const key of pending) if (nearest == null || depth.get(key) < depth.get(nearest)) nearest = key;
        pending.delete(nearest);
        for (const [next, length] of adj.get(nearest)) {
          if (depth.get(nearest) + length < depth.get(next)) depth.set(next, depth.get(nearest) + length);
        }
      }
    }

    let down = 0, up = 0;
    const upParts = [];
    for (const e of entries) {
      let da = depth.get(e.ka), db = depth.get(e.kb);
      if (da == null || db == null) continue;
      if (Math.abs(da - db) < 1e-8) {
        da = ref(e.ka); db = ref(e.kb);
        if (Math.abs(da - db) < 1e-8) continue;
      }
      let L = 0;
      for (let i = 1; i < e.line.length; i++) L += riverSegKm(e.line[i - 1], e.line[i]);
      if (da > db) down += L; else { up += L; upParts.push(e); } // da>db: start farther from its mouth => flows toward it => correct
    }
    // Curated names are checked PER PART, unconditionally — a river that's mostly
    // correct with one bad stub (the common case) must still get that stub fixed,
    // so this must NOT be gated on the group's overall up/down majority.
    if (curated) { for (const e of upParts) toReverse.push(e); continue; }
    // AUTO must stay conservative: only touch a name when the WHOLE group is
    // decisively backwards (near-zero false-positive risk), never a minority part.
    if (up > down && td[0].d < 60 && down < up * 0.12) for (const e of upParts) toReverse.push(e);
  }
  return toReverse;
}

// Read raw NE rivers, flip the backwards parts, write the display file. Falls
// back to a straight copy if the 50m ocean reference is missing.
// ---------------------------------------------------------------------------
// Curated hydrography facts (Part-2 enrichment). Natural Earth carries none of
// this, so these are hand-curated tables keyed by NE's exact `name` — same
// convention as RANGE_MAX_ELEV / RIVER_REVERSE. Numbers are canonical figures
// (lake area/depth verifiable via each lake's wikidataid); some water bodies
// (Chad, Urmia, the Arals, Eyre, Great Salt Lake) vary seasonally, so their
// figures are representative, not exact. "Top tier first" — expand over time.
//
// Rivers: source (headwater) + mouth, each typed so the card can say whether a
// river empties into an ocean/sea/lake or flows into another river.
const RIVER_INFO = {
  Amazonas: { source: { type: 'mountain', name: 'the Peruvian Andes (Nevado Mismi)' }, mouth: { type: 'ocean', name: 'Atlantic Ocean' } },
  Ucayali: { source: { type: 'confluence', name: 'the Tambo–Urubamba confluence' }, mouth: { type: 'river', name: 'Amazon' } },
  Nile: { source: { type: 'lake', name: 'Lake Victoria' }, mouth: { type: 'sea', name: 'Mediterranean Sea' } },
  'Victoria Nile': { source: { type: 'lake', name: 'Lake Victoria' }, mouth: { type: 'lake', name: 'Lake Albert' } },
  'Albert Nile': { source: { type: 'lake', name: 'Lake Albert' }, mouth: { type: 'river', name: 'White Nile' } },
  Mississippi: { source: { type: 'lake', name: 'Lake Itasca' }, mouth: { type: 'gulf', name: 'Gulf of Mexico' } },
  Missouri: { source: { type: 'mountain', name: 'the Rocky Mountains (Three Forks)' }, mouth: { type: 'river', name: 'Mississippi' } },
  Yangtze: { source: { type: 'glacier', name: 'the Tanggula Mountains, Tibetan Plateau' }, mouth: { type: 'sea', name: 'East China Sea' } },
  'Chang Jiang': { source: { type: 'glacier', name: 'the Tanggula Mountains, Tibetan Plateau' }, mouth: { type: 'sea', name: 'East China Sea' } },
  Huang: { source: { type: 'mountain', name: 'the Bayan Har Mountains, Tibetan Plateau' }, mouth: { type: 'sea', name: 'Bohai Sea' } },
  Ganges: { source: { type: 'glacier', name: 'the Gangotri Glacier, Himalayas' }, mouth: { type: 'bay', name: 'Bay of Bengal' } },
  Yamuna: { source: { type: 'glacier', name: 'the Yamunotri Glacier, Himalayas' }, mouth: { type: 'river', name: 'Ganges' } },
  Indus: { source: { type: 'mountain', name: 'the Tibetan Plateau near Lake Manasarovar' }, mouth: { type: 'sea', name: 'Arabian Sea' } },
  Tigris: { source: { type: 'lake', name: 'Lake Hazar, Taurus Mountains' }, mouth: { type: 'river', name: 'Shatt al-Arab' } },
  Euphrates: { source: { type: 'mountain', name: 'the Armenian Highlands (Murat–Karasu)' }, mouth: { type: 'river', name: 'Shatt al-Arab' } },
  Danube: { source: { type: 'mountain', name: 'the Black Forest (Brigach–Breg)' }, mouth: { type: 'sea', name: 'Black Sea' } },
  Volga: { source: { type: 'mountain', name: 'the Valdai Hills' }, mouth: { type: 'sea', name: 'Caspian Sea' } },
  Congo: { source: { type: 'mountain', name: 'the East African Rift highlands' }, mouth: { type: 'ocean', name: 'Atlantic Ocean' } },
  Mekong: { source: { type: 'glacier', name: 'the Tibetan Plateau' }, mouth: { type: 'sea', name: 'South China Sea' } },
  Rhine: { source: { type: 'mountain', name: 'the Swiss Alps' }, mouth: { type: 'sea', name: 'North Sea' } },
  'Paraná': { source: { type: 'confluence', name: 'the Paranaíba–Rio Grande confluence' }, mouth: { type: 'estuary', name: 'Río de la Plata' } },
  'Paranaíba': { source: { type: 'mountain', name: 'the Brazilian Highlands' }, mouth: { type: 'river', name: 'Paraná' } },
  Niger: { source: { type: 'mountain', name: 'the Guinea Highlands' }, mouth: { type: 'gulf', name: 'Gulf of Guinea' } },
  Zambezi: { source: { type: 'mountain', name: 'the Kalene Hills, Zambia' }, mouth: { type: 'ocean', name: 'Indian Ocean' } },
  Orinoco: { source: { type: 'mountain', name: 'the Parima Mountains' }, mouth: { type: 'ocean', name: 'Atlantic Ocean' } },
  Colorado: { source: { type: 'mountain', name: 'the Rocky Mountains' }, mouth: { type: 'gulf', name: 'Gulf of California' } },
  Columbia: { source: { type: 'lake', name: 'Columbia Lake, Rocky Mountains' }, mouth: { type: 'ocean', name: 'Pacific Ocean' } },
  Murray: { source: { type: 'mountain', name: 'the Australian Alps' }, mouth: { type: 'ocean', name: 'Southern Ocean' } },
  Darling: { source: { type: 'mountain', name: 'the Great Dividing Range' }, mouth: { type: 'river', name: 'Murray' } },
  'Amu  Darya': { source: { type: 'confluence', name: 'the Pamir Mountains (Panj–Vakhsh)' }, mouth: { type: 'lake', name: 'the Aral Sea' } },
  'Syr Darya': { source: { type: 'mountain', name: 'the Tian Shan' }, mouth: { type: 'lake', name: 'the Aral Sea' } },
  Amur: { source: { type: 'confluence', name: 'the Shilka–Argun confluence' }, mouth: { type: 'sea', name: 'Sea of Okhotsk' } },
  Lena: { source: { type: 'mountain', name: 'the Baikal Mountains' }, mouth: { type: 'sea', name: 'Laptev Sea' } },
  Ob: { source: { type: 'confluence', name: 'the Altai Mountains (Biya–Katun)' }, mouth: { type: 'gulf', name: 'Gulf of Ob' } },
  Yenisey: { source: { type: 'confluence', name: 'the Sayan Mountains near Kyzyl' }, mouth: { type: 'sea', name: 'Kara Sea' } },
  Magdalena: { source: { type: 'mountain', name: 'the Colombian Andes' }, mouth: { type: 'sea', name: 'Caribbean Sea' } },
};

// Lakes: area (km²), max depth (m), salinity category, optional salinity (g/L).
// Named-river sources, rather than a claim to identify every remotest headwater.
// Inland sinks have flow qualifications; water need not reach them year-round.
// Supporting references are included in docs/river-facts-sources.md.
const PERSONAL_RIVER_INFO = {
  Seine: ['spring', 'Source-Seine on the Langres plateau, Burgundy', 'channel', 'English Channel at Le Havre and Honfleur'],
  Yukon: ['lake', 'Marsh Lake (headwaters in the Coast Mountains)', 'sea', 'Bering Sea'],
  Mackenzie: ['lake', 'Great Slave Lake', 'sea', 'Beaufort Sea'],
  Ohio: ['confluence', 'the Allegheny–Monongahela confluence at Pittsburgh', 'river', 'Mississippi'],
  Arkansas: ['mountain', 'the Sawatch Range near Leadville, Colorado', 'river', 'Mississippi'],
  Tennessee: ['confluence', 'the French Broad–Holston confluence near Knoxville', 'river', 'Ohio'],
  Potomac: ['mountain', 'the Potomac Highlands (North Branch at Fairfax Stone)', 'bay', 'Chesapeake Bay'],
  'St. Lawrence': ['lake', 'Lake Ontario', 'gulf', 'Gulf of St. Lawrence'],
  Athabasca: ['glacier', 'the Columbia Icefield in the Canadian Rockies', 'lake', 'Lake Athabasca'],
  'Rio Grande': ['mountain', 'the San Juan Mountains, Colorado', 'gulf', 'Gulf of Mexico'],
  Senegal: ['confluence', 'the Bafing–Bakoye confluence at Bafoulabé', 'ocean', 'Atlantic Ocean'],
  Volta: ['confluence', 'the Black Volta–White Volta confluence (now within Lake Volta)', 'gulf', 'Gulf of Guinea'],
  'White Nile': ['confluence', 'Lake No, where the Bahr el Jebel meets the Bahr el Ghazal', 'river', 'Nile at Khartoum'],
  'Blue Nile': ['lake', 'Lake Tana in the Ethiopian Highlands', 'river', 'Nile at Khartoum'],
  Orange: ['mountain', 'the Drakensberg in Lesotho, where it is called the Senqu', 'ocean', 'Atlantic Ocean'],
  Limpopo: ['confluence', 'the Marico–Crocodile confluence', 'ocean', 'Indian Ocean'],
  Po: ['mountain', 'Monte Viso in the Cottian Alps', 'sea', 'Adriatic Sea'],
  Tiber: ['mountain', 'Monte Fumaiolo in the Apennines', 'sea', 'Tyrrhenian Sea'],
  Rhône: ['glacier', 'the Rhône Glacier in the Swiss Alps', 'sea', 'Mediterranean Sea'],
  Loire: ['mountain', 'Mont Gerbier de Jonc in the Massif Central', 'ocean', 'Atlantic Ocean'],
  Thames: ['spring', 'Thames Head in the Cotswolds (conventional source)', 'sea', 'North Sea'],
  Dnieper: ['mountain', 'the Valdai Hills in Russia', 'estuary', 'Dnieper–Bug Estuary, Black Sea'],
  Ural: ['mountain', 'the southern Ural Mountains', 'sea', 'Caspian Sea'],
  Songhua: ['mountain', 'the Changbai Mountains', 'river', 'Amur'],
  Yalu: ['mountain', 'the Changbai / Paektu mountain region', 'sea', 'Yellow Sea'],
  'Pearl River': ['river system', 'the Xi, Bei and Dong river basins (western headwaters in Yunnan)', 'sea', 'South China Sea'],
  Tarim: ['confluence', 'the Aksu–Yarkand confluence near Aral, Xinjiang', 'lake', 'Taitema Lake (flow-dependent inland terminus; historically Lop Nur)'],
  Helmand: ['mountain', 'the Hindu Kush west of Kabul', 'wetland', 'the Hamun lakes and wetlands in the Sistan Basin (flow-dependent)'],
  Irrawaddy: ['confluence', 'the Mali–Nmai confluence near Myitkyina', 'sea', 'Andaman Sea via the Irrawaddy Delta'],
  Salween: ['mountain', 'the Tibetan Plateau', 'sea', 'Andaman Sea'],
  Narmada: ['spring', 'Amarkantak in the Maikala Hills', 'gulf', 'Gulf of Khambhat, Arabian Sea'],
  Godavari: ['mountain', 'the Brahmagiri Hills near Trimbakeshwar in the Western Ghats', 'bay', 'Bay of Bengal'],
  Krishna: ['mountain', 'the Western Ghats near Mahabaleshwar', 'bay', 'Bay of Bengal'],
};

const LAKE_INFO = {
  'Gatun Lake':{areaKm2:430,salinity:'freshwater'},
  'Lake Nasser':{areaKm2:6000,salinity:'freshwater'},
  'Lake Baikal': { areaKm2: 31722, maxDepthM: 1642, salinity: 'freshwater' },
  'Lake Superior': { areaKm2: 82100, maxDepthM: 406, salinity: 'freshwater' },
  'Lake Michigan': { areaKm2: 58000, maxDepthM: 281, salinity: 'freshwater' },
  'Lake Huron': { areaKm2: 59600, maxDepthM: 229, salinity: 'freshwater' },
  'Lake Erie': { areaKm2: 25700, maxDepthM: 64, salinity: 'freshwater' },
  'Lake Ontario': { areaKm2: 18960, maxDepthM: 244, salinity: 'freshwater' },
  'Lake Victoria': { areaKm2: 59947, maxDepthM: 81, salinity: 'freshwater' },
  'Lake Tanganyika': { areaKm2: 32900, maxDepthM: 1470, salinity: 'freshwater' },
  'Lake Malawi': { areaKm2: 29500, maxDepthM: 706, salinity: 'freshwater' },
  'Dead Sea': { areaKm2: 605, maxDepthM: 298, salinity: 'hypersaline', salinityGL: 342 },
  'Great Salt Lake': { areaKm2: 4400, maxDepthM: 10, salinity: 'hypersaline' },
  'Lago Titicaca': { areaKm2: 8372, maxDepthM: 281, salinity: 'freshwater' },
  'Lago de Nicaragua': { areaKm2: 8264, maxDepthM: 26, salinity: 'freshwater' },
  'Lake Tahoe': { areaKm2: 495, maxDepthM: 501, salinity: 'freshwater' },
  'Great Bear Lake': { areaKm2: 31000, maxDepthM: 446, salinity: 'freshwater' },
  'Great Slave Lake': { areaKm2: 27000, maxDepthM: 614, salinity: 'freshwater' },
  'Lake Ladoga': { areaKm2: 17700, maxDepthM: 230, salinity: 'freshwater' },
  'Lake Onega': { areaKm2: 9700, maxDepthM: 127, salinity: 'freshwater' },
  'Lake Balkhash': { areaKm2: 16400, maxDepthM: 26, salinity: 'brackish' },
  'Issyk-Kul': { areaKm2: 6236, maxDepthM: 668, salinity: 'brackish', salinityGL: 6 },
  'Lake Chad': { areaKm2: 1350, maxDepthM: 11, salinity: 'freshwater' },
  'Lake Winnipeg': { areaKm2: 24514, maxDepthM: 36, salinity: 'freshwater' },
  'Lake Turkana': { areaKm2: 6405, maxDepthM: 109, salinity: 'brackish', salinityGL: 2.5 },
  'Lake Van': { areaKm2: 3755, maxDepthM: 451, salinity: 'saline', salinityGL: 22 },
  'Lake Urmia': { areaKm2: 5200, maxDepthM: 16, salinity: 'hypersaline' },
  'North Aral Sea': { areaKm2: 3300, maxDepthM: 42, salinity: 'saline' },
  'South Aral Sea': { areaKm2: 3500, maxDepthM: 30, salinity: 'hypersaline' },
  'Lake Athabasca': { areaKm2: 7850, maxDepthM: 124, salinity: 'freshwater' },
  'Lake Geneva': { areaKm2: 580, maxDepthM: 310, salinity: 'freshwater' },
  'Lake Sevan': { areaKm2: 1242, maxDepthM: 80, salinity: 'freshwater' },
  'Lake Winnipegosis': { areaKm2: 5403, maxDepthM: 12, salinity: 'freshwater' },
  'Lake Eyre North': { areaKm2: 8430, maxDepthM: 15, salinity: 'hypersaline' },
};

// Flatten RIVER_INFO onto each river feature as scalar props (MapLibre GeoJSON
// sources expose scalar properties most reliably). No-op for uncurated rivers.
function applyRiverInfo(rivers) {
  for (const f of rivers.features) {
    applyFeatureNative(f.properties, RIVER_NATIVE[f.properties.name]);
    const info = RIVER_INFO[f.properties.name];
    if (!info) continue;
    f.properties.source_type = info.source.type;
    f.properties.source_name = info.source.name;
    f.properties.mouth_type = info.mouth.type;
    f.properties.mouth_name = info.mouth.name;
  }
}

// Rivers that change name along their course. Natural Earth stores each named
// reach as a separate feature (Lancang→Mekong, Maquan→Yarlung→Dihang→Brahmaputra),
// which read as unrelated rivers. Overview labels use the familiar system name;
// detailed labels preserve the local reach name beside it. Any reach reports the
// whole system on click and highlights EVERY member reach as one river.
// Keyed by system; `members` are NE's exact reach names, source→mouth order.
const RIVER_SYSTEM = {
  Salween: {
    name: 'Salween', members: ['Nu', 'Salween'],
    // https://www.internationalrivers.org/where-we-work/asia/salween/
    note: 'Known as the Nu in China and Thanlwin in Myanmar, these reaches form the same Salween River.',
  },
  Yangtze: {
    name: 'Yangtze', members: ['Tuotuo', 'Tongtian', 'Jinsha', 'Chang Jiang', 'Yangtze'],
    // https://www.edb.gov.hk/attachment/en/curriculum-development/kla/pshe/national-geography/national-geography-resource-portal/Info_Sheet_12-rivers-eng.pdf
    note: 'The Yangtze is also known as Chang Jiang. Tuotuo, Tongtian and Jinsha name successive upper reaches; the map preserves these local names as parts of the same river.',
  },
  Irrawaddy: {
    name: 'Irrawaddy / Ayeyarwady', members: ['Ayeyarwady', 'Irrawaddy Delta'],
    // https://eros.usgs.gov/earthshots/ayeyarwady-delta-myanmar
    note: 'Irrawaddy and Ayeyarwady are alternative names for the same river. The Irrawaddy Delta features are its downstream distributary channels, rather than a separate river.',
  },
  Mekong: {
    name: 'Lancang / Mekong',
    members: ['Za', 'Lancang', 'Mekong'],
    source: { type: 'glacier', name: 'the Tibetan Plateau' },
    mouth: { type: 'sea', name: 'South China Sea' },
    note: 'Known as the Lancang (澜沧江) in China, it becomes the Mekong from the China–Laos border and flows through Laos, Thailand, Cambodia and Vietnam to its delta.',
  },
  Brahmaputra: {
    name: 'Yarlung Tsangpo / Brahmaputra',
    members: ['Maquan', 'Yarlung', 'Dihang', 'Brahmaputra'],
    source: { type: 'glacier', name: 'the Angsi Glacier, Tibet' },
    mouth: { type: 'sea', name: 'Bay of Bengal' },
    note: 'Rises in Tibet as the Maquan and Yarlung Tsangpo, cuts the Himalaya as the Dihang, becomes the Brahmaputra in Assam, and joins the Ganges in Bangladesh as the Jamuna.',
  },
};

// Flatten RIVER_SYSTEM onto every member reach: the shared display name, the
// pipe-joined member list (so a click can highlight the whole system), the
// name-change note, and the system-wide source/mouth (overriding per-reach info).
function applyRiverSystem(rivers) {
  const byName = {};
  for (const [canonical, aliases] of Object.entries(PERSONAL_RIVERS)) {
    const curated = RIVER_SYSTEM[canonical];
    const extra = PERSONAL_RIVER_INFO[canonical];
    const facts = extra ? { source: { type: extra[0], name: extra[1] }, mouth: { type: extra[2], name: extra[3] } }
      : aliases.map(name => RIVER_INFO[name]).find(Boolean);
    if (!(curated?.source ?? facts?.source) || !(curated?.mouth ?? facts?.mouth)) throw new Error(`Missing river facts: ${canonical}`);
    if (!RIVER_MOUTH_COORDS[canonical]) throw new Error(`Missing downstream reference: ${canonical}`);
    const sys = {
      ...facts,
      name: canonical,
      members: aliases,
      note: FEATURE_ADDITIONS[canonical]?.story ?? (aliases.length > 1 ? `Mapped reach names for this river: ${aliases.join(', ')}.` : ''),
      ...curated,
      label: canonical,
    };
    for (const member of sys.members) byName[member] = sys;
  }
  for (const f of rivers.features) {
    const sys = byName[f.properties.name];
    if (!sys) continue;
    const p = f.properties;
    p.system_name = sys.name;
    p.system_members = sys.members.join('|');
    p.system_note = sys.note;
    // Compact identity at overview zoom; local name + identity when zoomed in.
    // Keep p.name intact for matching geometry, clicking and highlighting.
    p.label_name = sys.label;
    p.reach_label = p.name === sys.label ? p.name : `${p.name} (${sys.label})`;
    if (sys.source) {
      p.source_type = sys.source.type;
      p.source_name = sys.source.name;
    }
    if (sys.mouth) {
      p.mouth_type = sys.mouth.type;
      p.mouth_name = sys.mouth.name;
    }
  }
}

// Read the (directly-downloaded) lakes.geojson, attach LAKE_INFO by name, and
// rewrite it. Re-running download-geodata.sh re-fetches raw lakes, so this must
// be re-run after — same edit-script→re-run model as everything else.
// Global top-10 rank (1-based) among the curated lakes, one map for area and one
// for max depth. The curated set includes every one of the world's ten largest
// lakes, so area ranks are true world ranks; depth ranks are world ranks among the
// lakes we carry (a few very deep but obscure lakes aren't curated yet). The
// Caspian is intentionally excluded — it's treated as a sea, not a lake.
function lakeRankMap(metric) {
  const ranked = Object.entries(LAKE_INFO)
    .filter(([, v]) => v[metric] != null)
    .sort((a, b) => b[1][metric] - a[1][metric])
    .slice(0, 10);
  const m = {};
  ranked.forEach(([name], i) => { m[name] = i + 1; });
  return m;
}

function enrichLakes() {
  const data = readGeo('lakes.geojson');
  const areaRank = lakeRankMap('areaKm2');
  const depthRank = lakeRankMap('maxDepthM');
  let n = 0;
  for (const f of data.features) {
    applyFeatureNative(f.properties, LAKE_NATIVE[f.properties.name]);
    const info = LAKE_INFO[f.properties.name];
    if (!info) continue;
    f.properties.area_km2 = info.areaKm2;
    f.properties.max_depth_m = info.maxDepthM;
    f.properties.salinity = info.salinity;
    if (info.salinityGL != null) f.properties.salinity_gl = info.salinityGL;
    if (areaRank[f.properties.name]) f.properties.area_rank = areaRank[f.properties.name];
    if (depthRank[f.properties.name]) f.properties.depth_rank = depthRank[f.properties.name];
    n++;
  }
  writeGeo('lakes.geojson', data);
  console.log(`  enriched ${n} lakes with area/depth/salinity (+ global top-10 ranks)`);
}

function processRivers() {
  const rivers = readRaw('rivers-raw.geojson');
  // Selected rivers absent at 50m resolution, taken from NE's detailed source.
  if (rawExists('rivers-10m-raw.geojson')) {
    rivers.features.push(...readRaw('rivers-10m-raw.geojson').features.filter(f => ['Tevere', 'Yalu', 'Pearl'].includes(f.properties.name)));
  }
  // NE groups the North American and Argentine Colorado rivers into one
  // multipart feature. Select individual parts, never discard that whole feature.
  rivers.features = rivers.features.flatMap(f => {
    if (f.properties.name !== 'Colorado') return [f];
    const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
    const selected = lines.filter(line => line.every(([, lat]) => lat > 0));
    if (!selected.length) return [];
    return [{ ...f, geometry: { type: 'MultiLineString', coordinates: selected } }];
  });
  // Fill NE's gaps with curated centerlines (see RIVER_ADD), before orientation
  // so they share their name-group's mouth and stay consistent with any NE stubs.
  for (const add of RIVER_ADD) {
    rivers.features.push({
      type: 'Feature',
      properties: { name: add.name, name_en: add.name, featurecla: 'River', scalerank: add.scalerank, min_zoom: 3, min_label: 4 },
      geometry: { type: 'LineString', coordinates: add.coordinates },
    });
  }
  if (!rawExists('ocean-50m-raw.geojson')) {
    console.log('  ocean-50m-raw.geojson missing — skipping flow-orientation, copying as-is');
    applyRiverInfo(rivers);
    applyRiverSystem(rivers);
    writeGeo('rivers.geojson', rivers);
    return;
  }
  const distOcean = riverOceanDistFn(readRaw('ocean-50m-raw.geojson'));
  const toReverse = orientRiverParts(rivers, distOcean);
  const touchedFeatures = new Set();
  for (const { fi, pi } of toReverse) {
    const g = rivers.features[fi].geometry;
    if (g.type === 'LineString') { g.coordinates.reverse(); }
    else { g.coordinates[pi].reverse(); }
    touchedFeatures.add(fi);
  }
  if (orientRiverParts(rivers, distOcean).length) throw new Error('River orientation failed its downstream consistency check');
  console.log(`  reversed ${toReverse.length} backwards-digitized river parts across ${touchedFeatures.size} features`);
  applyRiverInfo(rivers);
  applyRiverSystem(rivers);
  writeGeo('rivers.geojson', rivers);
}

// Format a numeric UTC offset (e.g. -9.5, 5.75) as "UTC-09:30" / "UTC+05:45".
// This string is the feature's `name`, so every polygon at the same offset
// shares it — the click-highlight then lights the whole worldwide band at once.
function utcLabel(zone) {
  const sign = zone < 0 ? '-' : '+';
  const abs = Math.abs(zone);
  const h = Math.floor(abs);
  const m = Math.round((abs - h) * 60);
  return `UTC${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Natural Earth's 10m time-zone polygons → boundary lines. We keep the polygon
// geometry (the line layer traces the outline, which IS the real, irregular
// zone boundary where it follows coastlines/country borders) and attach a clean
// UTC label + the `places` blurb for the InfoCard. Coords rounded like admin1.
function processTimezones() {
  const tz = readRaw('timezones-raw.geojson');
  const features = tz.features.map((f) => ({
    type: 'Feature',
    properties: {
      zone: f.properties.zone,
      name: utcLabel(f.properties.zone),
      places: f.properties.places || null,
    },
    geometry: { ...f.geometry, coordinates: roundCoords(f.geometry.coordinates) },
  }));
  writeGeo('timezones.geojson', { type: 'FeatureCollection', features });
}

function rawExists(name) {
  return fs.existsSync(path.join(RAW_DIR, name));
}

function main() {
  // Keep the full lake library separate from the selected display file.
  // download-geodata.sh refreshes this raw cache when explicitly run.
  if (!rawExists('lakes-raw.geojson')) throw new Error('Missing full lake library: run bash scripts/download-geodata.sh first');
  fs.copyFileSync(path.join(RAW_DIR, 'lakes-raw.geojson'), path.join(GEO_DIR, 'lakes.geojson'));

  // Raw files in data/raw are a persistent cache — never deleted here.
  // Run scripts/download-geodata.sh to (re)fetch missing ones.
  const tiers = [
    ['countries-110m-raw.geojson', 'countries-110m.geojson'],
    ['countries-50m-raw.geojson', 'countries-50m.geojson'],
    ['countries-10m-raw.geojson', 'countries-10m.geojson'],
  ];
  for (const [raw, out] of tiers) {
    if (rawExists(raw)) {
      console.log(`Processing ${out}...`);
      processCountryTier(raw, out);
    } else {
      console.log(`Skipping ${out} (no ${raw})`);
    }
}

if (rawExists('cities-raw.geojson')) {
  console.log('Processing cities...');
  processCities();
} else {
  console.log('Skipping cities (no cities-raw.geojson)');
}

if (rawExists('admin1-raw.geojson')) {
  console.log('Processing admin-1 subdivisions...');
  processAdmin1();
} else {
  console.log('Skipping admin1 (no admin1-raw.geojson)');
}

if (rawExists('countries-10m-raw.geojson')) {
  console.log('Building country label points...');
  buildCountryLabels();
}

console.log('Building admin-1 label points...');
buildAdmin1Labels();

console.log('Building inset manifest...');
buildInsets();

console.log('Building ocean labels...');
buildOceanLabels();

console.log('Adding curated seas...');
enrichSeas();
buildMarineEditor();

console.log('Building marine hierarchy and selection extents...');
buildMarineHierarchy();

console.log('Building sea labels...');
buildSeaLabels();

// Lake Maracaibo is an inlet omitted by NE's lake inventory. Extract the water
// from the actual 10m coastline; fail rather than inventing a lake polygon.
{
  const lakes = readGeo('lakes.geojson');
  const land = readRaw('countries-10m-raw.geojson');
  const geometry = clipRingToWater([[-72.8, 8.7], [-70.8, 8.7], [-70.8, 10.95], [-72.8, 10.95], [-72.8, 8.7]], land, land.features.map(f => f.geometry ? plainBbox(f.geometry) : [0, 0, 0, 0]));
  if (!geometry) throw new Error('Lake Maracaibo coastline extraction failed');
  lakes.features = lakes.features.filter(f => f.properties.name !== 'Lake Maracaibo');
  lakes.features.push({ type: 'Feature', geometry, properties: { name: 'Lake Maracaibo', featurecla: 'Lake', scalerank: 1 } });
  writeGeo('lakes.geojson', lakes);
}
// Prefer the detailed reservoir shorelines and a consistent English map name.
{
  const lakes=readGeo('lakes.geojson'), detailed=readRaw('lakes-10m-raw.geojson');
  lakes.features=lakes.features.filter(f=>!['Lago Gatun','Lake Nasser'].includes(f.properties.name));
  for(const rawName of ['Lago Gatun','Lake Nasser']) {
    const f=structuredClone(detailed.features.find(f=>f.properties.name===rawName));
    if(!f)throw Error(`Missing detailed lake: ${rawName}`);
    f.properties.name=rawName==='Lago Gatun'?'Gatun Lake':rawName;
    Object.assign(f.properties,FEATURE_ADDITIONS[f.properties.name]);
    lakes.features.push(f);
  }
  writeGeo('lakes.geojson',lakes);
}
buildCanals();
console.log('Building lake labels...');
buildLakeLabels();

console.log('Enriching lakes (area/depth/salinity)...');
enrichLakes();

if (rawExists('rivers-raw.geojson')) {
  console.log('Processing rivers (flow orientation)...');
  processRivers();
} else {
  console.log('Skipping rivers (no rivers-raw.geojson)');
}

if (rawExists('regions-raw.geojson') && rawExists('elevation-points-raw.geojson')) {
  console.log('Building orography (ranges + peaks)...');
  buildOrography();
} else {
  console.log('Skipping orography (regions/elevation raws missing)');
}

if (rawExists('timezones-raw.geojson')) {
  console.log('Processing time zones...');
  processTimezones();
} else {
  console.log('Skipping time zones (no timezones-raw.geojson)');
}

applyPersonalSelection();
buildCatalog();
console.log('Done.');
}


function applyPersonalSelection() {
  const countries = readRaw('countries-10m-raw.geojson').features;
  const continents = new Map(countries.map(f => [ISO2_FIXUP[f.properties.ADM0_A3] ?? f.properties.ISO_A2, f.properties.CONTINENT]));
  // NE uses country ISO 'CN-TW' but subdivision ISO 'TW', among other variants.
  const continentByA3 = new Map(countries.map(f => [f.properties.ADM0_A3, f.properties.CONTINENT]));
  for (const f of readRaw('admin1-raw.geojson').features) {
    const continent = continentByA3.get(f.properties.adm0_a3);
    if (continent && !continents.has(f.properties.iso_a2)) continents.set(f.properties.iso_a2, continent);
  }
  const keepAdmin = iso => {
    const continent = continents.get(iso);
    return ['North America', 'South America'].includes(continent)
      || (continent === 'Asia' && !PERSONAL_ASIA_EXCLUDED.has(iso))
      || PERSONAL_OTHER_ADMIN.has(iso);
  };
  const filterFile = (name, predicate) => {
    const data = readGeo(name + '.geojson');
    data.features = data.features.filter(predicate);
    writeGeo(name + '.geojson', data);
    return data.features;
  };
  filterFile('admin1', f => keepAdmin(f.properties.iso_a2));
  // Production restores this ignored GeoJSON from its tracked compressed copy.
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'packed', 'admin1.geojson.gz'), gzipSync(fs.readFileSync(path.join(GEO_DIR, 'admin1.geojson'))));
  filterFile('admin1-labels', f => keepAdmin(f.properties.iso_a2));
  filterFile('cities', f => f.properties.ADM0CAP === 1 || f.properties.POP_MAX >= 1000000 || f.properties.SHOW_ADMIN1_CAPITAL);
  const riverNames = new Set(Object.values(PERSONAL_RIVERS).flat());
  filterFile('rivers', f => riverNames.has(f.properties.name));
  const lakeNames = new Set(PERSONAL_LAKES);
  for (const file of ['lakes', 'lake-labels']) filterFile(file, f => lakeNames.has(f.properties.name));
  const rangeNames = new Set(PERSONAL_RANGES);
  // Sierra Nevada here means the US range, rather than Spain's namesake.
  for (const file of ['ranges', 'range-labels']) filterFile(file, f => rangeNames.has(f.properties.name) && (f.properties.name !== 'Sierra Nevada' || countryBbox(f.geometry)[0] < -100));
  // Verify both geometry and labels have exactly the requested membership.
  for (const [file, names] of [['ranges', PERSONAL_RANGES], ['range-labels', PERSONAL_RANGES], ['lakes', PERSONAL_LAKES], ['lake-labels', PERSONAL_LAKES]]) {
    const actual = new Set(readGeo(file + '.geojson').features.map(f => f.properties.name));
    const missing = names.filter(name => !actual.has(name));
    if (missing.length) throw new Error(`${file}: missing selections: ${missing.join(', ')}`);
  }
  const oldPeaks = readGeo('peaks.geojson').features;
  writeGeo('peaks.geojson', { type: 'FeatureCollection', features: PERSONAL_PEAKS.map(([name, elevation, lon, lat], i) => ({
    type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: { ...(oldPeaks.find(f => f.properties.name === name)?.properties ?? {}), name, elevation, scalerank: 1, elevation_rank: i + 1, ...FEATURE_ADDITIONS[name], ...(FIVE_YUE_NATIVE[name] ? {name_native:FIVE_YUE_NATIVE[name],name_native_lang:'zh',NATIVE_ON_MAP:true} : {}) },
  })) });
  // Generate the human-readable inventory from the exact display files.
  const sections = [
    ['Countries and territories', 'countries-labels'], ['Subdivisions', 'admin1-labels'],
    ['Cities', 'cities'], ['Rivers (local reach names)', 'rivers'], ['Canals','canals'], ['Lakes', 'lake-labels'],
    ['Mountain ranges', 'range-labels'], ['Peaks', 'peaks'], ['Oceans', 'ocean-labels'], ['Marine areas', 'sea-labels'],
  ];
  let md = '# My geographical atlas\n\nA growing record of the places and features I have come to know. No tiers.\n\nGenerated by `node scripts/process-countries.mjs`; edit PERSONAL_* in that script to change membership. Raw geometry remains a reusable library. Themes, zoom and collisions still determine label visibility.\n\nAll countries/territories remain. All five oceans remain; named marine areas follow PERSONAL_MARINE_EXCLUDED. Cities: national capitals, first-level subdivision capitals of Russia, China, India, USA, Brazil, Canada and Mexico, plus population >= 1 million in the source dataset. Subdivision selections use Natural Earth continents (Russia is Europe); territories follow their geographical continent. The listed European countries are included throughout their available subdivision geometry. Sierra Nevada means the US range. Caspian and Black Sea remain marine features. Aral Sea is included as North and South Aral Sea geometry from the source dataset, not a reconstructed historical shoreline. River labels use the familiar identity at overview zoom and local reach names with that identity from zoom 6.5; selecting any reach highlights the whole river.\n\n## River selections and source aliases\n\n| Selection | Local reach names |\n|---|---|\n' + Object.entries(PERSONAL_RIVERS).map(([name, aliases]) => `| ${name} | ${aliases.join(', ')} |`).join('\n') + '\n';
  for (const [title, file] of sections) {
    const features = readGeo(file + '.geojson').features;
    const rows = [...new Set(features.map(f => {
      const p = f.properties;
      return [p.name ?? p.NAME, p.admin ?? p.ADM0NAME ?? '', p.elevation != null ? `${p.elevation} m` : ''].filter(Boolean).join(' — ');
    }).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    md += `\n## ${title}\n\n${features.length} records; ${rows.length} distinct catalog entries. Multiple geometry records can represent one feature.\n\n` + rows.map(x => '- ' + x).join('\n') + '\n';
  }
  const riverFeatures = readGeo('rivers.geojson').features;
  md += '\n## River sources and mouths\n\nSources describe the named river or its stated headwaters. Inland termini may be seasonal or regulated. See [research references](river-facts-sources.md).\n\n| River | Source | Mouth / terminus |\n|---|---|---|\n';
  for (const name of Object.keys(PERSONAL_RIVERS)) {
    const p = riverFeatures.find(f => f.properties.label_name === name)?.properties;
    if (!p?.source_name || !p?.mouth_name) throw new Error(`Incomplete river card: ${name}`);
    md += `| ${name} | ${p.source_name} | ${p.mouth_name} |\n`;
  }
  const missing = Object.entries(PERSONAL_RIVERS).filter(([, aliases]) => !riverFeatures.some(f => aliases.includes(f.properties.name))).map(([name]) => name);
  if (missing.length) throw new Error('Selected rivers missing geometry: ' + missing.join(', '));
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'my-atlas.md'), md);
}


// Importing the geometry helpers for regression checks must not rebuild assets.
export { orientRiverParts, riverOceanDistFn, PERSONAL_RIVERS, PERSONAL_LAKES, PERSONAL_RANGES, PERSONAL_PEAKS };
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

// Human-readable tables use the selected display data, never the unpruned library.
function buildCatalog() {
  const reference = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'catalog-reference.json'), 'utf8'));
  const fact = (category, name) => reference.features[`${category}:${name}`] ?? {};
  const url = item => item.sourceUrl ?? (item.id ? `https://www.wikidata.org/wiki/${item.id}` : undefined);
  const tidyCountry = name => ({ "People's Republic of China": 'China', 'Czech Republic': 'Czechia' }[name] ?? name);
  // Structured country statements sometimes describe basins or broader mountain
  // systems. These explicit geographic overrides keep table membership meaningful.
  const countryOverrides = {
    'rivers:Danube': ['Germany', 'Austria', 'Slovakia', 'Hungary', 'Croatia', 'Serbia', 'Romania', 'Bulgaria', 'Moldova', 'Ukraine'],
    'rivers:Nile': ['Uganda', 'South Sudan', 'Sudan', 'Egypt'],
    'rivers:White Nile': ['Uganda', 'South Sudan', 'Sudan'],
    'rivers:Congo': ['Democratic Republic of the Congo', 'Republic of the Congo', 'Angola'],
    'rivers:Zambezi': ['Zambia', 'Angola', 'Namibia', 'Botswana', 'Zimbabwe', 'Mozambique'],
    'rivers:Ganges': ['India', 'Bangladesh'],
    'rivers:Brahmaputra': ['China', 'India', 'Bangladesh'],
    'ranges:Ural Mountains': ['Russia', 'Kazakhstan'],
    'ranges:Caucasus Mountains': ['Russia', 'Georgia', 'Azerbaijan', 'Armenia'],
    'ranges:Alps': ['France', 'Monaco', 'Italy', 'Switzerland', 'Liechtenstein', 'Germany', 'Austria', 'Slovenia'],
    'ranges:Himalayas': ['Pakistan', 'India', 'China', 'Nepal', 'Bhutan'],
    'ranges:Karakoram Range': ['Pakistan', 'India', 'China'],
    'ranges:Appalachian Mountains': ['Canada', 'United States'],
    'peaks:K2': ['Pakistan', 'China'],
  };
  const countriesFor = (category, name) => (FEATURE_ADDITIONS[name]?.countries ?? countryOverrides[`${category}:${name}`] ?? fact(category, name).countries ?? []).map(tidyCountry);
  const preferredLakeVolumes = { 'Tai Hu': 4.4, 'Lake Superior': 12100, 'Lake Michigan': 4920, 'Lake Huron': 3540, 'Lake Erie': 484, 'Lake Ontario': 1640 };
  const processedCountries = readGeo('countries-10m.geojson').features;
  const rawCountries = new Map(readRaw('countries-10m-raw.geojson').features.map(f => [f.properties.ADM0_A3, f.properties]));
  const rawCities = readRaw('cities-raw.geojson').features;
  const isoFor = p => ({ TWN: 'TW', PSX: 'PS', KOS: 'XK' }[p.ADM0_A3] ?? (p.ISO_A2?.length === 2 ? p.ISO_A2 : null));
  const countryNames = new Map(processedCountries.map(f => [isoFor(f.properties), f.properties.NAME_LONG || f.properties.NAME]));
  const countryRows = [...new Map(processedCountries.map(f => [f.properties.ADM0_A3, f])).values()].map(f => {
    const p = f.properties, raw = rawCountries.get(p.ADM0_A3), iso = isoFor(p);
    const capitalData = fact('countries', p.ADM0_A3);
    const capitalOverrides = { PSX: ['East Jerusalem (claimed)', 'Ramallah (administrative)'], NRU: ['Yaren (seat of government; no official capital)'] };
    const capitals = capitalOverrides[p.ADM0_A3] ?? capitalData.capitals ?? rawCities.filter(c => c.properties.ADM0CAP === 1 && c.properties.ADM0NAME === raw?.ADMIN).map(c => c.properties.NAME);
    return { id: p.ADM0_A3, name: p.NAME_LONG || p.NAME, iso2: iso, capital: [...new Set(capitals)].join(' · ') || null, population: p.POP_EST >= 0 ? Math.round(p.POP_EST) : null, populationYear: raw?.POP_YEAR > 0 ? raw.POP_YEAR : null, sourceUrl: url(capitalData) };
  });
  const cityRows = readGeo('cities.geojson').features.map((f, i) => ({ id: `city-${i}`, name: f.properties.NAME, country: countryNames.get(f.properties.ISO_A2) ?? f.properties.ADM0NAME, role: f.properties.CITY_ROLE, capitalOf: f.properties.CAPITAL_OF, note: f.properties.CAPITAL_NOTE, population: f.properties.POP_MAX > 0 ? f.properties.POP_MAX : null }));
  const selectedRivers = readGeo('rivers.geojson').features;
  const riverRows = Object.keys(PERSONAL_RIVERS).map(name => {
    const p = selectedRivers.find(f => f.properties.label_name === name).properties;
    const data = fact('rivers', name);
    return { id: name, name, aliases: PERSONAL_RIVERS[name], countries: countriesFor('rivers', name), length: name === 'Tarim' ? 1321 : data.lengthKm?.value ?? null, lengthYear: data.lengthKm?.year ?? null, source: p.source_name, mouth: p.mouth_name, ...FEATURE_ADDITIONS[name], sourceUrl: FEATURE_ADDITIONS[name]?.sourceUrl ?? url(data) };
  });
  riverRows.push({id:'Suez Canal',name:'Suez Canal',kind:'canal',length:193.3,countries:['Egypt'],source:'Mediterranean Sea (Port Said)',mouth:'Gulf of Suez (Suez)',...FEATURE_ADDITIONS['Suez Canal']});
  const lakeRows = [...new Map(readGeo('lakes.geojson').features.map(f => [f.properties.name, f])).values()].map(f => {
    const p = f.properties, data = fact('lakes', p.name);
    const displayName = { 'Tai Hu': 'Taihu', 'Qinghai Hu': 'Qinghai Lake', 'Lago de Nicaragua': 'Lake Nicaragua', 'Lago de Managua': 'Lake Managua', 'Lago Titicaca': 'Lake Titicaca' }[p.name] ?? p.name;
    return { id: p.name, name: displayName, area: data.areaKm2?.value ?? p.area_km2 ?? null, areaYear: data.areaKm2?.year ?? null, volume: preferredLakeVolumes[p.name] ?? data.volumeKm3?.value ?? null, volumeYear: data.volumeKm3?.year ?? null, countries: countriesFor('lakes', p.name), ...FEATURE_ADDITIONS[p.name], sourceUrl: FEATURE_ADDITIONS[p.name]?.sourceUrl ?? (p.name === 'Tai Hu' ? 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4730468/' : p.name in preferredLakeVolumes ? 'https://www.epa.gov/greatlakes/physical-features-great-lakes' : url(data)) };
  });
  // Spherical polygon area: a transparent measurement of the generalized map
  // footprint, not a claim about an exact geological boundary.
  const ringArea = ring => {
    let area = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      let dLon = (ring[i + 1][0] - ring[i][0]) * Math.PI / 180;
      if (dLon > Math.PI) dLon -= 2 * Math.PI;
      if (dLon < -Math.PI) dLon += 2 * Math.PI;
      area += dLon * (2 + Math.sin(ring[i][1] * Math.PI / 180) + Math.sin(ring[i + 1][1] * Math.PI / 180));
    }
    return Math.abs(area * 6371.0088 ** 2 / 2);
  };
  const polygonArea = rings => Math.max(0, ringArea(rings[0]) - rings.slice(1).reduce((n, ring) => n + ringArea(ring), 0));
  const rangeRows = readGeo('ranges.geojson').features.map((f, i) => ({ id: `range-${i}`, name: f.properties.name, area: Math.round((f.geometry.type === 'Polygon' ? polygonArea(f.geometry.coordinates) : f.geometry.coordinates.reduce((n, poly) => n + polygonArea(poly), 0)) / 1000) * 1000, countries: countriesFor('ranges', f.properties.name), ...FEATURE_ADDITIONS[f.properties.name], sourceUrl: FEATURE_ADDITIONS[f.properties.name]?.sourceUrl ?? url(fact('ranges', f.properties.name)) }));
  const peakRows = readGeo('peaks.geojson').features.map(f => ({ id: f.properties.name, name: f.properties.name, elevation: f.properties.elevation, countries: countriesFor('peaks', f.properties.name), ...FEATURE_ADDITIONS[f.properties.name], sourceUrl: FEATURE_ADDITIONS[f.properties.name]?.sourceUrl ?? url(fact('peaks', f.properties.name)) }));
  const oceanSettings = { 'Pacific Ocean': 'Between Asia & Oceania and the Americas', 'Atlantic Ocean': 'Between the Americas and Europe & Africa', 'Indian Ocean': 'Between Africa, Asia and Australia', 'Arctic Ocean': 'Around the North Pole, north of Eurasia and North America', 'Southern Ocean': 'Encircling Antarctica; conventionally south of 60° S' };
  const oceanRows = readGeo('ocean-labels.geojson').features.map(f => ({ id: f.properties.name, name: f.properties.name, setting: oceanSettings[f.properties.name], waters: f.properties.water_children, sourceUrl: 'https://oceanservice.noaa.gov/facts/howmanyoceans.html' }));
  const seaRows = [...new Map(readGeo('seas.geojson').features.filter(f => f.properties.featurecla !== 'ocean').map(f => [f.properties.name, f])).values()].map(f => {
    const p = f.properties;
    if (!p.water_ocean) throw new Error(`Missing catalog ocean association: ${p.name}`);
    return { id: p.name, name: p.name, kind: (p.featurecla ?? 'marine area').replace(/^./, c => c.toUpperCase()), parent: p.water_parent || null, ocean: p.water_ocean, story: FEATURE_ADDITIONS[p.name]?.story,  sourceUrl: FEATURE_ADDITIONS[p.name]?.sourceUrl ?? (p.wikidataid ? `https://www.wikidata.org/wiki/${p.wikidataid}` : undefined) };
  });
  const sections = [
    { id: 'countries', title: 'Countries & territories', description: 'All political features on the map. Capitals from the reference snapshot; Natural Earth population estimates; the reference year appears below each figure. A dash means no capital is recorded in the source.', rows: countryRows },
    { id: 'cities', title: 'Cities', description: 'National capitals, selected first-level subdivision capitals, and cities with a source population of at least one million. First-level capitals are included for Russia, China, India, USA, Brazil, Canada and Mexico, including shared and seasonal seats. Natural Earth estimates use differing urban definitions and reference dates; these are not current census counts.', rows: cityRows },
    { id: 'rivers', title: 'Rivers & canals', description: 'One row per river or canal, including locally named river reaches. Canal endpoints are terminals, not a direction of flow. Lengths are approximate reference values; headwater conventions vary. Countries include border reaches, not every country in the drainage basin.', rows: riverRows },
    { id: 'lakes', title: 'Lakes', description: 'Reference surface areas and volumes, not live water levels. Available measurement years appear below the figures. A dash means the measurement is not recorded; the Aral Sea is listed as its North and South remnants.', rows: lakeRows },
    { id: 'ranges', title: 'Mountain ranges', description: 'Mapped span is the approximate area of the generalized Natural Earth or curated footprint, rounded to 1,000 km²—not a precise geological boundary. Countries describe conventional range extents.', rows: rangeRows },
    { id: 'peaks', title: 'Peaks', description: 'Selected summits, including the ten highest independent peaks and China’s Five Yue, with elevations in metres above sea level. Border peaks list both countries; territorial claims are described on the map.', rows: peakRows },
    { id: 'oceans', title: 'The five oceans', description: 'The five named basins of one connected global ocean.', rows: oceanRows },
    { id: 'seas', title: 'Seas & coastal waters', description: 'Named seas, bays, gulfs, straits and other marine features already on the map. Part of shows the immediate containing water body. Ocean associations include indirect connections; transitional waters list more than one ocean.', rows: seaRows },
  ];
  for (const section of sections) section.rows.sort((a, b) => a.name.localeCompare(b.name));
  for (const section of sections) if (new Set(section.rows.map(row => row.id)).size !== section.rows.length) throw new Error(`Duplicate catalog rows: ${section.id}`);
  fs.writeFileSync(path.join(GEO_DIR, 'catalog.json'), JSON.stringify({ retrieved: reference.retrieved, sections }));
  console.log(`  catalog.json: ${sections.map(s => `${s.id}=${s.rows.length}`).join(', ')}`);
}

function buildMarineHierarchy() {
  const full = readGeo('seas.geojson');
  const oceanNames = new Set(OCEAN_LABELS.map(o => o.name));
  const associations = new Map(Object.entries(MARINE_OCEAN_GROUPS).flatMap(([ocean, names]) => names.map(name => [name, ocean])));
  const records = new Map([...oceanNames].map(name => [name, { name, parent: null, ocean: name, geometries: [] }]));
  const canonicalOcean = name => {
    for (const ocean of oceanNames) if (name.toLowerCase().includes(ocean.toLowerCase())) return ocean;
    throw new Error(`Unknown ocean region: ${name}`);
  };
  for (const f of full.features) {
    const name = f.properties.featurecla === 'ocean' ? canonicalOcean(f.properties.name) : f.properties.name;
    if (!records.has(name)) {
      const ocean = associations.get(name);
      if (!ocean) throw new Error(`Missing ocean association: ${name}`);
      records.set(name, { name, ocean, parent: MARINE_PARENT_OVERRIDES[name] ?? (oceanNames.has(ocean) ? ocean : null), geometries: [] });
    }
    records.get(name).geometries.push(f.geometry);
  }
  const pathFor = name => {
    const path = [], visited = new Set();
    for (let node = records.get(name); node; node = node.parent ? records.get(node.parent) : null) {
      if (visited.has(node.name)) throw new Error(`Marine hierarchy cycle: ${name}`);
      visited.add(node.name); path.unshift(node.name);
      if (node.parent && !records.has(node.parent)) throw new Error(`Missing marine parent: ${node.parent}`);
    }
    return path;
  };
  const active = name => !PERSONAL_MARINE_EXCLUDED.has(name);
  for (const record of records.values()) record.path = pathFor(record.name);
  const descendants = name => [...records.values()].filter(r => r.path.includes(name) && r.name !== name);
  const propsFor = name => {
    const r = records.get(name);
    return { selection_name: name, water_parent: r.parent ?? '', water_path: r.path.join('|'), water_depth: r.path.length - 1,
      water_children: descendants(name).filter(r => active(r.name)).length, water_ocean: r.ocean };
  };
  const selections = [], manifest = [];
  for (const record of records.values()) {
    if (!active(record.name)) continue;
    const children = descendants(record.name);
    // Keep the complete physical water extent, including unnamed/unlearned bays.
    // Only active names appear in the manifest, labels and table membership.
    const shapes = [record, ...children].flatMap(r => r.geometries).filter(Boolean).map(g => roundMarineCoordinates(g.coordinates));
    if (!shapes.length) throw new Error(`Missing marine geometry: ${record.name}`);
    const geometry = { type: 'MultiPolygon', coordinates: polygonClipping.union(...shapes) };
    const props = { name: record.name, ...propsFor(record.name) };
    selections.push({ type: 'Feature', properties: props, geometry });
    manifest.push({ name: record.name, parent: record.parent, path: record.path, ocean: record.ocean,
      descendants: children.filter(r => active(r.name)).map(r => r.name) });
  }
  full.features = full.features.filter(f => active(f.properties.name)).map(f => {
    const name = f.properties.featurecla === 'ocean' ? canonicalOcean(f.properties.name) : f.properties.name;
    return { ...f, properties: { ...f.properties, ...propsFor(name) } };
  });
  writeGeo('seas.geojson', full);
  writeGeo('marine-selections.geojson', { type: 'FeatureCollection', features: selections });
  writeGeo('marine-hierarchy.json', manifest);
  const labels = readGeo('ocean-labels.geojson');
  for (const f of labels.features) Object.assign(f.properties, propsFor(f.properties.name));
  writeGeo('ocean-labels.geojson', labels);
}

// Draft files contain offshore handles only; land always comes from the raw dataset.
function buildMarineEditor() {
  const land=readRaw('countries-10m-raw.geojson'),index=coastlineIndex(land);
  const seas=readGeo('seas.geojson');
  const definitions=()=>seas.features.filter(f=>f.properties.featurecla!=='ocean'&&!['Caspian Sea','Great Barrier Reef'].includes(f.properties.name)).map(f=>({name:f.properties.name,fingerprint:fingerprint(f.geometry),boundaries:boundaries(f.geometry,index)})).filter(r=>r.boundaries.length);
  const file=path.join(__dirname,'..','data','marine-boundary-edits.json');
  if(fs.existsSync(file)) {
    const saved=JSON.parse(fs.readFileSync(file));
    if(saved.version!==1)throw Error('Invalid marine boundary draft');
    for(const draft of saved.batches??[saved]) {
      if(!Array.isArray(draft.features))throw Error('Invalid marine boundary features');
      const entries=definitions();
      for(const item of draft.features) {
        const definition=entries.find(r=>r.name===item.name),feature=seas.features.find(f=>f.properties.name===item.name);
        if(!definition||definition.fingerprint!==item.fingerprint)throw Error(`Stale marine boundary draft: ${item.name}`);
        feature.geometry=editGeometry(feature.geometry,definition.boundaries,item.edits,land,index).geometry;
      }
    }
    writeGeo('seas.geojson',seas);
  }
  writeGeo('marine-editor.json',{version:1,features:definitions()});
  writeGeo('marine-editor-land.geojson',land);
}

// A navigable canal has terminals, not a downstream flow. Keep its centerline
// separate from the river orientation/animation pipeline.
function buildCanals(){
  const raw=readRaw('rivers-10m-raw.geojson');
  const parts=raw.features.filter(f=>f.properties.name==='Suez Canal').flatMap(f=>f.geometry.type==='LineString'?[f.geometry.coordinates]:f.geometry.coordinates).map(line=>structuredClone(line));
  if(parts.length!==3)throw Error('Unexpected Suez centerline components');
  const endpoints=parts.flatMap(line=>[line[0],line.at(-1)]),north=endpoints.reduce((a,b)=>a[1]>b[1]?a:b);
  let cursor=north,coordinates=[];
  while(parts.length){
    let best=null;
    parts.forEach((line,i)=>{for(const reverse of [false,true]){const p=reverse?line.at(-1):line[0],distance=Math.hypot(cursor[0]-p[0],cursor[1]-p[1]);if(!best||distance<best.distance)best={i,reverse,distance};}});
    if(best.distance>.002)throw Error('Disconnected Suez centerline');
    const line=parts.splice(best.i,1)[0];if(best.reverse)line.reverse();coordinates.push(...line);cursor=line.at(-1);
  }
  coordinates.push([32.576,29.985],[32.568,29.963],[32.57,29.935]);
  writeGeo('canals.geojson',{type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'LineString',coordinates},properties:{name:'Suez Canal',featurecla:'Canal',scalerank:4,...FEATURE_ADDITIONS['Suez Canal']}}]});
}
