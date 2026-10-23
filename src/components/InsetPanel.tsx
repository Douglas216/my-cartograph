import { useEffect, useRef, useState } from 'react';
import { useMapStore } from '../store/mapStore';
import { mapRegistry, setHighlightCodes } from '../map/mapRegistry';

interface InsetComponent {
  key: string;
  name: string;
  tier: number;
  fill: string;
  emphasize: boolean;
  homeNav?: boolean;
  srcAdm0?: string | null;
  fullExtent?: [number, number, number, number];
  badge: string;
  description: string;
  svgPath: string;
  viewW: number;
  viewH: number;
  flyTo: [number, number, number, number] | null;
  center: [number, number];
}

// Display names for the panel header, keyed by parent ADM0_A3.
const PARENT_LABEL: Record<string, string> = {
  USA: 'United States',
  FRA: 'France',
  NLD: 'Netherlands',
  NOR: 'Norway',
  ECU: 'Ecuador',
  GBR: 'United Kingdom',
  ESP: 'Spain',
  PRT: 'Portugal',
  DNK: 'Denmark',
  AUS: 'Australia',
  CHN: 'China',
  NZL: 'New Zealand',
  CHL: 'Chile',
  FIN: 'Finland',
};

export default function InsetPanel() {
  const focusedCountry = useMapStore((s) => s.focusedCountry);
  const atMainland = useMapStore((s) => s.atMainland);
  const setAtMainland = useMapStore((s) => s.setAtMainland);
  const selectPoint = useMapStore((s) => s.selectPoint);
  const [manifest, setManifest] = useState<Record<string, InsetComponent[]>>({});
  const [collapsed, setCollapsed] = useState(false);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch('/geo/insets.json')
      .then((r) => r.json())
      .then(setManifest)
      .catch(() => {});
  }, []);

  const components = focusedCountry ? manifest[focusedCountry] : undefined;
  if (!components || !components.length) return null;

  const openCard = (c: InsetComponent) => {
    selectPoint({
      id: `territory-${c.key}`,
      type: 'territory',
      name: c.name,
      coordinates: c.center,
      summary: c.description,
      // The legal status (or parent country, for the home box) is the card's tag.
      badge: c.badge,
    });
  };

  const flyThere = (c: InsetComponent) => {
    if (!c.flyTo) return;
    const [w, s, e, n] = c.flyTo;
    mapRegistry.map?.fitBounds([[w, s], [e, n]], { padding: 60, maxZoom: 8, duration: 1400 });
  };

  // Single click → card; double click → fly. Delay the single so a double cancels it.
  const onBoxClick = (c: InsetComponent) => {
    if (clickTimer.current) clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      openCard(c);
    }, 220);
  };
  // Double-click flies to the territory AND shows the card — now in a territory view.
  const onBoxDouble = (c: InsetComponent) => {
    if (clickTimer.current) { clearTimeout(clickTimer.current); clickTimer.current = null; }
    flyThere(c);
    openCard(c);
    setAtMainland(false);
  };

  // The home box flies back to the mainland — returns to the mainland view.
  const onHomeClick = (c: InsetComponent) => {
    if (clickTimer.current) { clearTimeout(clickTimer.current); clickTimer.current = null; }
    flyThere(c);
    openCard(c);
    setAtMainland(true);
  };

  // "Full extent": fit the union of mainland + all territories, and illuminate
  // every border (gold glow) so tiny far-flung territories read as bright dots.
  const onFullExtent = () => {
    const home = components.find((c) => c.homeNav);
    if (!home?.fullExtent || !focusedCountry) return;
    const [w, s, e, n] = home.fullExtent;
    mapRegistry.map?.fitBounds([[w, s], [e, n]], { padding: 56, duration: 1600 });
    const codes = [focusedCountry, ...components.map((c) => c.srcAdm0).filter((x): x is string => !!x)];
    setHighlightCodes(codes);
    setAtMainland(false); // offer the way back to the mainland view
  };

  const home = components.find((c) => c.homeNav);
  const tier2 = components.filter((c) => c.tier === 2);
  const tier3 = components.filter((c) => c.tier === 3);
  const tier4 = components.filter((c) => c.tier === 4);

  const renderBox = (c: InsetComponent, size: 'lg' | 'sm') => (
    <button
      key={c.key}
      className={`inset-box inset-box-${size}${c.flyTo ? '' : ' inset-box-nofly'}`}
      onClick={() => onBoxClick(c)}
      onDoubleClick={() => onBoxDouble(c)}
      title={c.flyTo ? `${c.name} — double-click to zoom there` : c.name}
    >
      <svg viewBox={`0 0 ${c.viewW} ${c.viewH}`} preserveAspectRatio="xMidYMid meet" className="inset-shape">
        {c.svgPath ? (
          <path
            d={c.svgPath}
            fill={c.fill}
            stroke="#44566a"
            strokeWidth={c.emphasize ? 2 : 1}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
        ) : (
          // Tier 4: scattered islands collapse to nothing — show a dot motif.
          <g fill={c.fill}>
            <circle cx={c.viewW * 0.3} cy={c.viewH * 0.55} r={2} />
            <circle cx={c.viewW * 0.55} cy={c.viewH * 0.4} r={1.6} />
            <circle cx={c.viewW * 0.72} cy={c.viewH * 0.62} r={2.2} />
          </g>
        )}
      </svg>
      <span className="inset-label">{c.name}</span>
    </button>
  );

  return (
    <div className="inset-panel">
      <div className="inset-header">
        <span className="inset-title">{PARENT_LABEL[focusedCountry!] || focusedCountry}</span>
        <button className="inset-full-extent" onClick={onFullExtent} title="Show all territory — zoom out to every part of this country">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3c2.5 2.6 3.9 5.7 3.9 9S14.5 18.4 12 21c-2.5-2.6-3.9-5.7-3.9-9S9.5 5.6 12 3z" />
          </svg>
        </button>
        <button className="inset-collapse" onClick={() => setCollapsed((v) => !v)} title={collapsed ? 'Expand' : 'Collapse'}>
          {collapsed ? '▴' : '▾'}
        </button>
      </div>
      {!collapsed && (
        <>
          {home && !atMainland && (
            <button
              className="inset-home"
              onClick={() => onHomeClick(home)}
              title={`Back to ${home.name}`}
            >
              <svg viewBox={`0 0 ${home.viewW} ${home.viewH}`} preserveAspectRatio="xMidYMid meet" className="inset-shape inset-home-shape">
                <path d={home.svgPath} fill={home.fill} stroke="#44566a" strokeWidth={1} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
              </svg>
              <span className="inset-home-label">&#8617; {home.name}</span>
            </button>
          )}
          <div className="inset-stacks">
            {tier2.length > 0 && <div className="inset-stack">{tier2.map((c) => renderBox(c, 'lg'))}</div>}
            {tier3.length > 0 && <div className="inset-stack">{tier3.map((c) => renderBox(c, 'sm'))}</div>}
            {tier4.length > 0 && <div className="inset-stack">{tier4.map((c) => renderBox(c, 'sm'))}</div>}
          </div>
        </>
      )}
    </div>
  );
}
