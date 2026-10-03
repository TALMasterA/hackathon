export type Language = "en" | "zh-Hant";
export type LocalizedName = Record<Language, string>;
export type Orientation = number;

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
  dimensionSource: "team-demo-assumptions" | "approximate-pdf-trace" | "user-traced";
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

export type BoundarySide = "left" | "right" | "front" | "back" | "outline";

export type FurnitureKind = "sofa" | "coffee-table" | "tv-console" | "side-table" | "dining-table" | "chair" | "bed" | "wardrobe" | "desk" | "kitchen-counter" | "fridge" | "toilet" | "vanity";

export interface OrientedRectangle {
  width: number;
  depth: number;
  position: Position2D;
  orientation: Orientation;
}

export interface FlatFurniture extends Dimensions, OrientedRectangle {
  id: string;
  name: LocalizedName;
  kind: FurnitureKind;
  roomId: string;
}

export type RoomKind = "living" | "bedroom" | "kitchen" | "bathroom" | "other";

export interface FlatRoom extends OrientedRectangle {
  id: string;
  name: LocalizedName;
  kind?: RoomKind;
  outline?: readonly Position2D[];
}

export interface Wall {
  id: string;
  name: LocalizedName;
  start: Position2D;
  end: Position2D;
  thickness: number;
  outer: boolean;
  precision?: "approximate-trace";
}

export interface Door {
  id: string;
  name: LocalizedName;
  wallId: string;
  position: Position2D;
  width: number;
  swingRoomId: string;
  connects: readonly [string, string];
  hinge?: Position2D;
  closedDirection?: Position2D;
  openDirection?: Position2D;
  height?: number;
  precision?: "approximate-trace";
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

/** How a user-traced flat was measured, shown in the source panel; never includes the picture itself. */
export interface FlatTrace {
  sourceName: string;
  scaleMethod: "scale-bar" | "known-length";
  /** Calibrated centimetres per picture unit (PDF point or image pixel). */
  cmPerUnit: number;
  readBy: "ai" | "manual";
  model?: string;
  /** Room edges the user accepted without a match against the drawn wall lines. */
  uncheckedEdges: number;
}

export interface Flat extends Room {
  wallThickness: number;
  outline?: readonly Position2D[];
  source?: {
    page: number;
    pdfUrl: string;
    referenceUrl: string;
    scaleUnitsPerMetre: number;
    windowStatus: "unknown-untraced" | "partial-trace";
    partitionStatus: "partial-trace";
    envelopeAreaM2: number;
  };
  rooms: readonly FlatRoom[];
  walls: readonly Wall[];
  doors: readonly Door[];
  windows: readonly FlatWindow[];
  trace?: FlatTrace;
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
  | ({ code: "outside"; id: string; itemId: string } & PolygonOverlap)
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

export type SuggestionSkipReason = "present" | LayoutViolation["code"] | "lock";

export interface SuggestionReport {
  roomId: string;
  added: string[];
  skipped: { id: string; name: LocalizedName; reason: SuggestionSkipReason }[];
}

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