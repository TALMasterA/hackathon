import type { LayoutLocks, LayoutSnapshot } from "../../types/domain";

/** Values are rounded to this before hashing, so float noise below it never counts as an edit. */
export const REVISION_PRECISION_CM = 0.01;

const rounded = (value: number) => Math.round(value / REVISION_PRECISION_CM);

/**
 * A short deterministic fingerprint (two FNV-1a hashes with different seeds, 64 bits) of a flat's committed layout and constraints:
 * every item's id, kind, size, position and rotation, the ceiling, and the position and distance locks.
 * Two layouts with the same revision are treated as the same version when checking for outside edits.
 */
export function layoutRevision(flatId: string, layout: LayoutSnapshot, locks: LayoutLocks): string {
  const parts = [
    flatId,
    rounded(layout.ceilingHeight),
    ...layout.furniture.map((item) => [item.id, item.kind, rounded(item.width), rounded(item.depth), rounded(item.height), rounded(item.position.x), rounded(item.position.z), rounded(item.orientation)].join(",")),
    "locks",
    ...[...locks.position].sort(),
    ...locks.distance.map((lock) => `${lock.id}:${lock.firstId}:${lock.secondId}:${rounded(lock.minimum)}`),
  ];
  const text = parts.join("|");
  return fnv1a(text, 0x811c9dc5) + fnv1a(text, 0x050c5d1f);
}

function fnv1a(text: string, seed: number): string {
  let hash = seed;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
