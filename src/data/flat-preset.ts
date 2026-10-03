import type { Flat, FlatFurniture, FlatRoom, FurnitureTemplate } from "../types/domain";

function room(id: string, en: string, zh: string, x: number, z: number, width: number, depth: number): FlatRoom {
  return { id, name: { en, "zh-Hant": zh }, position: { x, z }, width, depth, orientation: 0 };
}

export const DEMO_FLAT: Flat = {
  id: "concord1-option1-2b-whole-flat-demo",
  name: { en: "Whole-flat demo", "zh-Hant": "全屋示範" },
  width: 660,
  depth: 640,
  height: 260,
  minimumHeight: 220,
  maximumHeight: 350,
  dimensionSource: "team-demo-assumptions",
  wallThickness: 10,
  rooms: [
    room("living", "Living / dining room", "客飯廳", 215, 170, 410, 320),
    room("kitchen", "Kitchen", "廚房", 540, 97.5, 220, 175),
    room("bathroom", "Bathroom", "浴室", 540, 262.5, 220, 135),
    room("master", "Master bedroom", "主人房", 167.5, 485, 315, 290),
    room("second", "Second bedroom", "睡房", 492.5, 485, 315, 290),
  ],
  walls: [
    { id: "front-wall", name: { en: "Front outer wall", "zh-Hant": "前方外牆" }, start: { x: 0, z: 5 }, end: { x: 660, z: 5 }, thickness: 10, outer: true },
    { id: "back-wall", name: { en: "Back outer wall", "zh-Hant": "後方外牆" }, start: { x: 0, z: 635 }, end: { x: 660, z: 635 }, thickness: 10, outer: true },
    { id: "left-wall", name: { en: "Left outer wall", "zh-Hant": "左側外牆" }, start: { x: 5, z: 0 }, end: { x: 5, z: 640 }, thickness: 10, outer: true },
    { id: "right-wall", name: { en: "Right outer wall", "zh-Hant": "右側外牆" }, start: { x: 655, z: 0 }, end: { x: 655, z: 640 }, thickness: 10, outer: true },
    { id: "service-wall", name: { en: "Living / service-room wall", "zh-Hant": "客飯廳與廚浴間隔牆" }, start: { x: 425, z: 10 }, end: { x: 425, z: 330 }, thickness: 10, outer: false },
    { id: "bathroom-wall", name: { en: "Kitchen / bathroom wall", "zh-Hant": "廚房與浴室間隔牆" }, start: { x: 430, z: 190 }, end: { x: 650, z: 190 }, thickness: 10, outer: false },
    { id: "bedroom-front-wall", name: { en: "Bedroom front wall", "zh-Hant": "睡房前方間隔牆" }, start: { x: 10, z: 335 }, end: { x: 650, z: 335 }, thickness: 10, outer: false },
    { id: "bedroom-divider", name: { en: "Bedroom dividing wall", "zh-Hant": "兩間睡房間隔牆" }, start: { x: 330, z: 340 }, end: { x: 330, z: 630 }, thickness: 10, outer: false },
  ],
  doors: [
    { id: "front-door", name: { en: "Entrance door", "zh-Hant": "大門" }, wallId: "front-wall", position: { x: 365, z: 5 }, width: 80, swingRoomId: "living", connects: ["outside", "living"] },
    { id: "kitchen-door", name: { en: "Kitchen door", "zh-Hant": "廚房門" }, wallId: "service-wall", position: { x: 425, z: 110 }, width: 80, swingRoomId: "kitchen", connects: ["living", "kitchen"] },
    { id: "bathroom-door", name: { en: "Bathroom door", "zh-Hant": "浴室門" }, wallId: "service-wall", position: { x: 425, z: 260 }, width: 75, swingRoomId: "bathroom", connects: ["living", "bathroom"] },
    { id: "master-door", name: { en: "Master-bedroom door", "zh-Hant": "主人房門" }, wallId: "bedroom-front-wall", position: { x: 245, z: 335 }, width: 80, swingRoomId: "master", connects: ["living", "master"] },
    { id: "second-door", name: { en: "Second-bedroom door", "zh-Hant": "睡房門" }, wallId: "bedroom-front-wall", position: { x: 377.5, z: 335 }, width: 75, swingRoomId: "second", connects: ["living", "second"] },
  ],
  windows: [
    { id: "living-front-window", name: { en: "Living front window", "zh-Hant": "客飯廳前窗" }, wallId: "front-wall", roomId: "living", position: { x: 210, z: 5 }, width: 150, sillHeight: 100, height: 90 },
    { id: "living-side-window", name: { en: "Living side window", "zh-Hant": "客飯廳側窗" }, wallId: "left-wall", roomId: "living", position: { x: 5, z: 150 }, width: 140, sillHeight: 100, height: 90 },
    { id: "kitchen-window", name: { en: "Kitchen window", "zh-Hant": "廚房窗" }, wallId: "right-wall", roomId: "kitchen", position: { x: 655, z: 105 }, width: 90, sillHeight: 110, height: 85 },
    { id: "bathroom-window", name: { en: "Bathroom window", "zh-Hant": "浴室窗" }, wallId: "right-wall", roomId: "bathroom", position: { x: 655, z: 260 }, width: 70, sillHeight: 140, height: 60 },
    { id: "master-window", name: { en: "Master-bedroom window", "zh-Hant": "主人房窗" }, wallId: "back-wall", roomId: "master", position: { x: 165, z: 635 }, width: 150, sillHeight: 100, height: 90 },
    { id: "second-window", name: { en: "Second-bedroom window", "zh-Hant": "睡房窗" }, wallId: "back-wall", roomId: "second", position: { x: 480, z: 635 }, width: 150, sillHeight: 100, height: 90 },
  ],
};

export const FURNITURE_LIBRARY: readonly FurnitureTemplate[] = [
  { id: "sofa", name: { en: "Sofa", "zh-Hant": "梳化" }, kind: "sofa", width: 180, depth: 80, height: 82 },
  { id: "coffee-table", name: { en: "Coffee table", "zh-Hant": "茶几" }, kind: "coffee-table", width: 100, depth: 55, height: 42 },
  { id: "tv-console", name: { en: "TV console", "zh-Hant": "電視櫃" }, kind: "tv-console", width: 160, depth: 40, height: 50 },
  { id: "side-table", name: { en: "Side table", "zh-Hant": "邊几" }, kind: "side-table", width: 40, depth: 40, height: 45 },
  { id: "dining-table", name: { en: "Dining table", "zh-Hant": "餐枱" }, kind: "dining-table", width: 85, depth: 75, height: 75 },
  { id: "chair", name: { en: "Chair", "zh-Hant": "椅子" }, kind: "chair", width: 42, depth: 42, height: 82 },
  { id: "double-bed", name: { en: "Double bed", "zh-Hant": "雙人床" }, kind: "bed", width: 140, depth: 190, height: 55 },
  { id: "single-bed", name: { en: "Single bed", "zh-Hant": "單人床" }, kind: "bed", width: 100, depth: 190, height: 55 },
  { id: "wardrobe", name: { en: "Wardrobe", "zh-Hant": "衣櫃" }, kind: "wardrobe", width: 90, depth: 55, height: 210 },
  { id: "desk", name: { en: "Desk", "zh-Hant": "書枱" }, kind: "desk", width: 110, depth: 50, height: 75 },
  { id: "kitchen-counter", name: { en: "Kitchen counter", "zh-Hant": "廚櫃" }, kind: "kitchen-counter", width: 100, depth: 60, height: 90 },
  { id: "fridge", name: { en: "Fridge", "zh-Hant": "雪櫃" }, kind: "fridge", width: 70, depth: 65, height: 180 },
  { id: "toilet", name: { en: "Toilet", "zh-Hant": "座廁" }, kind: "toilet", width: 55, depth: 65, height: 80 },
  { id: "vanity", name: { en: "Bathroom vanity", "zh-Hant": "浴室洗手盆櫃" }, kind: "vanity", width: 80, depth: 35, height: 85 },
];

function item(id: string, templateId: string, roomId: string, x: number, z: number, names?: [string, string], dimensions?: Partial<Pick<FlatFurniture, "width" | "depth" | "height">>): FlatFurniture {
  const template = FURNITURE_LIBRARY.find((entry) => entry.id === templateId);
  if (!template) throw new Error(`Unknown furniture template: ${templateId}`);
  return { ...template, ...dimensions, id, roomId, position: { x, z }, orientation: 0, name: names ? { en: names[0], "zh-Hant": names[1] } : template.name };
}

export const FLAT_FURNITURE: readonly FlatFurniture[] = [
  item("living-sofa", "sofa", "living", 250, 270),
  item("living-coffee-table", "coffee-table", "living", 250, 170),
  item("living-tv", "tv-console", "living", 235, 40),
  item("living-side-table", "side-table", "living", 370, 270),
  item("dining-table", "dining-table", "living", 115, 135),
  item("dining-chair-north", "chair", "living", 115, 65, ["Dining chair 1", "餐椅 1"]),
  item("dining-chair-south", "chair", "living", 115, 205, ["Dining chair 2", "餐椅 2"]),
  item("dining-chair-west", "chair", "living", 45, 135, ["Dining chair 3", "餐椅 3"]),
  item("kitchen-fridge", "fridge", "kitchen", 610, 60),
  item("kitchen-counter", "kitchen-counter", "kitchen", 600, 140),
  item("bathroom-toilet", "toilet", "bathroom", 610, 275),
  item("bathroom-vanity", "vanity", "bathroom", 605, 215),
  item("master-bed", "double-bed", "master", 110, 490, ["Master bed", "主人房床"]),
  item("master-wardrobe", "wardrobe", "master", 270, 570, ["Master wardrobe", "主人房衣櫃"]),
  item("master-desk", "desk", "master", 255, 460, ["Master desk", "主人房書枱"], { width: 100 }),
  item("master-side-table", "side-table", "master", 200, 560, ["Bedside table", "床頭櫃"]),
  item("second-bed", "single-bed", "second", 480, 510, ["Second-bedroom bed", "睡房床"]),
  item("second-wardrobe", "wardrobe", "second", 590, 575, ["Second-bedroom wardrobe", "睡房衣櫃"]),
  item("second-desk", "desk", "second", 585, 375, ["Second-bedroom desk", "睡房書枱"]),
  item("second-chair", "chair", "second", 585, 450, ["Desk chair", "書枱椅"]),
];