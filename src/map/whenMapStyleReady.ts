// isStyleLoaded() also waits for source tiles. After the first load event it can
// become false again during pan/zoom, without another load event ever firing.
export function whenMapStyleReady(
  map: { getLayer(id: string): unknown; on(event: 'styledata', listener: () => void): unknown; off(event: 'styledata', listener: () => void): unknown },
  setup: () => void,
) {
  let finished = false;
  const attempt = () => {
    if (finished || !map.getLayer('country-fill-10')) return;
    finished = true;
    map.off('styledata', attempt);
    setup();
  };
  map.on('styledata', attempt);
  attempt();
  return () => { finished = true; map.off('styledata', attempt); };
}
