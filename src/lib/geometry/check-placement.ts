import type { BoundarySide, CandidateFurniture, FitResult, FurnitureItem, PlacementCheck, PlacementCheckCode, PlacementViolation, ReplacementInput, ReservedZone, Room } from "../../types/domain";
import { GEOMETRY_EPSILON_CM, getFootprint, getOverlap } from "./footprint";
import { validateInput } from "./input";

export function checkReplacement(
  input: ReplacementInput,
  room: Room,
  furniture: readonly FurnitureItem[],
  zones: readonly ReservedZone[],
  replacesId: string,
): FitResult {
  const parsed = validateInput(input, room);
  if (!parsed.complete) return { status: "incomplete", issues: parsed.issues };

  const replacedItem = furniture.find((item) => item.id === replacesId && item.replaceable);
  if (!replacedItem) throw new Error(`No replaceable item found: ${replacesId}`);

  const candidate: CandidateFurniture = {
    ...parsed.dimensions,
    position: { ...replacedItem.position },
    orientation: input.orientation,
    replacesId,
  };
  const footprint = getFootprint(candidate);
  const violations: PlacementViolation[] = [];
  const boundaryExcesses: [BoundarySide, number][] = [
    ["left", -footprint.minX],
    ["right", footprint.maxX - room.width],
    ["front", -footprint.minZ],
    ["back", footprint.maxZ - room.depth],
  ];
  for (const [side, excess] of boundaryExcesses) {
    if (excess > GEOMETRY_EPSILON_CM) violations.push({ code: "boundary", side, excess });
  }

  if (candidate.height > parsed.roomHeight) {
    violations.push({ code: "height", excess: candidate.height - parsed.roomHeight });
  }

  for (const obstacle of furniture) {
    if (obstacle.id === replacesId) continue;
    const overlap = getOverlap(footprint, getFootprint(obstacle));
    if (overlap) violations.push({ code: "collision", furnitureId: obstacle.id, name: obstacle.name, ...overlap });
  }

  for (const zone of zones) {
    const overlap = getOverlap(footprint, getFootprint(zone));
    if (overlap) violations.push({ code: "reserved", zoneId: zone.id, name: zone.name, ...overlap });
  }

  const codes: PlacementCheckCode[] = ["boundary", "collision", "reserved", "height"];
  const checks: PlacementCheck[] = codes.map((code) => ({ code, passed: !violations.some((violation) => violation.code === code) }));
  const result = { candidate, roomHeight: parsed.roomHeight, checks };
  return violations.length === 0 ? { status: "valid", ...result } : { status: "invalid", ...result, violations };
}

export function boundaryReduction(result: Extract<FitResult, { status: "invalid" }>, axis: "x" | "z"): number {
  const sides: BoundarySide[] = axis === "x" ? ["left", "right"] : ["front", "back"];
  const excesses = result.violations.flatMap((violation) => violation.code === "boundary" && sides.includes(violation.side) ? [violation.excess] : []);
  return 2 * Math.max(0, ...excesses);
}