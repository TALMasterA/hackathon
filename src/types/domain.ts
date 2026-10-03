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

export type FurnitureKind = "sofa" | "coffee-table" | "tv-console" | "side-table" | "dining-table" | "chair" | "bed" | "wardrobe" | "desk" | "kitchen-counter" | "fridge" | "toilet" | "vanity";

export interface OrientedRectangle {
  width: number;
  depth: number;
  position: Position2D;
  orientation: number;
}

export interface FlatFurniture extends Dimensions, OrientedRectangle {
  id: string;
  name: LocalizedName;
  kind: FurnitureKind;
  roomId: string;
}

export interface FlatRoom extends OrientedRectangle {
  id: string;
  name: LocalizedName;
}

export interface Wall {
  id: string;
  name: LocalizedName;
  start: Position2D;
  end: Position2D;
  thickness: number;
  outer: boolean;
}

export interface Door {
  id: string;
  name: LocalizedName;
  wallId: string;
  position: Position2D;
  width: number;
  swingRoomId: string;
  connects: readonly [string, string];
}

export interface FlatWindow {
  id: string;
  name: LocalizedName;
  wallId: string;
  roomId: string;
  position: Position2D;
  width: number;
  sillHeight: number;
  height: number;
}

export interface Flat extends Room {
  wallThickness: number;
  rooms: readonly FlatRoom[];
  walls: readonly Wall[];
  doors: readonly Door[];
  windows: readonly FlatWindow[];
}

export interface FurnitureTemplate extends Dimensions {
  id: string;
  name: LocalizedName;
  kind: FurnitureKind;
}

export interface PolygonOverlap {
  penetration: number;
  translation: Position2D;
  polygon: Position2D[];
  area: number;
  overlapX: number;
  overlapZ: number;
}

export type LayoutViolation =
  | ({ code: "furniture" | "wall" | "door"; id: string; itemId: string; obstacleId: string } & PolygonOverlap)
  | { code: "envelope"; id: string; itemId: string; side: BoundarySide; excess: number; polygon: Position2D[] }
  | { code: "height"; id: string; itemId: string; excess: number };

export interface DistanceLock {
  id: string;
  firstId: string;
  secondId: string;
  minimum: number;
}

export interface LayoutLocks {
  position: readonly string[];
  distance: readonly DistanceLock[];
}

export type LockViolation =
  | { code: "lock.position"; lockId: string; itemId: string; displacement: number }
  | { code: "lock.distance"; lockId: string; firstId: string; secondId: string; required: number; actual: number };

export interface LayoutSnapshot {
  furniture: FlatFurniture[];
  ceilingHeight: number;
}

export type ItemChange = "moved" | "rotated" | "resized" | "replaced" | "added" | "removed";

export type EditorField = keyof Dimensions | "x" | "z" | "angle" | "ceilingHeight" | "distance";

export interface EditorInputIssue {
  code: InputIssue["code"];
  field: EditorField;
  minimum?: number;
  maximum?: number;
}

export interface FurnitureDraft {
  width: string;
  depth: string;
  height: string;
  x: string;
  z: string;
  angle: string;
}