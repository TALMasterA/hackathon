import type { FurnitureKind, RoomKind } from "@/types/domain";

/**
 * Drawing inks for the plates: the 2D plan, the 3D scene, the trace views and the rotation dial.
 * The interface around the plates is black type on white (globals.css); colour lives here.
 * Every value is a lowercase #rrggbb so three.js colours and tests can read it.
 */
export const INK = {
  black: "#1a1a18",
  graphite: "#5d5c57",
  rule: "#c9c6bc",
  paper: "#ffffff",
  stock: "#f2f1ec",
  ultramarine: "#2c4bb5",
  ultramarineLight: "#6d86cf",
  chrome: "#d3a335",
  ochre: "#8a640c",
  vermilion: "#c8341f",
  vermilionDeep: "#9e2614",
  emerald: "#3f7f62",
  violet: "#6a4c9c",
} as const;

/** Furniture kinds in muted chromolithograph tints; vermilion is kept for collisions only. */
export const FURNITURE_INKS: Record<FurnitureKind, string> = {
  sofa: "#4f8670",
  "coffee-table": "#a8784c",
  "tv-console": "#55534d",
  "side-table": "#c99a34",
  "dining-table": "#bf9760",
  chair: "#7a9a6a",
  bed: "#6680c4",
  wardrobe: "#8e7ca4",
  desk: "#7d6047",
  "kitchen-counter": "#7c8d96",
  fridge: "#a9bccb",
  toilet: "#d6d3c8",
  vanity: "#6fa39b",
};

/** The 2D plan plate. */
export const PLAN_INK = {
  stock: INK.stock,
  floor: "#ffffff",
  room: "#ffffff",
  roomRule: INK.rule,
  outsideHatch: "#e6e4dc",
  outsideHatchLine: "#bcb8ad",
  wall: INK.black,
  window: INK.ultramarine,
  doorZone: INK.chrome,
  door: INK.ochre,
  zone: INK.violet,
  ghost: INK.graphite,
  collision: INK.vermilion,
  itemRule: "#3b3a36",
  selected: INK.ultramarine,
  highlight: INK.vermilion,
  highlightRule: INK.vermilionDeep,
  label: INK.paper,
  lock: INK.black,
} as const;

/** The 3D scene plate. Lights stay as tuned; only materials and ground follow the inks. */
export const SCENE_INK = {
  background: INK.stock,
  floor: "#ffffff",
  floorEdge: "#b3afa4",
  roomFloor: "#faf9f6",
  outside: "#8f8c84",
  wallPreset: INK.black,
  wallOuter: "#d8d5cc",
  wallInner: "#e3e1d9",
  wallEdge: "#9c998f",
  window: INK.ultramarineLight,
  windowEdge: INK.ultramarine,
  door: INK.chrome,
  doorEdge: INK.ochre,
  ghost: INK.graphite,
  highlight: INK.vermilion,
} as const;

/** Trace plate: room kinds as pale washes under black edges. */
export const ROOM_KIND_INKS: Record<RoomKind, string> = {
  living: "#ecd9a8",
  bedroom: "#bccbea",
  kitchen: "#e7c3ad",
  bathroom: "#b9d8cb",
  other: "#d8cfe4",
};

export const TRACE_INK = {
  verified: INK.black,
  manual: INK.black,
  unverified: INK.ochre,
  open: INK.graphite,
  wall: "#3b3a36",
  wallSelected: INK.ultramarine,
  lit: INK.ultramarine,
  handle: INK.ultramarine,
  handleFill: INK.paper,
  door: INK.ochre,
  doorFlagged: INK.chrome,
  doorGap: INK.stock,
  window: INK.ultramarine,
  problem: INK.vermilion,
  problemRule: INK.vermilionDeep,
  selection: INK.ultramarine,
  marker: INK.vermilion,
  markerText: INK.vermilionDeep,
} as const;
