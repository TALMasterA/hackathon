import type { LocalizedName, RoomKind } from "../../types/domain";

export const ROOM_KINDS: readonly RoomKind[] = ["living", "bedroom", "kitchen", "bathroom", "other"];

export const ROOM_KIND_NAMES: Record<RoomKind, LocalizedName> = {
  living: { en: "Living / dining room", "zh-Hant": "客飯廳" },
  bedroom: { en: "Bedroom", "zh-Hant": "睡房" },
  kitchen: { en: "Kitchen", "zh-Hant": "廚房" },
  bathroom: { en: "Bathroom", "zh-Hant": "浴室" },
  other: { en: "Other space", "zh-Hant": "其他空間" },
};

/**
 * Stable IDs and bilingual names for traced rooms, numbered only when a kind repeats
 * ("Bedroom 1", "Bedroom 2" / "睡房 1", "睡房 2"). Rooms are numbered in the order given.
 */
export function roomIdentities(rooms: readonly { kind: RoomKind }[]): { id: string; name: LocalizedName }[] {
  const totals = new Map<RoomKind, number>();
  for (const room of rooms) totals.set(room.kind, (totals.get(room.kind) ?? 0) + 1);
  const seen = new Map<RoomKind, number>();
  return rooms.map((room) => {
    const number = (seen.get(room.kind) ?? 0) + 1;
    seen.set(room.kind, number);
    const base = ROOM_KIND_NAMES[room.kind];
    if (totals.get(room.kind) === 1) return { id: room.kind, name: { ...base } };
    return { id: `${room.kind}-${number}`, name: { en: `${base.en} ${number}`, "zh-Hant": `${base["zh-Hant"]} ${number}` } };
  });
}

export function doorName(room: LocalizedName | null): LocalizedName {
  return room ? { en: `${room.en} door`, "zh-Hant": `${room["zh-Hant"]}門` } : { en: "Entrance door", "zh-Hant": "大門" };
}

export function windowName(room: LocalizedName, number: number | null): LocalizedName {
  const suffix = number ? ` ${number}` : "";
  return { en: `${room.en} window${suffix}`, "zh-Hant": `${room["zh-Hant"]}窗${suffix}` };
}

export function wallName(outer: boolean, number: number): LocalizedName {
  return outer ? { en: `Outer wall ${number}`, "zh-Hant": `外牆 ${number}` } : { en: `Partition wall ${number}`, "zh-Hant": `間隔牆 ${number}` };
}
