// 13 mutually distinct hues spread around the colour wheel. MAPCOLOR13 only
// guarantees adjacent countries get different *numbers*, so the numbers must map
// to clearly different colours — otherwise neighbours like Algeria(3)/Libya(11)
// look identical. Every entry here is a separable hue (red, orange, gold, lime,
// green, emerald, teal, cyan, blue, periwinkle, violet, magenta, pink).
export const COUNTRY_COLORS: Record<number, string> = {
  1: '#E0706B', // red
  2: '#34B5A4', // teal
  3: '#4E92D4', // blue
  4: '#74C36B', // green
  5: '#F2C744', // gold
  6: '#B07ACB', // lavender
  7: '#F0913C', // orange
  8: '#45CBDD', // cyan
  9: '#B6C94A', // lime
  10: '#D873A0', // rose-magenta
  11: '#8568C9', // purple (kept well clear of the blue 3 — fixes 3-vs-11 borders)
  12: '#F0928A', // coral-pink
  13: '#4FBE7D', // emerald
};

export function buildColorMatchExpression(): unknown[] {
  const expr: unknown[] = ['match', ['get', 'MAPCOLOR13']];
  for (const [key, color] of Object.entries(COUNTRY_COLORS)) {
    expr.push(Number(key), color);
  }
  expr.push('#CCCCCC');
  return expr;
}
