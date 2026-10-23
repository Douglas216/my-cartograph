import { useState, useRef, useEffect, useCallback } from 'react';
import { useMapStore } from '../store/mapStore';

interface SearchResult {
  name: string;
  type: string;
  coordinates: [number, number];
}

interface Props {
  onFlyTo: (lng: number, lat: number, zoom: number) => void;
}

export default function SearchBar({ onFlyTo }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dataRef = useRef<SearchResult[]>([]);
  const selectPoint = useMapStore((s) => s.selectPoint);

  useEffect(() => {
    Promise.all([
      fetch('/geo/countries-110m.geojson').then(r => r.json()),
      fetch('/geo/cities.geojson').then(r => r.json()),
    ]).then(([countries, cities]) => {
      const items: SearchResult[] = [];
      for (const f of countries.features) {
        const coords = getCentroid(f.geometry);
        if (coords) {
          items.push({ name: f.properties.NAME, type: 'country', coordinates: coords });
        }
      }
      for (const f of cities.features) {
        if (f.properties.POP_MAX > 100000) {
          items.push({
            name: `${f.properties.NAME}, ${f.properties.ADM0NAME}`,
            type: 'city',
            coordinates: f.geometry.coordinates as [number, number],
          });
        }
      }
      dataRef.current = items;
    });
  }, []);

  const search = useCallback((q: string) => {
    setQuery(q);
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    const lower = q.toLowerCase();
    const matched = dataRef.current
      .filter(item => item.name.toLowerCase().includes(lower))
      .slice(0, 10);
    setResults(matched);
    setOpen(matched.length > 0);
  }, []);

  return (
    <div className="search-bar">
      <div className="search-input-wrapper">
        <svg className="search-icon" viewBox="0 0 24 24" width="18" height="18">
          <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
          <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          placeholder="Search countries, cities..."
          value={query}
          onChange={(e) => search(e.target.value)}
          onFocus={() => query.length >= 2 && results.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
        />
      </div>
      {open && (
        <div className="search-results">
          {results.map((r, i) => (
            <button
              key={i}
              className="search-result-item"
              onMouseDown={() => {
                selectPoint(null);
                onFlyTo(r.coordinates[0], r.coordinates[1], r.type === 'city' ? 8 : 5);
                setQuery(r.name);
                setOpen(false);
              }}
            >
              <span className="search-result-name">{r.name}</span>
              <span className="search-result-type">{r.type}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function getCentroid(geometry: any): [number, number] | null {
  if (geometry.type === 'Point') return geometry.coordinates;
  if (geometry.type === 'Polygon') {
    const coords = geometry.coordinates[0];
    const len = coords.length;
    let x = 0, y = 0;
    for (const c of coords) { x += c[0]; y += c[1]; }
    return [x / len, y / len];
  }
  if (geometry.type === 'MultiPolygon') {
    let maxLen = 0, largest = geometry.coordinates[0][0];
    for (const poly of geometry.coordinates) {
      if (poly[0].length > maxLen) { maxLen = poly[0].length; largest = poly[0]; }
    }
    let x = 0, y = 0;
    for (const c of largest) { x += c[0]; y += c[1]; }
    return [x / maxLen, y / maxLen];
  }
  return null;
}
