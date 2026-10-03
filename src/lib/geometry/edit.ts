import type { Dimensions, EditorInputIssue, Flat, FlatFurniture, FurnitureDraft } from "../../types/domain";
import { containingRoom } from "./architecture";
import { parseDecimalText, validateInput } from "./input";
import { normalizeAngle } from "./oriented";

export function furnitureDraft(item: FlatFurniture): FurnitureDraft {
  return { width: String(item.width), depth: String(item.depth), height: String(item.height), x: String(item.position.x), z: String(item.position.z), angle: String(item.orientation) };
}

export function validateFurnitureDraft(draft: FurnitureDraft, item: FlatFurniture, flat: Flat):
  | { complete: false; issues: EditorInputIssue[] }
  | { complete: true; item: FlatFurniture } {
  const dimensions = validateInput({ ...draft, roomHeight: String(flat.height), orientation: 0 }, flat);
  const issues: EditorInputIssue[] = dimensions.complete ? [] : dimensions.issues.map((issue) => ({ ...issue, field: issue.field === "roomHeight" ? "ceilingHeight" : issue.field }));
  const x = parseDecimalText(draft.x);
  const z = parseDecimalText(draft.z);
  const angle = parseDecimalText(draft.angle);
  for (const [field, value] of [["x", x], ["z", z], ["angle", angle]] as const) {
    if (!value.valid) issues.push({ code: value.code, field });
  }
  for (const [field, value] of [["x", x], ["z", z]] as const) {
    if (value.valid && Math.abs(value.value) > 10000) issues.push({ code: "input.range", field, minimum: -10000, maximum: 10000 });
  }
  if (angle.valid && (angle.value < 0 || angle.value > 360)) issues.push({ code: "input.range", field: "angle", minimum: 0, maximum: 360 });
  if (!dimensions.complete || !x.valid || !z.valid || !angle.valid || issues.length > 0) return { complete: false, issues };
  const position = { x: x.value, z: z.value };
  return { complete: true, item: { ...item, ...dimensions.dimensions, position, orientation: normalizeAngle(angle.value), roomId: containingRoom(flat, position)?.id ?? item.roomId } };
}

export function replaceDimensions(item: FlatFurniture, dimensions: Dimensions): FlatFurniture {
  return { ...item, ...dimensions, position: { ...item.position } };
}