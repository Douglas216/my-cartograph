export interface KnowledgePoint {
  id: string;
  type: 'country' | 'disputed' | 'territory' | 'city' | 'river' | 'lake' | 'mountain_range' | 'peak' | 'ocean' | 'sea' | 'strait' | 'gulf' | 'natural_wonder' | 'timezone';
  name: string;
  nameLocal?: string;
  coordinates: [number, number];
  summary: string;
  /** Overrides the generic type label shown in the card's badge (e.g. a territory's legal status). */
  badge?: string;
  statusNote?: string;
  officialName?: string;
  nativeName?: string;
  /** BCP-47 tag for pronouncing nativeName via the Web Speech API. */
  nativeLang?: string;
  iso2?: string;
  tags?: string[];
  zoomMin?: number;
  zoomMax?: number;
  population?: number;
  country?: string;
  /** River headwater and mouth (curated). `type` says whether the mouth is an
   *  ocean/sea/lake or another river (e.g. Ucayali → Amazon). */
  waterPath?: string[];
  waterChildren?: number;
  riverSource?: { type: string; name: string };
  riverMouth?: { type: string; name: string };
  /** Lake dimensions + salinity (curated). */
  lakeAreaKm2?: number;
  lakeMaxDepthM?: number;
  /** Global rank (1-10) by area / max depth among curated lakes; undefined if outside the top 10. */
  lakeAreaRank?: number;
  lakeDepthRank?: number;
  lakeSalinity?: string;
  lakeSalinityGL?: number;
}

export interface MapState {
  selectedPoint: KnowledgePoint | null;
  sidePanelOpen: boolean;
  sidePanelContent: string | null;
  zoom: number;
  searchQuery: string;
  hoveredFeatureId: string | null;
  focusedCountry: string | null;
  /** Whether the current focused-country view is the mainland (vs an overseas territory). */
  atMainland: boolean;
  /** Ids of thematic layer groups the user has hidden (see src/map/themes.ts). */
  hiddenThemes: string[];
  selectPoint: (point: KnowledgePoint | null) => void;
  setFocusedCountry: (adm0: string | null, atMainland?: boolean) => void;
  setAtMainland: (atMainland: boolean) => void;
  toggleTheme: (id: string) => void;
  openSidePanel: (content: string) => void;
  closeSidePanel: () => void;
  setZoom: (zoom: number) => void;
  setSearchQuery: (query: string) => void;
  setHoveredFeatureId: (id: string | null) => void;
}
