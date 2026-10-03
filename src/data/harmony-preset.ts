import type { Door, Flat, FlatFurniture, FlatRoom, Position2D, Wall } from "../types/domain";
import { FURNITURE_LIBRARY } from "./flat-preset";

const cm = (x: number, z: number): Position2D => ({ x: x * 100, z: z * 100 });
const outline = [[1.4829, 0], [4.1229, 0], [4.7743, 0.6571], [9.1714, 0.6571], [9.1714, 4.6], [10.1143, 5.5343], [9.1714, 6.3229], [9.1714, 7.6], [0, 7.6], [0, 4.5571], [1.4829, 4.5571]].map(([x, z]) => cm(x, z));

function wall(id: string, start: [number, number], end: [number, number], thickness: number, outer = false): Wall {
  return { id, name: { en: `Approximate ${outer ? "outer wall" : "partition"}: ${id}`, "zh-Hant": `近似${outer ? "外牆" : "間隔牆"}：${id}` }, start: cm(...start), end: cm(...end), thickness: thickness * 100, outer, precision: "approximate-trace" };
}

function area(id: string, en: string, zh: string, left: number, top: number, right: number, bottom: number, polygon?: [number, number][]): FlatRoom {
  return { id, name: { en: `${en} (approx.)`, "zh-Hant": `${zh}（近似）` }, position: cm((left + right) / 2, (top + bottom) / 2), width: (right - left) * 100, depth: (bottom - top) * 100, orientation: 0, outline: polygon?.map(([x, z]) => cm(x, z)) };
}

function door(id: string, wallId: string, hinge: [number, number], width: number, closed: [number, number], open: [number, number], swingRoomId: string, hostZ?: number): Door {
  return { id, name: { en: `Approximate door: ${id}`, "zh-Hant": `近似門位：${id}` }, wallId, position: cm(hinge[0] + closed[0] * width / 2, hostZ ?? hinge[1] + closed[1] * width / 2), hinge: cm(...hinge), width: width * 100, height: 205, closedDirection: { x: closed[0], z: closed[1] }, openDirection: { x: open[0], z: open[1] }, swingRoomId, connects: [id === "entrance" ? "outside" : "central", swingRoomId], precision: "approximate-trace" };
}

export const HARMONY_FLAT: Flat = {
  id: "harmony1-option4-single-flat",
  name: { en: "Harmony 1 Option 4", "zh-Hant": "和諧一型方案四" },
  width: Math.max(...outline.map((point) => point.x)),
  depth: Math.max(...outline.map((point) => point.z)),
  height: 260,
  minimumHeight: 220,
  maximumHeight: 350,
  dimensionSource: "approximate-pdf-trace",
  wallThickness: 20,
  outline,
  source: {
    page: 4,
    pdfUrl: "https://www.housingauthority.gov.hk/common/pdf/global-elements/estate-locator/standard-block-typical-floor-plans/02-Harmony1.pdf",
    referenceUrl: "/plans/harmony1-single-flat-source.svg",
    scaleUnitsPerMetre: 14,
    windowStatus: "partial-trace",
    partitionStatus: "partial-trace",
    envelopeAreaM2: 60.65,
  },
  rooms: [
    area("central", "Central area", "中央區域", 1.6714, 0.6057, 6.5229, 7.3, [[1.6714, 0.6057], [3.8229, 0.6057], [3.8229, 1.2571], [6.5229, 1.2571], [6.5229, 7.3], [2.9486, 7.3], [2.9486, 2.4571], [1.6714, 2.4571]]),
    area("east", "East area", "東側區域", 6.8229, 1.2571, 8.9229, 7.3),
    area("west-upper", "West upper area", "西側上方區域", 1.6714, 2.4571, 2.8714, 3.9742),
    area("west-middle", "West middle area", "西側中央區域", 1.6714, 4.0514, 2.8714, 5.38),
    area("west-lower", "West lower area", "西側下方區域", 1.6714, 5.4571, 2.8714, 7.3),
    area("southwest", "Southwest area", "西南區域", 0.0943, 4.7028, 1.4743, 7.3),
  ],
  walls: [
    wall("left-main", [1.5729, 0.0571], [1.5729, 4.5571], 0.1971, true),
    wall("left-lower-pier", [1.5729, 4.5571], [1.5729, 5.4571], 0.1971),
    wall("southwest-pier", [1.5729, 6.7514], [1.5729, 7.3], 0.1971),
    wall("top-left", [1.6714, 0.50285], [3.8229, 0.50285], 0.2057, true),
    wall("top-stub", [3.92145, 0.4], [3.92145, 1.2571], 0.1971, true),
    wall("top-central", [4.02, 1.15425], [6.5229, 1.15425], 0.2057, true),
    wall("top-east", [6.8229, 1.15425], [8.9229, 1.15425], 0.2057, true),
    wall("service-top", [1.6714, 2.41855], [2.91, 2.41855], 0.0771),
    wall("service-middle", [1.6714, 4.0128], [2.91, 4.0128], 0.0772),
    wall("service-bottom", [1.6714, 5.41855], [2.91, 5.41855], 0.0771),
    wall("service-right", [2.91, 2.41855], [2.91, 7.3], 0.0772),
    wall("left-service", [0.04715, 4.5571], [0.04715, 7.3], 0.0943, true),
    wall("southwest-top", [0.0943, 4.62995], [1.4743, 4.62995], 0.1457, true),
    wall("southwest-divider", [0.0943, 5.40565], [1.4743, 5.40565], 0.1029),
    wall("right-partition-upper", [6.6729, 0.6571], [6.6729, 4.5057], 0.3),
    wall("right-partition-lower", [6.6729, 5.4057], [6.6729, 7.3], 0.3),
    wall("east-upper", [9.04715, 0.6571], [9.04715, 5.05425], 0.2485, true),
    wall("east-lower", [9.04715, 6.1], [9.04715, 7.45], 0.2485, true),
    wall("bay-window-host", [9.1371, 5.0371], [9.6857, 5.5857], 0.08, true),
    wall("south-wall", [0.04715, 7.45], [9.04715, 7.45], 0.3, true),
  ],
  doors: [
    door("entrance", "south-wall", [4.1229, 7.3], 0.9, [-1, 0], [0, -1], "central", 7.45),
    door("west-upper-door", "service-right", [2.91, 3.9314], 0.7029, [0, -1], [-1, 0], "west-upper"),
    door("west-middle-door", "service-right", [2.91, 4.2742], 0.7029, [0, 1], [-1, 0], "west-middle"),
    door("west-lower-door", "service-right", [2.91, 6.9057], 0.8057, [0, -1], [-1, 0], "west-lower"),
    door("southwest-door", "southwest-divider", [1.2686, 5.40565], 0.6, [-1, 0], [0, -1], "southwest"),
  ],
  windows: [
    { id: "top-left-window", name: { en: "Approximate upper-left window", "zh-Hant": "近似左上窗位" }, wallId: "top-left", roomId: "central", position: cm(2.74715, 0.50285), width: 215.15, sillHeight: 90, height: 120 },
    { id: "top-central-window", name: { en: "Approximate upper-central window", "zh-Hant": "近似中央上方窗位" }, wallId: "top-central", roomId: "central", position: cm(5.27145, 1.15425), width: 250.29, sillHeight: 90, height: 120 },
    { id: "top-east-window", name: { en: "Approximate upper-east window", "zh-Hant": "近似東側上方窗位" }, wallId: "top-east", roomId: "east", position: cm(7.8729, 1.15425), width: 210, sillHeight: 90, height: 120 },
    { id: "left-window", name: { en: "Approximate west window", "zh-Hant": "近似西側窗位" }, wallId: "left-main", roomId: "west-middle", position: cm(1.5729, 4.3771), width: 36, sillHeight: 90, height: 120 },
    { id: "bay-window", name: { en: "Approximate oblique window", "zh-Hant": "近似斜向窗位" }, wallId: "bay-window-host", roomId: "east", position: cm(9.4114, 5.3114), width: Math.hypot(0.5486, 0.5486) * 100, sillHeight: 90, height: 120 },
  ],
};

function example(templateId: string, roomId: string, x: number, z: number, orientation = 0): FlatFurniture {
  const template = FURNITURE_LIBRARY.find((entry) => entry.id === templateId);
  if (!template) throw new Error(`Unknown Harmony example template: ${templateId}`);
  return { ...template, id: `harmony-${roomId}-${templateId}`, roomId, position: cm(x, z), orientation, name: { ...template.name } };
}

export const HARMONY_EXAMPLES: readonly FlatFurniture[] = [
  example("sofa", "central", 4.5, 3.2),
  example("coffee-table", "central", 4.5, 2.45),
  example("tv-console", "central", 4.7, 1.7, 180),
  example("side-table", "central", 5.8, 3.2),
  example("dining-table", "central", 4.8, 5.2),
  example("chair", "central", 4.8, 6.05),
  example("double-bed", "east", 7.8, 3.7),
  example("desk", "east", 7.8, 6.6),
  example("fridge", "west-upper", 2.25, 2.85, 180),
  example("vanity", "west-middle", 2.25, 5.16),
  example("chair", "west-lower", 2.25, 5.75),
  example("chair", "southwest", 0.8, 6.5),
];