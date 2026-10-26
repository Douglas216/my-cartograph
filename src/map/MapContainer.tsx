import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { mapStyle } from './mapStyle';
import { countryLayers, countryLabel } from './layers/countryLayers';
import { baseWaterLayers, inlandWaterLayers, waterHighlightLayers, waterLabelLayers } from './layers/physicalLayers';
import { subdivisionBorderLayers, subdivisionLabelLayers } from './layers/subdivisionLayers';
import { orographyLayers, orographyAreaLayers, orographyHighlightLayers } from './layers/orographyLayers';
import { timezoneLayers, timezoneHighlightLayers } from './layers/timezoneLayers';
import { cityLayers } from './layers/cityLayers';
import { setupInteractions } from './interactions';
import { useMapStore } from '../store/mapStore';
import { mapRegistry } from './mapRegistry';
import AtlasBoundarySync from './AtlasBoundarySync';
import { THEMES } from './themes';

function makeStarImage(size: number): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;
  const outer = size * 0.44;
  const inner = outer * 0.45;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.08;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.fillStyle = '#E74C3C';
  ctx.fill();
  return ctx.getImageData(0, 0, size, size);
}

export default function MapContainer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const selectPoint = useMapStore((s) => s.selectPoint);
  const setZoom = useMapStore((s) => s.setZoom);
  const setHoveredFeatureId = useMapStore((s) => s.setHoveredFeatureId);
  const setFocusedCountry = useMapStore((s) => s.setFocusedCountry);
  const hiddenThemes = useMapStore((s) => s.hiddenThemes);

  // Apply thematic layer visibility whenever the user toggles a theme.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      for (const theme of THEMES) {
        const visibility = hiddenThemes.includes(theme.id) ? 'none' : 'visible';
        for (const id of theme.layerIds) {
          if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visibility);
        }
      }
    };
    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }, [hiddenThemes]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        ...mapStyle,
        layers: [
          {
            id: 'background',
            type: 'background',
            paint: { 'background-color': '#b5dce8' },
          },
          ...baseWaterLayers, // ocean (below land)
          ...countryLayers, // country fills, borders, highlight
          ...subdivisionBorderLayers, // admin borders (below water, so lakes cover lines in water)
          ...orographyAreaLayers, // soft range tints (below water so rivers stay crisp)
          ...inlandWaterLayers, // rivers + lakes drawn ON TOP of land
          ...orographyHighlightLayers, // selected-range darken + glow
          ...waterHighlightLayers, // selected sea / lake / river glow
          ...timezoneLayers, // time-zone lines (default off via theme) + hit target
          ...timezoneHighlightLayers, // selected time-zone band glow
          countryLabel,
          ...subdivisionLabelLayers,
          ...cityLayers,
          ...waterLabelLayers, // lake / sea / ocean labels
          // Orography labels go LAST so they win label collisions. MapLibre gives
          // priority to symbols placed LATER in the stack, so an opt-in range name
          // (the user deliberately enabled the Mountains theme) isn't suppressed by
          // the province / city / lake labels that flood in at z5+ — the bug where
          // a range (e.g. the Appalachians, whose label sits between the "Virginia"
          // and "West Virginia" province labels) never appeared at any zoom.
          ...orographyLayers, // range/peak labels (default off via theme)
        ],
      },
      center: [20, 30],
      zoom: 2,
      minZoom: 1,
      maxZoom: 12,
      attributionControl: false,
      // Double-click is repurposed to zoom-to-country (see interactions.ts)
      doubleClickZoom: false,
    });

    map.on('styleimagemissing', (e) => {
      if (e.id === 'capital-star' && !map.hasImage('capital-star')) {
        map.addImage('capital-star', makeStarImage(48), { pixelRatio: 2 });
      }
    });

    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution: 'Natural Earth',
      }),
      'bottom-right',
    );

    map.addControl(new maplibregl.NavigationControl(), 'bottom-right');

    map.addControl(
      new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }),
      'bottom-left',
    );

    // River "flow": slide a light dash along the river-flow overlay by stepping
    // through phase-shifted dasharrays (dasharray can't interpolate, so discrete
    // phases ~90 ms apart read as continuous downstream motion).
    const dashPhases = [
      [0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5],
      [3, 4, 0], [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2],
      [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5],
    ];
    let flowStep = 0;
    let flowRaf = 0;
    const animateFlow = (ts: number) => {
      const step = Math.floor((ts / 90) % dashPhases.length);
      if (step !== flowStep) {
        flowStep = step;
        // Ordinary river flow, plus the same motion on the selected river's gold
        // highlight so a selected river keeps flowing instead of freezing solid.
        if (map.getLayer('river-flow')) map.setPaintProperty('river-flow', 'line-dasharray', dashPhases[step]);
        if (map.getLayer('river-highlight-flow')) map.setPaintProperty('river-highlight-flow', 'line-dasharray', dashPhases[step]);
      }
      flowRaf = requestAnimationFrame(animateFlow);
    };

    map.on('load', () => {
      setupInteractions(map, selectPoint, setHoveredFeatureId, setFocusedCountry);
      // Apply the initial theme visibility here: the reactive effect above runs
      // before the map exists (so it no-ops on first mount), which would leave
      // default-hidden themes (e.g. Time Zones) visible on the map even though
      // their chip reads "off". Re-apply from the current store state on load.
      const hidden = useMapStore.getState().hiddenThemes;
      for (const theme of THEMES) {
        const visibility = hidden.includes(theme.id) ? 'none' : 'visible';
        for (const id of theme.layerIds) {
          if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visibility);
        }
      }
      flowRaf = requestAnimationFrame(animateFlow);
    });

    map.on('zoom', () => setZoom(map.getZoom()));

    // Dismiss the inset panel when the USER zooms back out below the world
    // threshold. Gated on originalEvent so our own fitBounds doesn't trigger it —
    // huge territories (e.g. Greenland) fit at < zoom 3, which would otherwise
    // wipe the panel the moment it opens. (Clicking empty ocean also dismisses.)
    map.on('zoomend', (e) => {
      if (!(e as unknown as { originalEvent?: unknown }).originalEvent) return;
      if (map.getZoom() < 3 && useMapStore.getState().focusedCountry) setFocusedCountry(null);
    });

    mapRef.current = map;
    mapRegistry.map = map;
    if (import.meta.env.DEV) {
      (window as unknown as { __map?: maplibregl.Map }).__map = map;
    }

    return () => {
      cancelAnimationFrame(flowRaf);
      map.remove();
      mapRef.current = null;
      mapRegistry.map = null;
    };
  }, [selectPoint, setZoom, setHoveredFeatureId, setFocusedCountry]);

  return <><div ref={containerRef} style={{ width: '100%', height: '100%' }} /><AtlasBoundarySync /></>;
}
