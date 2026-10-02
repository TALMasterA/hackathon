export type Language = "en" | "zh-Hant";
export type LocalizedName = Record<Language, string>;
export type Orientation = 0 | 90;

export interface Dimensions {
  width: number;
  depth: number;
  height: number;
}

export interface Position2D {
  x: number;
  z: number;
}

export interface Room extends Dimensions {
  id: string;
  name: LocalizedName;
  minimumHeight: number;
  maximumHeight: number;
  dimensionSource: "team-demo-assumptions";
}

export interface FurnitureItem extends Dimensions {
  id: string;
  name: LocalizedName;
  kind: "sofa" | "coffee-table" | "tv-console" | "side-table";
  position: Position2D;
  orientation: Orientation;
  replaceable: boolean;
}

export interface ReservedZone {
  id: string;
  name: LocalizedName;
  position: Position2D;
  width: number;
  depth: number;
  basis: "demo-preference";
}

export interface CandidateFurniture extends Dimensions {
  position: Position2D;
  orientation: Orientation;
  replacesId: string;
}

export type InputField = keyof Dimensions | "roomHeight";

export interface ReplacementInput {
  width: string;
  depth: string;
  height: string;
  roomHeight: string;
  orientation: Orientation;
}

export interface InputIssue {
  code: "input.missing" | "input.malformed" | "input.positive" | "input.maximum" | "input.range";
  field: InputField;
  maximum?: number;
  minimum?: number;
}

export interface Footprint {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  width: number;
  depth: number;
}

export type BoundarySide = "left" | "right" | "front" | "back";
export type PlacementCheckCode = "boundary" | "height" | "collision" | "reserved";

export interface PlacementCheck {
  code: PlacementCheckCode;
  passed: boolean;
}

export type PlacementViolation =
  | { code: "boundary"; side: BoundarySide; excess: number }
  | { code: "height"; excess: number }
  | { code: "collision"; furnitureId: string; name: LocalizedName; overlapX: number; overlapZ: number }
  | { code: "reserved"; zoneId: string; name: LocalizedName; overlapX: number; overlapZ: number };

export type FitResult =
  | { status: "incomplete"; issues: InputIssue[] }
  | { status: "valid"; candidate: CandidateFurniture; roomHeight: number; checks: PlacementCheck[] }
  | { status: "invalid"; candidate: CandidateFurniture; roomHeight: number; checks: PlacementCheck[]; violations: PlacementViolation[] };