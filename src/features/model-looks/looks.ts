import type { Object3D } from "three";
import { MODEL_FACING_DEGREES, type ObjectBounds } from "../../components/scene/fit";
import type { FlatFurniture, FurnitureKind } from "../../types/domain";
import type { EditorAction, EditorState } from "../flat-editor/state";

export type QuarterTurns = 0 | 1 | 2 | 3;

/** An item's own 3D appearance, made by AI from a photo. Appearance only: geometry and checks keep using the item's box. */
export interface Look {
  object: Object3D;
  quarterTurns: QuarterTurns;
  name: string;
  /** Kind the look was made for, so a reused item ID of another kind never inherits it. */
  kind: FurnitureKind;
}

export type Looks = ReadonlyMap<string, Look>;

/** Facing rule from the kind models, then the user's quarter turns, clockwise in the plan like item angles. */
export function lookRotationDeg(look: Pick<Look, "quarterTurns">): number {
  return MODEL_FACING_DEGREES - look.quarterTurns * 90;
}

/** A long side counts only when it is clearly longer than the other; near-square shapes keep turn 0. */
const ASPECT_RATIO_THRESHOLD = 1.2;

/**
 * Starting quarter turns for a new look: one turn when the model's longer horizontal side clearly lies
 * across the item's longer side (TRELLIS has returned models facing +X), else none. Turn 90 adjusts it.
 */
export function initialQuarterTurns(bounds: ObjectBounds, item: { width: number; depth: number }): QuarterTurns {
  const sizeX = bounds.max[0] - bounds.min[0];
  const sizeZ = bounds.max[2] - bounds.min[2];
  const modelLong = sizeX >= sizeZ * ASPECT_RATIO_THRESHOLD ? "x" : sizeZ >= sizeX * ASPECT_RATIO_THRESHOLD ? "z" : null;
  const itemLong = item.width >= item.depth * ASPECT_RATIO_THRESHOLD ? "x" : item.depth >= item.width * ASPECT_RATIO_THRESHOLD ? "z" : null;
  return modelLong && itemLong && modelLong !== itemLong ? 1 : 0;
}

export type LooksAction =
  | { type: "set"; itemId: string; look: Look }
  | { type: "turn"; itemId: string }
  | { type: "remove"; itemId: string };

export function lookKey(scope: string, itemId: string): string {
  return JSON.stringify([scope, itemId]);
}

export function scopedLooks(looks: Looks, scope: string): Looks {
  const prefix = JSON.stringify([scope]).slice(0, -1) + ",";
  return new Map([...looks].filter(([key]) => key.startsWith(prefix)).map(([key, look]) => [JSON.parse(key)[1] as string, look]));
}

/**
 * Looks live outside the editor reducer and its undo history. They are keyed by item ID and kept
 * when an item is deleted or the demo is reset, so undo brings an item back with its look.
 */
export function looksReducer(looks: Looks, action: LooksAction): Looks {
  const next = new Map(looks);
  if (action.type === "set") next.set(action.itemId, action.look);
  else if (action.type === "remove") next.delete(action.itemId);
  else {
    const look = looks.get(action.itemId);
    if (!look) return looks;
    next.set(action.itemId, { ...look, quarterTurns: ((look.quarterTurns + 1) % 4) as QuarterTurns });
  }
  return next;
}

/** Looks to render: only for items that currently exist and still have the kind the look was made for. */
export function visibleLooks(looks: Looks, furniture: readonly FlatFurniture[]): Looks {
  const visible = new Map<string, Look>();
  for (const item of furniture) {
    const look = looks.get(item.id);
    if (look && look.kind === item.kind) visible.set(item.id, look);
  }
  return visible;
}

/** The item whose look an editor step clears: only an accepted replacement from the library. */
export function lookClearedBy(action: EditorAction, before: EditorState, after: EditorState): string | null {
  if (action.type !== "replace-item" || !before.selectedId) return null;
  const previous = before.current.furniture.find((item) => item.id === before.selectedId);
  const next = after.current.furniture.find((item) => item.id === before.selectedId);
  return previous && next && previous !== next ? before.selectedId : null;
}
