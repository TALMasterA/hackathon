import type { DistanceLock, FlatFurniture, LayoutLocks, LockViolation } from "../../types/domain";
import { GEOMETRY_EPSILON_CM } from "./footprint";
import { parseDecimalText } from "./input";
import { polygonDistance, rectanglePolygon } from "./oriented";

export type LockSetupIssue = "same-items" | "missing-items" | "minimum-input";

export function validateDistanceLock(furniture: readonly FlatFurniture[], input: { id: string; firstId: string; secondId: string; minimum: string }):
  | { status: "input"; issue: LockSetupIssue }
  | { status: "violated"; violations: LockViolation[] }
  | { status: "valid"; lock: DistanceLock } {
  if (input.firstId === input.secondId) return { status: "input", issue: "same-items" };
  if (![input.firstId, input.secondId].every((id) => furniture.some((item) => item.id === id))) return { status: "input", issue: "missing-items" };
  const minimum = parseDecimalText(input.minimum);
  if (!minimum.valid || minimum.value < 0) return { status: "input", issue: "minimum-input" };
  const lock: DistanceLock = { id: input.id, firstId: input.firstId, secondId: input.secondId, minimum: minimum.value };
  const violations = distanceLockViolations(furniture, [lock]);
  return violations.length > 0 ? { status: "violated", violations } : { status: "valid", lock };
}

export function distanceLockViolations(furniture: readonly FlatFurniture[], locks: readonly DistanceLock[]): LockViolation[] {
  return locks.flatMap((lock) => {
    const first = furniture.find((item) => item.id === lock.firstId);
    const second = furniture.find((item) => item.id === lock.secondId);
    if (!first || !second || first.id === second.id || !Number.isFinite(lock.minimum) || lock.minimum < 0) throw new Error(`Invalid distance lock: ${lock.id}`);
    const actual = polygonDistance(rectanglePolygon(first), rectanglePolygon(second));
    return actual + GEOMETRY_EPSILON_CM < lock.minimum
      ? [{ code: "lock.distance" as const, lockId: lock.id, firstId: first.id, secondId: second.id, required: lock.minimum, actual }]
      : [];
  });
}

export function proposeItemEdit(furniture: readonly FlatFurniture[], proposed: FlatFurniture, locks: LayoutLocks):
  | { accepted: true; item: FlatFurniture; violations: [] }
  | { accepted: false; item: FlatFurniture; violations: LockViolation[] } {
  const previous = furniture.find((item) => item.id === proposed.id);
  if (!previous) throw new Error(`Unknown edited item: ${proposed.id}`);
  const violations: LockViolation[] = [];
  const displacement = Math.hypot(previous.position.x - proposed.position.x, previous.position.z - proposed.position.z);
  if (locks.position.includes(proposed.id) && displacement > GEOMETRY_EPSILON_CM) {
    violations.push({ code: "lock.position", lockId: `position-${proposed.id}`, itemId: proposed.id, displacement });
  }
  const next = furniture.map((item) => item.id === proposed.id ? proposed : item);
  violations.push(...distanceLockViolations(next, locks.distance.filter((lock) => lock.firstId === proposed.id || lock.secondId === proposed.id)));
  return violations.length === 0 ? { accepted: true, item: proposed, violations: [] } : { accepted: false, item: previous, violations };
}