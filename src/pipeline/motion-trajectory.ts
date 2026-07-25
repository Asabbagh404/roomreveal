/**
 * Motion Brush exit trajectories (Story 4.8). Pure and deterministic — no
 * state, no clock, no randomness.
 *
 * The Motion Brush backend generates the furnished→empty EXIT clip, then
 * reverses the MP4 so the furniture enters and the last frame is the untouched
 * photo. So each object's trajectory here is its path OUT of the frame — the
 * reverse of Story 4.6's `entryDirection`. Trajectories are lists of `{x,y}`
 * points in IMAGE PIXELS (AD-2 — Kling wants pixel coordinates), first point =
 * the object's current center, last point = where it leaves through the nearest
 * frame edge.
 */

/**
 * Builds the exit trajectory for one detected object.
 *
 * @param box    `[x0,y0,x1,y1]` normalized to [0,1] (the detection box).
 * @param width  image width in pixels.
 * @param height image height in pixels.
 * @returns at least two `{x,y}` points in image pixels: the box center, then the
 *          nearest-edge exit point. The object slides straight out toward
 *          whichever frame edge (left / right / top / bottom) its center is
 *          closest to; ties resolve deterministically (left before right,
 *          top before bottom, horizontal before vertical).
 *          Coordinates are INTEGER pixels: Kling's `dynamic_masks.trajectories`
 *          schema rejects fractional x/y (422 `int_from_float`), and they are
 *          clamped inside `[0, width-1] × [0, height-1]` so an edge exit never
 *          lands one pixel outside the frame.
 */
export function exitTrajectory(
  box: [number, number, number, number],
  width: number,
  height: number,
): { x: number; y: number }[] {
  const [x0, y0, x1, y1] = box;
  const cx = ((x0 + x1) / 2) * width;
  const cy = ((y0 + y1) / 2) * height;

  // Distance from the center to each frame edge (pixels).
  const distLeft = cx;
  const distRight = width - cx;
  const distTop = cy;
  const distBottom = height - cy;

  // Nearest edge wins. Deterministic tie order: left, right, top, bottom — so a
  // dead-center object exits left, and horizontal beats vertical on equal ties.
  const nearest = Math.min(distLeft, distRight, distTop, distBottom);
  let exit: { x: number; y: number };
  if (nearest === distLeft) {
    exit = { x: 0, y: cy };
  } else if (nearest === distRight) {
    exit = { x: width, y: cy };
  } else if (nearest === distTop) {
    exit = { x: cx, y: 0 };
  } else {
    exit = { x: cx, y: height };
  }

  // Kling requires integer pixel coordinates; round and clamp to the frame.
  const toPixel = (p: { x: number; y: number }) => ({
    x: Math.min(Math.max(Math.round(p.x), 0), width - 1),
    y: Math.min(Math.max(Math.round(p.y), 0), height - 1),
  });

  return [toPixel({ x: cx, y: cy }), toPixel(exit)];
}
