import { useMapStore } from '../store/mapStore';

const zoomLabels = [
  { min: 0, max: 2, label: 'World' },
  { min: 2, max: 4, label: 'Continental' },
  { min: 4, max: 6, label: 'Regional' },
  { min: 6, max: 8, label: 'National' },
  { min: 8, max: 10, label: 'Provincial' },
  { min: 10, max: 15, label: 'Local' },
];

export default function ZoomIndicator() {
  const zoom = useMapStore((s) => s.zoom);
  const hoveredFeatureId = useMapStore((s) => s.hoveredFeatureId);

  const level = zoomLabels.find(l => zoom >= l.min && zoom < l.max) || zoomLabels[zoomLabels.length - 1];

  return (
    <div className="zoom-indicator">
      <span className="zoom-level">{level.label}</span>
      {hoveredFeatureId && <span className="zoom-hover">{hoveredFeatureId}</span>}
    </div>
  );
}
