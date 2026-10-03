import { describe, expect, it } from "vitest";
import { fitObjectToBox, MODEL_FACING_DEGREES, quarterTurnsOf, type BoxFit, type ObjectBounds } from "./fit";

const SOFA_BOUNDS: ObjectBounds = { min: [0, 0, -0.41], max: [0.98, 0.46, 0] };
const OFFSET_BOUNDS: ObjectBounds = { min: [-0.461, -0.4, -0.3], max: [0.2, 0.16, 0.1] };
const DIMENSIONS = { width: 180, depth: 80, height: 82 };

function transform(fit: BoxFit, point: readonly number[]): [number, number, number] {
  const x = point[0] * fit.scale[0];
  const y = point[1] * fit.scale[1];
  const z = point[2] * fit.scale[2];
  const cosine = Math.cos(fit.rotationY);
  const sine = Math.sin(fit.rotationY);
  return [fit.position[0] + x * cosine + z * sine, fit.position[1] + y, fit.position[2] - x * sine + z * cosine];
}

function fittedBox(bounds: ObjectBounds, fit: BoxFit) {
  const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((index) => transform(fit, [index & 1 ? bounds.max[0] : bounds.min[0], index & 2 ? bounds.max[1] : bounds.min[1], index & 4 ? bounds.max[2] : bounds.min[2]]));
  const min = [0, 1, 2].map((axis) => Math.min(...corners.map((corner) => corner[axis])));
  const max = [0, 1, 2].map((axis) => Math.max(...corners.map((corner) => corner[axis])));
  return { min, max };
}

describe("fitObjectToBox", () => {
  for (const bounds of [SOFA_BOUNDS, OFFSET_BOUNDS]) {
    for (const rotation of [0, 90, 180, 270, 360, -90, 450]) {
      it(`fits ${bounds === SOFA_BOUNDS ? "corner-origin" : "offset"} bounds exactly at ${rotation} degrees`, () => {
        const box = fittedBox(bounds, fitObjectToBox(bounds, DIMENSIONS, rotation));
        expect(box.max[0] - box.min[0]).toBeCloseTo(1.8, 9);
        expect(box.max[1] - box.min[1]).toBeCloseTo(0.82, 9);
        expect(box.max[2] - box.min[2]).toBeCloseTo(0.8, 9);
        expect(box.min[1]).toBeCloseTo(0, 9);
        expect((box.min[0] + box.max[0]) / 2).toBeCloseTo(0, 9);
        expect((box.min[2] + box.max[2]) / 2).toBeCloseTo(0, 9);
      });
    }
  }

  it("turns a glTF model's back (-Z) to FitIn's back (+Z), matching SofaModel's backrest", () => {
    const fit = fitObjectToBox(SOFA_BOUNDS, DIMENSIONS, MODEL_FACING_DEGREES);
    const backrest = transform(fit, [0.49, 0.46, -0.41]);
    const front = transform(fit, [0.49, 0, 0]);
    expect(backrest[2]).toBeCloseTo(0.4, 9);
    expect(front[2]).toBeCloseTo(-0.4, 9);
  });

  it("swaps the stretched axes for quarter turns", () => {
    const fit = fitObjectToBox(SOFA_BOUNDS, DIMENSIONS, 90);
    expect(fit.scale[0]).toBeCloseTo(0.8 / 0.98, 9);
    expect(fit.scale[2]).toBeCloseTo(1.8 / 0.41, 9);
  });

  it("leaves a degenerate axis unscaled instead of dividing by zero", () => {
    const fit = fitObjectToBox({ min: [0, 0, 0], max: [1, 0, 1] }, DIMENSIONS, 0);
    expect(fit.scale.every(Number.isFinite)).toBe(true);
    expect(fit.scale[1]).toBe(1);
  });

  it("normalises any multiple of 90 degrees to a quarter-turn count", () => {
    expect([0, 90, 180, 270, 360, -90, 449, 1e3].map(quarterTurnsOf)).toEqual([0, 1, 2, 3, 0, 3, 1, 3]);
  });
});
