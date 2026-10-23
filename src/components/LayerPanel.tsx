import { useMapStore } from '../store/mapStore';
import { THEMES } from '../map/themes';

// Small eye icons for on/off state.
const EyeOn = (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const EyeOff = (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M17.9 17.9A10.6 10.6 0 0 1 12 19c-7 0-11-7-11-7a20.3 20.3 0 0 1 5.1-5.9M9.9 4.2A10.6 10.6 0 0 1 12 5c7 0 11 7 11 7a20.4 20.4 0 0 1-2.6 3.5" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

/** Toggleable thematic overlays (subdivisions, cities, hydrography, …). */
export default function LayerPanel() {
  const hiddenThemes = useMapStore((s) => s.hiddenThemes);
  const toggleTheme = useMapStore((s) => s.toggleTheme);

  return (
    <div className="layer-panel">
      {THEMES.map((t) => {
        const on = !hiddenThemes.includes(t.id);
        return (
          <button
            key={t.id}
            className={`layer-chip${on ? ' layer-chip--on' : ''}`}
            onClick={() => toggleTheme(t.id)}
            title={`${on ? 'Hide' : 'Show'} ${t.label.toLowerCase()}`}
          >
            {on ? EyeOn : EyeOff}
            <span>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
