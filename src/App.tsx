import { useEffect, useState } from 'react';
import CatalogPage from './components/CatalogPage';
import MapContainer from './map/MapContainer';
import { mapRegistry } from './map/mapRegistry';
import InfoCard from './components/InfoCard';
import SidePanel from './components/SidePanel';
import SearchBar from './components/SearchBar';
import ZoomIndicator from './components/ZoomIndicator';
import PolicyNote from './components/PolicyNote';
import InsetPanel from './components/InsetPanel';
import LayerPanel from './components/LayerPanel';
import MarineBoundaryEditor from './components/MarineBoundaryEditor';
import './styles/global.css';

export default function App() {
  const [catalogTab, setCatalogTab] = useState(() => window.location.hash.startsWith('#catalog') ? window.location.hash.split('/')[1] || 'countries' : null);
  const [marineEditorOpen, setMarineEditorOpen] = useState(false);
  const [mapVisited, setMapVisited] = useState(() => !window.location.hash.startsWith('#catalog'));
  useEffect(() => {
    const update = () => {
      const tab = window.location.hash.startsWith('#catalog') ? window.location.hash.split('/')[1] || 'countries' : null;
      setCatalogTab(tab);
      if (!tab) setMapVisited(true);
      if (!tab) requestAnimationFrame(() => mapRegistry.map?.resize());
    };
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  const navigateCatalog = (tab: string) => { window.location.hash = `catalog/${tab}`; };
  const closeCatalog = () => { window.location.hash = ''; };
  const handleFlyTo = (lng: number, lat: number, zoom: number) => {
    mapRegistry.map?.flyTo({ center: [lng, lat], zoom, duration: 1500 });
  };

  return (
    <div className="app">
      <div className="map-workspace" hidden={catalogTab !== null}>
        {mapVisited && <MapContainer />}
        <div className="ui-overlay">
          <SearchBar onFlyTo={handleFlyTo} />
          <button className="catalog-open-button" onClick={() => navigateCatalog('countries')}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M3 14h18M9 4v16"/></svg><span>My atlas · Tables</span><span aria-hidden="true">→</span></button>
          <ZoomIndicator />
          {!marineEditorOpen && <button className="marine-editor-open" onClick={() => setMarineEditorOpen(true)}>✎ Edit water boundaries</button>}
        </div>
        <LayerPanel />
        <MarineBoundaryEditor open={marineEditorOpen} setOpen={setMarineEditorOpen} />
        <PolicyNote />
        <InsetPanel />
        <InfoCard />
        <SidePanel />
      </div>
      {catalogTab !== null && <CatalogPage tabId={catalogTab} onNavigate={navigateCatalog} onClose={closeCatalog} />}
    </div>
  );
}
