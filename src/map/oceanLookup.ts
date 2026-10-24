import type { Feature, Geometry } from 'geojson';

const wrap = (longitude: number) => ((longitude + 180) % 360 + 360) % 360 - 180;

// Work relative to the click, unwrapping each edge continuously across 180°.
// Distance is to the water boundary, never to a typographic label anchor.
export function oceanAtPoint(features: Feature<Geometry>[], lng: number, lat: number): string {
  let nearest = 'Ocean', distance = Infinity;
  for (const feature of features) {
    const geometry = feature.geometry;
    if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') continue;
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    for (const polygon of polygons) {
      const unwrapped = polygon.map(ring => {
        let longitude = wrap(ring[0][0] - lng);
        return ring.map((point, i) => {
          if (i) longitude += wrap(point[0] - ring[i - 1][0]);
          return [longitude, point[1] - lat];
        });
      });
      let contains = false;
      for (const queryX of [-360, 0, 360]) {
        let inPolygon = false;
        for (const ring of unwrapped) {
          let inside = false;
          for (let i = 0; i < ring.length - 1; i++) {
            const [ax, ay] = ring[i], [bx, by] = ring[i + 1];
            if ((ay > 0) !== (by > 0) && queryX < ax + (bx - ax) * -ay / (by - ay)) inside = !inside;
            const scale = Math.cos(lat * Math.PI / 180);
            const x = (ax - queryX) * scale, dx = (bx - ax) * scale, dy = by - ay;
            const t = Math.max(0, Math.min(1, -(x * dx + ay * dy) / (dx * dx + dy * dy || 1)));
            const d = (x + t * dx) ** 2 + (ay + t * dy) ** 2;
            if (d < distance) { distance = d; nearest = String(feature.properties?.name || 'Ocean'); }
          }
          if (inside) inPolygon = !inPolygon;
        }
        if (inPolygon) contains = true;
      }
      if (contains) return String(feature.properties?.name || 'Ocean');
    }
  }
  return nearest;
}
