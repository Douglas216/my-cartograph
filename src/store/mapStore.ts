import { create } from 'zustand';
import type { MapState } from '../types';

export const useMapStore = create<MapState>((set) => ({
  selectedPoint: null,
  sidePanelOpen: false,
  sidePanelContent: null,
  zoom: 2,
  searchQuery: '',
  hoveredFeatureId: null,
  focusedCountry: null,
  atMainland: true,
  // Time zones start hidden — an abstract grid over everything would crowd the
  // atlas; the user opts into it from the layer panel.
  hiddenThemes: ['timezones'],
  selectPoint: (point) => set({ selectedPoint: point, sidePanelOpen: false, sidePanelContent: null }),
  setFocusedCountry: (adm0, atMainland = true) => set({ focusedCountry: adm0, atMainland }),
  setAtMainland: (atMainland) => set({ atMainland }),
  toggleTheme: (id) =>
    set((s) => ({
      hiddenThemes: s.hiddenThemes.includes(id)
        ? s.hiddenThemes.filter((t) => t !== id)
        : [...s.hiddenThemes, id],
    })),
  openSidePanel: (content) => set({ sidePanelOpen: true, sidePanelContent: content }),
  closeSidePanel: () => set({ sidePanelOpen: false, sidePanelContent: null }),
  setZoom: (zoom) => set({ zoom }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setHoveredFeatureId: (id) => set({ hoveredFeatureId: id }),
}));
