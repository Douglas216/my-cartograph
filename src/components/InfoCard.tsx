import { useMapStore } from '../store/mapStore';
import SpeakButton from './SpeakButton';

// Physical features show their endonym but no pronounce button — the speaker is
// reserved for country/territory/city names.
const NO_SPEAKER = new Set(['river', 'lake', 'mountain_range', 'peak']);

// Global-rank medal shown beside a lake's area / depth. 1-3 are the classic
// gold/silver/bronze; 4-10 share one slate colour. Title spells out the rank.
const MEDAL_COLORS: Record<number, string> = { 1: '#f5c518', 2: '#c0c7d0', 3: '#cd7f32' };
function RankMedal({ rank, metric }: { rank?: number; metric: string }) {
  if (!rank || rank < 1 || rank > 10) return null;
  const bg = MEDAL_COLORS[rank] ?? '#5b8fa8';
  const ordinal = rank === 1 ? '1st' : rank === 2 ? '2nd' : rank === 3 ? '3rd' : `${rank}th`;
  return (
    <span
      className="info-card-medal"
      style={{ backgroundColor: bg }}
      title={`${ordinal} ${metric} lake in the world`}
      aria-label={`${ordinal} ${metric} in the world`}
    >
      {rank}
    </span>
  );
}

const typeLabels: Record<string, string> = {
  country: 'Country',
  disputed: 'Disputed Area',
  territory: 'Territory',
  city: 'City',
  river: 'River',
  lake: 'Lake',
  mountain_range: 'Mountain Range',
  peak: 'Peak',
  ocean: 'Ocean',
  sea: 'Sea',
  strait: 'Strait',
  gulf: 'Gulf',
  natural_wonder: 'Natural Wonder',
  timezone: 'Time Zone',
};

const typeColors: Record<string, string> = {
  country: '#4ECDC4',
  disputed: '#95a5a6',
  territory: '#7E8FA6',
  city: '#E74C3C',
  river: '#45B7D1',
  lake: '#45B7D1',
  mountain_range: '#96CEB4',
  peak: '#96CEB4',
  ocean: '#5b8fa8',
  sea: '#5b8fa8',
  strait: '#5b8fa8',
  gulf: '#5b8fa8',
  natural_wonder: '#FF8C42',
  timezone: '#6d5f8c',
};

export default function InfoCard() {
  const selectedPoint = useMapStore((s) => s.selectedPoint);
  const selectPoint = useMapStore((s) => s.selectPoint);
  const openSidePanel = useMapStore((s) => s.openSidePanel);

  if (!selectedPoint) return null;

  const badgeColor = typeColors[selectedPoint.type] || '#888';

  return (
    <div className="info-card">
      <button className="info-card-close" onClick={() => selectPoint(null)}>
        &times;
      </button>
      <div
        className={`info-card-badge${selectedPoint.badge ? ' info-card-badge--full' : ''}`}
        style={{ backgroundColor: badgeColor }}
      >
        {selectedPoint.badge || typeLabels[selectedPoint.type] || selectedPoint.type}
      </div>
      <div className="info-card-title-row">
        {selectedPoint.iso2 && (
          <img
            className="info-card-flag"
            src={`https://flagcdn.com/w80/${selectedPoint.iso2.toLowerCase()}.png`}
            srcSet={`https://flagcdn.com/w160/${selectedPoint.iso2.toLowerCase()}.png 2x`}
            alt=""
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}
        <h3 className="info-card-title">{selectedPoint.name}</h3>
      </div>
      {selectedPoint.officialName && selectedPoint.officialName !== selectedPoint.name && (
        <p className="info-card-official">{selectedPoint.officialName}</p>
      )}
      {selectedPoint.nativeName && selectedPoint.nativeName !== selectedPoint.name && (
        <p className="info-card-native">
          {selectedPoint.nativeName}
          {/* Endonym is shown for every feature, but the pronounce button is only
              for political entities — physical features (rivers, lakes, ranges)
              keep the written endonym without a speaker. */}
          {selectedPoint.nativeLang && !NO_SPEAKER.has(selectedPoint.type) && (
            <SpeakButton text={selectedPoint.nativeName} lang={selectedPoint.nativeLang} />
          )}
        </p>
      )}
      {selectedPoint.waterPath && <p className="info-card-water-path">{selectedPoint.waterPath.join(' › ')}</p>}
      {!!selectedPoint.waterChildren && <p className="info-card-water-members">Selection includes {selectedPoint.waterChildren} nested named {selectedPoint.waterChildren === 1 ? 'water body' : 'waters'}.</p>}
      <p className="info-card-summary">{selectedPoint.summary}</p>
      {(selectedPoint.riverSource || selectedPoint.riverMouth) && (
        <div className="info-card-stats">
          {selectedPoint.riverSource && (
            <div className="info-card-stat">
              <span className="info-card-stat-label">Source</span>
              <span className="info-card-stat-value">
                {selectedPoint.riverSource.name}
                <span className="info-card-stat-tag">{selectedPoint.riverSource.type}</span>
              </span>
            </div>
          )}
          {selectedPoint.riverMouth && (
            <div className="info-card-stat">
              <span className="info-card-stat-label">Mouth</span>
              <span className="info-card-stat-value">
                {selectedPoint.riverMouth.name}
                <span className="info-card-stat-tag">{selectedPoint.riverMouth.type}</span>
              </span>
            </div>
          )}
        </div>
      )}
      {(selectedPoint.lakeAreaKm2 != null ||
        selectedPoint.lakeMaxDepthM != null ||
        selectedPoint.lakeSalinity) && (
        <div className="info-card-stats">
          {selectedPoint.lakeAreaKm2 != null && (
            <div className="info-card-stat">
              <span className="info-card-stat-label">Area</span>
              <span className="info-card-stat-value">
                {selectedPoint.lakeAreaKm2.toLocaleString()} km²{' '}
                ({Math.round(selectedPoint.lakeAreaKm2 * 0.386102).toLocaleString()} sq mi)
                <RankMedal rank={selectedPoint.lakeAreaRank} metric="largest" />
              </span>
            </div>
          )}
          {selectedPoint.lakeMaxDepthM != null && (
            <div className="info-card-stat">
              <span className="info-card-stat-label">Max depth</span>
              <span className="info-card-stat-value">
                {selectedPoint.lakeMaxDepthM.toLocaleString()} m{' '}
                ({Math.round(selectedPoint.lakeMaxDepthM * 3.28084).toLocaleString()} ft)
                <RankMedal rank={selectedPoint.lakeDepthRank} metric="deepest" />
              </span>
            </div>
          )}
          {selectedPoint.lakeSalinity && (
            <div className="info-card-stat">
              <span className="info-card-stat-label">Salinity</span>
              <span className="info-card-stat-value">
                {selectedPoint.lakeSalinity}
                {selectedPoint.lakeSalinityGL != null && ` (~${selectedPoint.lakeSalinityGL} g/L)`}
              </span>
            </div>
          )}
        </div>
      )}
      {selectedPoint.statusNote && (
        <p className="info-card-status">
          <span className="info-card-status-badge">Status</span>
          {selectedPoint.statusNote}
        </p>
      )}
      <button
        className="info-card-readmore"
        onClick={() => openSidePanel(selectedPoint.id)}
      >
        Read more &rarr;
      </button>
    </div>
  );
}
