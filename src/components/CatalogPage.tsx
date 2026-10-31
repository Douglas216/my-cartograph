import { useEffect, useMemo, useState } from 'react';
import './CatalogPage.css';

type Value = string | number | string[] | null;
type Row = { id: string; name: string; sourceUrl?: string; [key: string]: Value | undefined };
type Section = { id: string; title: string; description: string; rows: Row[] };
type Catalog = { sections: Section[]; retrieved: string };
type Column = { key: string; label: string; numeric?: boolean; unit?: string };
const tabs = [
  { id: 'countries', label: 'Countries', description: 'The political geography of the world.', sections: ['countries'] },
  { id: 'cities', label: 'Cities', description: 'National capitals, selected subdivision capitals and major cities.', sections: ['cities'] },
  { id: 'water', label: 'Rivers, canals & lakes', description: 'The waterways and inland waters in my atlas.', sections: ['rivers', 'lakes'] },
  { id: 'ranges', label: 'Mountain ranges', description: 'The mountain systems I have come to know.', sections: ['ranges'] },
  { id: 'peaks', label: 'Peaks', description: 'Great summits and culturally significant mountains.', sections: ['peaks'] },
  { id: 'marine', label: 'Oceans & seas', description: 'Ocean basins and the named waters connected to them.', sections: ['oceans', 'seas'] },
];
const columns: Record<string, Column[]> = {
  countries: [{ key: 'name', label: 'Country / territory' }, { key: 'capital', label: 'Capital' }, { key: 'population', label: 'Population', numeric: true }],
  cities: [{ key: 'name', label: 'City' }, { key: 'country', label: 'Country / territory' }, { key: 'role', label: 'Role' }, { key: 'capitalOf', label: 'Capital of' }, { key: 'population', label: 'Population', numeric: true }],
  rivers: [{ key: 'name', label: 'River / canal' }, { key: 'length', label: 'Length · km', numeric: true }, { key: 'countries', label: 'Countries' }, { key: 'source', label: 'Source / terminal' }, { key: 'mouth', label: 'Mouth / terminus' }],
  lakes: [{ key: 'name', label: 'Lake' }, { key: 'area', label: 'Area · km²', numeric: true }, { key: 'volume', label: 'Volume · km³', numeric: true }, { key: 'countries', label: 'Countries on its shores' }],
  ranges: [{ key: 'name', label: 'Mountain range' }, { key: 'area', label: 'Mapped span · km²', numeric: true }, { key: 'countries', label: 'Countries' }, { key: 'parent', label: 'Part of' }, { key: 'story', label: 'Why it matters' }],
  peaks: [{ key: 'name', label: 'Peak' }, { key: 'elevation', label: 'Elevation · m', numeric: true }, { key: 'countries', label: 'Countries' }, { key: 'parent', label: 'Range / group' }, { key: 'story', label: 'Why it matters' }],
  oceans: [{ key: 'name', label: 'Ocean' }, { key: 'setting', label: 'Geographic setting' }, { key: 'waters', label: 'Named waters', numeric: true }],
  seas: [{ key: 'name', label: 'Named water' }, { key: 'kind', label: 'Type' }, { key: 'parent', label: 'Part of' }, { key: 'ocean', label: 'Ocean / connection' }],
};
const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
function flag(iso: Value | undefined) {
  return typeof iso === 'string' && /^[A-Z]{2}$/.test(iso) ? String.fromCodePoint(...[...iso].map(c => c.charCodeAt(0) + 127397)) : '◌';
}
function fold(value: string) { return value.toLocaleLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, ''); }
function searchable(row: Row) {
  return fold(Object.entries(row).filter(([key]) => !['id', 'sourceUrl'].includes(key)).map(([, value]) => Array.isArray(value) ? value.join(' ') : value ?? '').join(' '));
}

function CatalogTable({ section, query }: { section: Section; query: string }) {
  const [role, setRole] = useState('');
  const [country, setCountry] = useState('');
  const countries = [...new Set(section.rows.map(r => String(r.country ?? '')))].filter(Boolean).sort();
  const [sort, setSort] = useState({ key: section.id === 'peaks' ? 'elevation' : 'name', direction: section.id === 'peaks' ? -1 : 1 });
  const rows = useMemo(() => section.rows.filter(row => searchable(row).includes(fold(query.trim())) && (!role || row.role === role) && (!country || row.country === country)).sort((a, b) => {
    const x = a[sort.key]; const y = b[sort.key];
    if (x == null) return y == null ? 0 : 1;
    if (y == null) return -1;
    return sort.direction * (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y)));
  }), [section, query, sort, role, country]);
  return <section className={`catalog-section catalog-section-${section.id}`} aria-labelledby={`heading-${section.id}`}>
    <div className="catalog-section-heading"><div><h2 id={`heading-${section.id}`}>{section.title} <span>{rows.length.toLocaleString()}</span></h2><p>{section.description}</p></div><span className="catalog-record-count">{query ? `${rows.length} of ${section.rows.length}` : `${section.rows.length.toLocaleString()} entries`}</span></div>
    {section.id === 'cities' && <div className="catalog-city-filters">
      <label>Role <select value={role} onChange={e => setRole(e.target.value)}><option value="">All roles</option>{['National capital','First-level subdivision capital','City'].map(r => <option key={r}>{r}</option>)}</select></label>
      <label>Country <select value={country} onChange={e => setCountry(e.target.value)}><option value="">All countries</option>{countries.map(c => <option key={c}>{c}</option>)}</select></label>
      {(role || country) && <button onClick={() => {setRole('');setCountry('');}}>Reset filters</button>}
    </div>}
    <div className="catalog-table-scroll" role="region" aria-label={`${section.title} table`} tabIndex={0}>
      <table><thead><tr><th className="catalog-index" scope="col">#</th>{columns[section.id].map(col => <th key={col.key} scope="col" className={col.numeric ? 'catalog-numeric' : ''} aria-sort={sort.key === col.key ? sort.direction === 1 ? 'ascending' : 'descending' : 'none'}><button onClick={() => setSort({ key: col.key, direction: sort.key === col.key ? -sort.direction : 1 })}>{col.label}<span aria-hidden="true">{sort.key === col.key ? sort.direction === 1 ? '↑' : '↓' : '↕'}</span></button></th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={row.id}><td className="catalog-index">{String(index + 1).padStart(2, '0')}</td>{columns[section.id].map(col => {
          const value = row[col.key];
          return <td key={col.key} className={`${col.numeric ? 'catalog-numeric' : ''} ${col.key === 'name' ? 'catalog-name' : ''}`}>
            {col.key === 'name' && section.id === 'countries' && <span className="catalog-flag" aria-hidden="true">{flag(row.iso2)}</span>}
            {value == null || value === '' || (Array.isArray(value) && !value.length) ? <span className="catalog-missing" title="Not recorded in the reference snapshot">—</span> : Array.isArray(value) ? value.join(' · ') : typeof value === 'number' ? <>{section.id === 'ranges' && col.key === 'area' ? '≈ ' : ''}{number.format(value)}</> : value}
            {col.key === 'name' && row.sourceUrl && <a className="catalog-source" href={row.sourceUrl} target="_blank" rel="noreferrer" aria-label={`Reference for ${row.name}`} title="View reference">↗</a>}
            {col.key === 'name' && row.note && <span className="catalog-year">{row.note}</span>}
            {col.key === 'population' && row.populationYear && <span className="catalog-year">{row.populationYear}</span>}
            {['area', 'volume', 'length'].includes(col.key) && row[`${col.key}Year`] && <span className="catalog-year">{row[`${col.key}Year`]}</span>}
          </td>;
        })}</tr>)}{!rows.length && <tr><td colSpan={columns[section.id].length + 1} className="catalog-empty">No entries match “{query}”.</td></tr>}</tbody>
      </table>
    </div>
  </section>;
}

export default function CatalogPage({ tabId, onNavigate, onClose }: { tabId: string; onNavigate: (tab: string) => void; onClose: () => void }) {
  const [data, setData] = useState<Catalog | null>(null);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState('');
  const tab = tabs.find(t => t.id === tabId) ?? tabs[0];
  useEffect(() => { const controller = new AbortController(); fetch('/geo/catalog.json', { signal: controller.signal }).then(r => { if (!r.ok) throw new Error('Unable to load catalog'); return r.json(); }).then(setData).catch(e => { if (e.name !== 'AbortError') setError(true); }); return () => controller.abort(); }, [reload]);
  useEffect(() => { document.title = `${tab.label} · My atlas`; return () => { document.title = 'Knowledge Map'; }; }, [tab.label]);
  useEffect(() => { setQuery(''); document.querySelector('.catalog-main')?.scrollTo(0, 0); }, [tab.id]);
  const sections = data?.sections.filter(s => tab.sections.includes(s.id)) ?? [];
  return <div className="catalog-page">
    <header className="catalog-header"><div className="catalog-header-inner"><a href="#" className="catalog-brand" onClick={e => { e.preventDefault(); onClose(); }}><span className="catalog-brand-mark" aria-hidden="true">◎</span><span>KNOWLEDGE MAP<span className="catalog-brand-sub">A PERSONAL ATLAS</span></span></a><button className="catalog-back" onClick={onClose}>← <span>Back to the map</span></button></div></header>
    <main className="catalog-main"><div className="catalog-content"><div className="catalog-intro"><div><p className="catalog-eyebrow">THE COLLECTION</p><h1>Places I’ve come to know.</h1><p className="catalog-intro-copy">A clear view of everything in my atlas, one category at a time.</p></div><div className="catalog-search"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/></svg><input aria-label={`Search ${tab.label}`} value={query} onChange={e => setQuery(e.target.value)} placeholder={`Find in ${tab.label.toLowerCase()}…`}/>{query && <button onClick={() => setQuery('')} aria-label="Clear search">×</button>}</div></div>
    <nav className="catalog-tabs" aria-label="Atlas categories">{tabs.map(t => <a key={t.id} href={`#catalog/${t.id}`} aria-current={tab.id === t.id ? 'page' : undefined} onClick={e => { e.preventDefault(); onNavigate(t.id); }}>{t.label}{data && <span>{data.sections.filter(s => t.sections.includes(s.id)).reduce((n, s) => n + s.rows.length, 0).toLocaleString()}</span>}</a>)}</nav>
    <div className="catalog-tab-intro"><p>{tab.description}</p><span>Click a column heading to sort</span></div>
    {!data && !error && <div className="catalog-loading" role="status">Opening the atlas…</div>}
    {error && <div className="catalog-loading" role="alert">The catalog couldn’t load. <button onClick={() => { setError(false); setReload(n => n + 1); }}>Try again</button></div>}
    {sections.map(section => <CatalogTable key={section.id} section={section} query={query} />)}
    {data && <footer className="catalog-footer"><span>Curated by curiosity. <span className="catalog-footer-dot">·</span> Only features included in this map.</span><span>Reference snapshot · {data.retrieved}</span></footer>}
    </div></main>
  </div>;
}
