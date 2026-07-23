/** A rectangle in normalized image coordinates (0–1), so it maps to any display
 *  size and to the full-resolution burn-in. Used both for the additive black
 *  boxes and for the "keep" frame (the area to preserve; everything outside it
 *  is blacked out). */
export interface RedactionBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The full frame — nothing cropped. */
export const FULL_FRAME: RedactionBox = { x: 0, y: 0, w: 1, h: 1 };
