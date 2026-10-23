import MapContainer from './map/MapContainer';
import { mapRegistry } from './map/mapRegistry';
import InfoCard from './components/InfoCard';
import SidePanel from './components/SidePanel';
import SearchBar from './components/SearchBar';
import ZoomIndicator from './components/ZoomIndicator';
import PolicyNote from './components/PolicyNote';
import InsetPanel from './components/InsetPanel';
import LayerPanel from './components/LayerPanel';
import './styles/global.css';

export default function App() {
  const handleFlyTo = (lng: number, lat: number, zoom: number) => {
    mapRegistry.map?.flyTo({ center: [lng, lat], zoom, duration: 1500 });
  };

  return (
    <div className="app">
      <MapContainer />
      <div className="ui-overlay">
        <SearchBar onFlyTo={handleFlyTo} />
        <ZoomIndicator />
      </div>
      <LayerPanel />
      <PolicyNote />
      <InsetPanel />
      <InfoCard />
      <SidePanel />
    </div>
  );
}
