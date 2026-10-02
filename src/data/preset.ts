import type { FurnitureItem, ReplacementInput, ReservedZone, Room } from "../types/domain";

export const DEMO_ROOM: Room = {
  id: "concord1-option1-2b-demo-living-room",
  name: { en: "Living / Dining Room Demo", "zh-Hant": "客飯廳示範空間" },
  width: 420,
  depth: 300,
  height: 260,
  minimumHeight: 220,
  maximumHeight: 350,
  dimensionSource: "team-demo-assumptions",
};

export const EXISTING_FURNITURE: readonly FurnitureItem[] = [
  { id: "old-sofa", name: { en: "Existing sofa", "zh-Hant": "現有梳化" }, kind: "sofa", width: 180, depth: 80, height: 82, position: { x: 200, z: 250 }, orientation: 0, replaceable: true },
  { id: "coffee-table", name: { en: "Coffee table", "zh-Hant": "茶几" }, kind: "coffee-table", width: 100, depth: 55, height: 42, position: { x: 200, z: 150 }, orientation: 0, replaceable: false },
  { id: "tv-console", name: { en: "TV console", "zh-Hant": "電視櫃" }, kind: "tv-console", width: 180, depth: 40, height: 50, position: { x: 200, z: 25 }, orientation: 0, replaceable: false },
  { id: "side-table", name: { en: "Side table", "zh-Hant": "邊几" }, kind: "side-table", width: 40, depth: 40, height: 45, position: { x: 340, z: 250 }, orientation: 0, replaceable: false },
];

export const RESERVED_ZONES: readonly ReservedZone[] = [
  { id: "entrance-zone", name: { en: "Entrance reserved zone", "zh-Hant": "入口預留區" }, position: { x: 45, z: 50 }, width: 90, depth: 100, basis: "demo-preference" },
  { id: "sofa-table-clear-zone", name: { en: "Configured sofa-table clear zone", "zh-Hant": "已設定梳化與茶几預留區" }, position: { x: 200, z: 191.25 }, width: 220, depth: 27.5, basis: "demo-preference" },
];

export const DEFAULT_INPUT: ReplacementInput = {
  width: "220",
  depth: "90",
  height: "85",
  roomHeight: "260",
  orientation: 0,
};

export const SOURCE_URLS = {
  index: "https://www.housingauthority.gov.hk/tc/global-elements/estate-locator/standard-block-typical-floor-plans/index.html",
  pdf: "https://www.housingauthority.gov.hk/common/pdf/global-elements/estate-locator/standard-block-typical-floor-plans/01-Concord1.pdf",
};