import { useMapStore } from '../store/mapStore';
import SpeakButton from './SpeakButton';

export default function SidePanel() {
  const sidePanelOpen = useMapStore((s) => s.sidePanelOpen);
  const selectedPoint = useMapStore((s) => s.selectedPoint);
  const closeSidePanel = useMapStore((s) => s.closeSidePanel);

  return (
    <div className={`side-panel ${sidePanelOpen ? 'open' : ''}`}>
      <div className="side-panel-header">
        <h2>{selectedPoint?.name || ''}</h2>
        <button className="side-panel-close" onClick={closeSidePanel}>
          &times;
        </button>
      </div>
      <div className="side-panel-content">
        {selectedPoint && (
          <>
            {selectedPoint.officialName && selectedPoint.officialName !== selectedPoint.name && (
              <p className="info-card-official">{selectedPoint.officialName}</p>
            )}
            {selectedPoint.nativeName && selectedPoint.nativeName !== selectedPoint.name && (
              <p className="info-card-native">
                {selectedPoint.nativeName}
                {selectedPoint.nativeLang && (
                  <SpeakButton text={selectedPoint.nativeName} lang={selectedPoint.nativeLang} />
                )}
              </p>
            )}
            <p className="side-panel-summary">{selectedPoint.summary}</p>
            {selectedPoint.statusNote && (
              <p className="info-card-status">
                <span className="info-card-status-badge">Status</span>
                {selectedPoint.statusNote}
              </p>
            )}
            <div className="side-panel-placeholder">
              <p>Detailed content for <strong>{selectedPoint.name}</strong> will be loaded from markdown files.</p>
              <p>Create a file at <code>content/{selectedPoint.type === 'country' ? 'countries' : selectedPoint.type === 'city' ? 'cities' : 'features'}/{selectedPoint.id}.md</code> to add rich content here.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
