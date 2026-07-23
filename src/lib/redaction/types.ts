/** A point in normalized image coordinates (0–1), so it maps to any display
 *  size and to the full-resolution burn-in. */
export interface Point {
  x: number;
  y: number;
}

/** The "keep" region: a free quadrilateral (4 independent corners, clockwise
 *  from top-left: TL, TR, BR, BL). Unlike an axis-aligned rectangle it can
 *  follow the perspective tilt of an X-ray photographed at an angle, so the
 *  margins outside it are removed cleanly regardless of skew. Everything
 *  outside this quad is blacked out. */
export type Quad = [Point, Point, Point, Point];

/** A rectangle in normalized coordinates — used for the additive black boxes
 *  that cover any text left inside the keep-frame. */
export interface RedactionBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The whole image — nothing cropped. */
export const FULL_QUAD: Quad = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];
