import type { Dimensions, InputField, InputIssue, ReplacementInput, Room } from "../../types/domain";

export const DIMENSION_MAXIMUMS: Record<keyof Dimensions, number> = {
  width: 1000,
  depth: 1000,
  height: 500,
};

export const INPUT_FIELDS: readonly InputField[] = ["width", "depth", "height", "roomHeight"];

type ParsedNumber = { value: number } | { issue: InputIssue };
type ValidatedInput =
  | { complete: false; issues: InputIssue[] }
  | { complete: true; dimensions: Dimensions; roomHeight: number };

function parseField(raw: string, field: InputField, room: Room): ParsedNumber {
  const text = raw.trim();
  if (text === "") return { issue: { code: "input.missing", field } };
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) {
    return { issue: { code: "input.malformed", field } };
  }
  const value = Number(text);
  if (!Number.isFinite(value)) return { issue: { code: "input.malformed", field } };
  if (value <= 0) return { issue: { code: "input.positive", field } };
  if (field === "roomHeight") {
    if (value < room.minimumHeight || value > room.maximumHeight) {
      return { issue: { code: "input.range", field, minimum: room.minimumHeight, maximum: room.maximumHeight } };
    }
  } else if (value > DIMENSION_MAXIMUMS[field]) {
    return { issue: { code: "input.maximum", field, maximum: DIMENSION_MAXIMUMS[field] } };
  }
  return { value };
}

export function validateInput(input: ReplacementInput, room: Room): ValidatedInput {
  const width = parseField(input.width, "width", room);
  const depth = parseField(input.depth, "depth", room);
  const height = parseField(input.height, "height", room);
  const roomHeight = parseField(input.roomHeight, "roomHeight", room);
  const issues = [width, depth, height, roomHeight].flatMap((parsed) => "issue" in parsed ? [parsed.issue] : []);
  if ("value" in width && "value" in depth && "value" in height && "value" in roomHeight) {
    return { complete: true, dimensions: { width: width.value, depth: depth.value, height: height.value }, roomHeight: roomHeight.value };
  }
  return { complete: false, issues };
}

export function validatedRoomHeight(raw: string, room: Room): number | null {
  const parsed = parseField(raw, "roomHeight", room);
  return "value" in parsed ? parsed.value : null;
}