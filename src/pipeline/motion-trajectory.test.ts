import { describe, expect, it } from "vitest";
import { exitTrajectory } from "./motion-trajectory";

const W = 1000;
const H = 800;

describe("exitTrajectory (Story 4.8 — pure exit paths)", () => {
  it("starts at the box center in image pixels and returns at least 2 points", () => {
    const traj = exitTrajectory([0.4, 0.4, 0.6, 0.6], W, H);
    expect(traj.length).toBeGreaterThanOrEqual(2);
    expect(traj[0]).toEqual({ x: 500, y: 400 }); // center in pixels
  });

  it("exits LEFT when the center is nearest the left edge", () => {
    // center ≈ (150, 400): closest edge is left.
    const traj = exitTrajectory([0.1, 0.4, 0.2, 0.6], W, H);
    const exit = traj[traj.length - 1];
    expect(exit.x).toBe(0);
    expect(exit.y).toBe(400);
  });

  it("exits RIGHT when the center is nearest the right edge", () => {
    // center ≈ (900, 400): closest edge is right.
    const traj = exitTrajectory([0.85, 0.4, 0.95, 0.6], W, H);
    const exit = traj[traj.length - 1];
    expect(exit.x).toBe(W - 1); // clamped inside the frame (integer pixels, Kling)
    expect(exit.y).toBe(400);
  });

  it("exits TOP when the center is nearest the top edge", () => {
    // center ≈ (500, 80): closest edge is top.
    const traj = exitTrajectory([0.4, 0.05, 0.6, 0.15], W, H);
    const exit = traj[traj.length - 1];
    expect(exit.x).toBe(500);
    expect(exit.y).toBe(0);
  });

  it("exits BOTTOM when the center is nearest the bottom edge", () => {
    // center ≈ (500, 760): closest edge is bottom.
    const traj = exitTrajectory([0.4, 0.9, 0.6, 1.0], W, H);
    const exit = traj[traj.length - 1];
    expect(exit.x).toBe(500);
    expect(exit.y).toBe(H - 1); // clamped inside the frame (integer pixels, Kling)
  });

  it("is deterministic and points OUTWARD (center then edge, not the reverse)", () => {
    const box: [number, number, number, number] = [0.0, 0.4, 0.2, 0.6];
    const a = exitTrajectory(box, W, H);
    const b = exitTrajectory(box, W, H);
    expect(a).toEqual(b); // deterministic
    // First point is inside the frame, last is on an edge (x === 0 here).
    expect(a[0].x).toBeGreaterThan(0);
    expect(a[a.length - 1].x).toBe(0);
  });

  it("returns INTEGER pixel coordinates (Kling rejects fractional x/y with 422)", () => {
    // A box whose center lands on fractional pixels (0.4383… × 1001) must round.
    const traj = exitTrajectory([0.3123, 0.4571, 0.5645, 0.6231], 1001, 801);
    for (const p of traj) {
      expect(Number.isInteger(p.x)).toBe(true);
      expect(Number.isInteger(p.y)).toBe(true);
    }
  });

  it("resolves a dead-center object to the left edge (tie order left→right→top→bottom)", () => {
    // Dead center of a square: all four edges tie at 500 — left wins the tie.
    const traj = exitTrajectory([0.45, 0.45, 0.55, 0.55], 1000, 1000);
    const exit = traj[traj.length - 1];
    expect(exit).toEqual({ x: 0, y: 500 });
  });
});
