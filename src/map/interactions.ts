import type { Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl';
import type { Geometry } from 'geojson';
import type { KnowledgePoint } from '../types';
import { setHighlightCodes, setFeatureHighlight } from './mapRegistry';

export function setupInteractions(
  map: MapLibreMap,
  onSelectPoint: (point: KnowledgePoint | null) => void,
  onHover: (id: string | null) => void,
  onFocusCountry: (adm0: string | null, atMainland?: boolean) => void,
) {
  // Everything clickable, in falling priority — a click resolves to the first
  // of these that lies under the cursor. Point/line targets (cities, rivers)
  // and specific water bodies (lakes, ranges, seas) win over the broad country
  // fill beneath them; the open ocean is the last resort.
  const interactiveLayers = [
    'capital-star',
    'city-circle',
    // Peaks have no hit surface of their own — the rendered "▲ Name" symbol IS
    // the click target (symbol layers are queryable like any other).
    'peak-label',
    'river-hit',
    // Precise line target — a deliberate click on the thin line means the zone,
    // so it beats the broad area fills (lakes, seas, countries, ocean) beneath.
    'timezone-hit',
    'lake-fill',
    'range-fill',
    'sea-hit',
    'country-fill-110',
    'country-fill-50',
    'country-fill-10',
    'ocean-fill',
  ];
  const priority = new Map(interactiveLayers.map((id, i) => [id, i]));

  const cityLayerIds = new Set(['city-circle', 'capital-star']);
  const countryFillIds = ['country-fill-110', 'country-fill-50', 'country-fill-10'];

  // Natural Earth sea polygons carry a featurecla; map it to an InfoCard type.
  const seaTypeByClass: Record<string, KnowledgePoint['type']> = {
    ocean: 'ocean', sea: 'sea', gulf: 'gulf', bay: 'gulf',
    strait: 'strait', channel: 'strait', sound: 'strait', river: 'river', reef: 'sea',
  };
  const seaTypeLabel: Record<string, string> = {
    ocean: 'ocean', sea: 'sea', gulf: 'gulf', strait: 'strait', river: 'river',
  };

  // Ocean fill is one world-spanning blob with no name, so name a click by the
  // nearest ocean label point instead.
  const oceanLabels: { name: string; lng: number; lat: number }[] = [];
  fetch('/geo/ocean-labels.geojson')
    .then((r) => r.json())
    .then((d) => {
      for (const f of d.features) {
        const [lng, lat] = f.geometry.coordinates;
        oceanLabels.push({ name: f.properties.name || f.properties.NAME, lng, lat });
      }
    })
    .catch(() => {});
  const nearestOcean = (lng: number, lat: number) => {
    let best = '', bestD = Infinity;
    for (const o of oceanLabels) {
      const d = (o.lng - lng) ** 2 + (o.lat - lat) ** 2;
      if (d < bestD) { bestD = d; best = o.name; }
    }
    return best || 'Ocean';
  };

  // Rough on-screen area of a feature's bounding box — used to pick the most
  // specific (smallest) sea when several overlap at the click point.
  const geomBboxArea = (geom: Geometry): number => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const walk = (c: unknown): void => {
      if (typeof (c as number[])[0] === 'number') {
        const [x, y] = c as number[];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      } else {
        for (const part of c as unknown[]) walk(part);
      }
    };
    if ('coordinates' in geom) walk((geom as { coordinates: unknown }).coordinates);
    return (maxX - minX) * (maxY - minY);
  };

  // Country focus boxes (precomputed, antimeridian-aware) for dblclick zoom.
  // FOCUS_BBOX is the curated default-focus region (e.g. lower-48 for the US),
  // falling back to the full geometry bbox for ordinary countries.
  const bboxByAdm0 = new Map<string, [number, number, number, number]>();
  fetch('/geo/countries-labels.geojson')
    .then((r) => r.json())
    .then((d) => {
      for (const f of d.features) {
        const box = f.properties.FOCUS_BBOX || f.properties.BBOX;
        if (box) bboxByAdm0.set(f.properties.ADM0_A3, box);
      }
    })
    .catch(() => {});

  // Inset manifest, so double-click can route territories to their parent's panel
  // and fit to the region actually clicked (not always the mainland).
  type Comp = { key: string; homeNav?: boolean; flyTo: [number, number, number, number] | null };
  const insetParents = new Set<string>();          // USA, FRA, NLD, NOR, ECU
  const componentsByParent = new Map<string, Comp[]>();
  const territoryParent = new Map<string, string>(); // separate-feature territory ADM0_A3 -> parent
  fetch('/geo/insets.json')
    .then((r) => r.json())
    .then((m: Record<string, Comp[]>) => {
      for (const [parent, comps] of Object.entries(m)) {
        insetParents.add(parent);
        componentsByParent.set(parent, comps);
        for (const c of comps) {
          if (!c.homeNav) territoryParent.set(c.key, parent);
        }
      }
    })
    .catch(() => {});

  const inBox = (pt: [number, number], b?: [number, number, number, number]) =>
    !!b && pt[0] >= b[0] && pt[0] <= b[2] && pt[1] >= b[1] && pt[1] <= b[3];

  const boxArea = (b: [number, number, number, number]) => (b[2] - b[0]) * (b[3] - b[1]);

  // Smallest component (by flyTo area) whose box contains the point.
  const componentAt = (parent: string, pt: [number, number]): Comp | undefined => {
    let best: Comp | undefined;
    for (const c of componentsByParent.get(parent) || []) {
      if (c.homeNav || !c.flyTo || !inBox(pt, c.flyTo)) continue;
      if (!best || boxArea(c.flyTo) < boxArea(best.flyTo!)) best = c;
    }
    return best;
  };

  const fitBox = (b: [number, number, number, number]) =>
    map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 48, maxZoom: 10, duration: 1400 });

  // ADM0_A3-code based highlight + glow, shared with InsetPanel's full-extent view.
  const setHighlight = (codes: string[]) => setHighlightCodes(codes);

  // Show one country's subdivision borders AND labels at any zoom (double-click),
  // so the default fit view already shows e.g. US state names.
  const setFocusedSubdivisions = (iso2: string) => {
    const filter = ['==', ['get', 'iso_a2'], iso2 || '__none__'];
    for (const id of ['admin1-border-focus', 'admin1-label-focus']) {
      if (map.getLayer(id)) map.setFilter(id, filter as never);
    }
  };

  // Clear both highlight systems (country codes + feature glows) at once.
  const clearHighlights = () => {
    setHighlight([]);
    setFeatureHighlight(null);
  };

  map.on('click', (e: MapMouseEvent) => {
    const features = map.queryRenderedFeatures(e.point, {
      layers: interactiveLayers.filter((id) => map.getLayer(id)),
    });

    if (!features.length) {
      onSelectPoint(null);
      clearHighlights();
      setFocusedSubdivisions('');
      onFocusCountry(null);
      return;
    }

    // Resolve to the highest-priority feature under the cursor.
    let feature = features[0];
    let best = priority.get(feature.layer.id) ?? Infinity;
    for (const f of features) {
      const p = priority.get(f.layer.id) ?? Infinity;
      if (p < best) { best = p; feature = f; }
    }
    const layerId = feature.layer.id;
    const props = feature.properties;
    const [lng, lat] = [e.lngLat.lng, e.lngLat.lat];

    if (cityLayerIds.has(layerId)) {
      clearHighlights();
      onSelectPoint({
        id: `city-${props.NAME}`,
        type: 'city',
        name: props.NAME,
        coordinates: [lng, lat],
        summary: `${props.NAME} is a city in ${props.ADM0NAME}${props.ADM1NAME ? `, ${props.ADM1NAME}` : ''}. Population: ${Number(props.POP_MAX).toLocaleString()}.`,
        population: props.POP_MAX,
        country: props.ADM0NAME,
        nativeName: props.name_native || undefined,
        nativeLang: props.name_native_lang || undefined,
      });
    } else if (layerId === 'peak-label') {
      clearHighlights();
      const elev = props.elevation
        ? `, rising to ${Number(props.elevation).toLocaleString()} m (${Math.round(props.elevation * 3.28084).toLocaleString()} ft)`
        : '';
      onSelectPoint({
        id: `peak-${props.name}`,
        type: 'peak',
        name: props.name,
        coordinates: [lng, lat],
        summary: `${props.name} is a mountain peak${elev}.`,
        nativeName: props.name_native || undefined,
        nativeLang: props.name_native_lang || undefined,
      });
    } else if (layerId === 'range-fill') {
      setHighlight([]);
      setFeatureHighlight('range', props.name);
      const elev = props.max_elev ? ` Its highest summit reaches about ${Number(props.max_elev).toLocaleString()} m.` : '';
      // English refers to ranges with "the" (the Alps, the Rockies, the Andes).
      onSelectPoint({
        id: `range-${props.name}`,
        type: 'mountain_range',
        name: props.name,
        coordinates: [lng, lat],
        summary: `The ${props.name} is a mountain range.${elev}`,
        nativeName: props.name_native || undefined,
        nativeLang: props.name_native_lang || undefined,
      });
    } else if (layerId === 'lake-fill') {
      setHighlight([]);
      setFeatureHighlight('lake', props.name);
      const sal = props.salinity as string | undefined;
      onSelectPoint({
        id: `lake-${props.name}`,
        type: 'lake',
        name: props.name || 'Lake',
        coordinates: [lng, lat],
        summary: `${props.name || 'This lake'} is a ${sal ? `${sal} ` : ''}lake.`,
        lakeAreaKm2: props.area_km2 ?? undefined,
        lakeMaxDepthM: props.max_depth_m ?? undefined,
        lakeAreaRank: props.area_rank ?? undefined,
        lakeDepthRank: props.depth_rank ?? undefined,
        lakeSalinity: sal || undefined,
        lakeSalinityGL: props.salinity_gl ?? undefined,
        nativeName: props.name_native || undefined,
        nativeLang: props.name_native_lang || undefined,
      });
    } else if (layerId === 'river-hit') {
      setHighlight([]);
      // A name-changing river (Lancang→Mekong) reports its whole-system name and
      // lights up every reach; otherwise just this reach by its local name.
      const systemName = props.system_name as string | undefined;
      const members = (props.system_members as string | undefined)?.split('|');
      setFeatureHighlight('river', members && members.length ? members : props.name);
      const rname = systemName || props.name || 'River';
      const sName = props.source_name as string | undefined;
      const mName = props.mouth_name as string | undefined;
      const mType = props.mouth_type as string | undefined;
      let summary = `${rname} is a river.`;
      if (sName && mName) {
        // Rivers/estuaries: "flows into"; a lake carries its own article;
        // oceans/seas/gulfs take "the".
        const tail =
          mType === 'river' || mType === 'estuary' ? `flows into the ${mName}`
          : mType === 'lake' ? `empties into ${mName}`
          : `empties into the ${mName}`;
        summary = `${rname} rises from ${sName} and ${tail}.`;
      }
      const note = props.system_note as string | undefined;
      if (note) summary += ` ${note}`;
      onSelectPoint({
        id: `river-${systemName || props.name}`,
        type: 'river',
        name: rname,
        coordinates: [lng, lat],
        summary,
        riverSource: props.source_type && sName ? { type: props.source_type, name: sName } : undefined,
        riverMouth: mType && mName ? { type: mType, name: mName } : undefined,
        nativeName: props.name_native || undefined,
        nativeLang: props.name_native_lang || undefined,
      });
    } else if (layerId === 'sea-hit') {
      // Several sea polygons can overlap; pick the most specific (smallest).
      const seaFeatures = features.filter((f) => f.layer.id === 'sea-hit');
      let sea = feature;
      let smallest = geomBboxArea(feature.geometry);
      for (const f of seaFeatures) {
        const a = geomBboxArea(f.geometry);
        if (a < smallest) { smallest = a; sea = f; }
      }
      const sp = sea.properties;
      const cls = String(sp.featurecla || 'sea');
      const type = seaTypeByClass[cls] || 'sea';
      const label = seaTypeLabel[type] || 'sea';
      setHighlight([]);
      setFeatureHighlight('sea', sp.name);
      onSelectPoint({
        id: `sea-${sp.name}`,
        type,
        name: sp.name || 'Sea',
        coordinates: [lng, lat],
        summary: `${sp.name || 'This body of water'} is a ${label}.`,
      });
    } else if (layerId === 'ocean-fill') {
      clearHighlights();
      const name = nearestOcean(lng, lat);
      onSelectPoint({
        id: `ocean-${name}`,
        type: 'ocean',
        name,
        coordinates: [lng, lat],
        summary: `${name} is one of Earth's five oceans.`,
      });
    } else if (layerId === 'timezone-hit') {
      // A boundary line is shared by the zones on both sides, so the clicked
      // line feature alone is ambiguous. Resolve to the zone just WEST of the
      // line: sample the invisible zone fill a few pixels to the left (west in
      // the north-up view). Fall back to the clicked line's own zone if the
      // sample misses (e.g. at the very edge of the map).
      const westFeats = map.getLayer('timezone-fill')
        ? map.queryRenderedFeatures([e.point.x - 10, e.point.y], { layers: ['timezone-fill'] })
        : [];
      const tz = westFeats[0]?.properties ?? props;
      setHighlight([]);
      setFeatureHighlight('timezone', tz.name);
      const z = Number(tz.zone);
      const rel =
        z === 0
          ? 'the same as Coordinated Universal Time (UTC)'
          : `${Math.abs(z)} hour${Math.abs(z) === 1 ? '' : 's'} ${z > 0 ? 'ahead of' : 'behind'} UTC`;
      const places = tz.places ? ` It covers areas such as ${tz.places}.` : '';
      onSelectPoint({
        id: `timezone-${tz.name}`,
        type: 'timezone',
        name: tz.name,
        coordinates: [lng, lat],
        summary: `${tz.name} is a standard time zone, ${rel}.${places}`,
      });
    } else if (layerId.startsWith('country-fill')) {
      setFeatureHighlight(null);
      setHighlight(props.ADM0_A3 ? [props.ADM0_A3] : []);
      onSelectPoint({
        id: `country-${props.ADM0_A3 || props.ISO_A3}`,
        type: props.STATUS === 'disputed' ? 'disputed' : 'country',
        name: props.NAME,
        coordinates: [lng, lat],
        summary: `${props.NAME} is in ${props.CONTINENT}${props.SUBREGION ? ` (${props.SUBREGION})` : ''}. Population: ~${(Number(props.POP_EST) / 1e6).toFixed(1)}M.`,
        statusNote: props.STATUS_NOTE || undefined,
        officialName: props.FORMAL_EN || undefined,
        nativeName: props.NAME_NATIVE || undefined,
        nativeLang: props.NAME_NATIVE_LANG || undefined,
        iso2: props.ISO_A2 || undefined,
        country: props.NAME,
      });
    }
  });

  // Double-click: zoom to fit, and surface the inset panel for territories.
  map.on('dblclick', (e: MapMouseEvent) => {
    const features = map.queryRenderedFeatures(e.point, {
      layers: countryFillIds.filter((id) => map.getLayer(id)),
    });
    const props = features[0]?.properties;
    if (!props) return;
    const adm0: string = props.ADM0_A3 || '';
    const pt: [number, number] = [e.lngLat.lng, e.lngLat.lat];

    // Case A: a separate-feature territory of an inset parent (e.g. Puerto Rico
    // → USA). Show the parent's panel, but stay on the territory.
    const parent = territoryParent.get(adm0);
    if (parent) {
      onFocusCountry(parent, false); // territory view → show "back to mainland"
      setFocusedSubdivisions('');
      const comp = (componentsByParent.get(parent) || []).find((c) => c.key === adm0);
      const box = comp?.flyTo || bboxByAdm0.get(adm0);
      if (box) fitBox(box);
      return;
    }

    // Case B: an inset parent country (USA, France, …).
    if (insetParents.has(adm0)) {
      setFocusedSubdivisions(props.ISO_A2 || '');
      const focus = bboxByAdm0.get(adm0);
      if (inBox(pt, focus)) {
        onFocusCountry(adm0, true); // mainland view → no "back to mainland" tab
        if (focus) fitBox(focus);
      } else {
        // clicked a detached integral part (e.g. French Guiana inside FRA) —
        // stay there rather than snapping back to the mainland.
        onFocusCountry(adm0, false); // territory view → show "back to mainland"
        const comp = componentAt(adm0, pt);
        if (comp?.flyTo) fitBox(comp.flyTo);
        else if (focus) fitBox(focus);
      }
      return;
    }

    // Case C: ordinary country — fit it, hide any open panel.
    onFocusCountry(adm0 || null, true);
    setFocusedSubdivisions(props.ISO_A2 || '');
    const bbox = bboxByAdm0.get(adm0);
    if (bbox) fitBox(bbox);
  });

  for (const layerId of interactiveLayers) {
    map.on('mouseenter', layerId, () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', layerId, () => {
      map.getCanvas().style.cursor = '';
      onHover(null);
    });
    map.on('mousemove', layerId, (e) => {
      const f = e.features?.[0];
      if (f) {
        onHover(f.properties.NAME || f.properties.name || null);
      }
    });
  }
}
