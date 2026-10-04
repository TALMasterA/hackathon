import { formatCm } from "../../i18n/dictionary";
import { assistantText, isAssistantKey } from "../../i18n/assistant";
import type { Flat, FlatFurniture, Language } from "../../types/domain";
import type { Message, MessageParam, Preference, ZoneRef } from "./types";

/** Names for ids in messages, from the flat and the furniture the session knows. */
export interface Names {
  item: (id: string) => string;
  room: (id: string) => string;
  door: (id: string) => string;
}

export function namesFor(flat: Flat, furniture: readonly FlatFurniture[], language: Language): Names {
  return {
    item: (id) => furniture.find((item) => item.id === id)?.name[language] ?? id,
    room: (id) => flat.rooms.find((room) => room.id === id)?.name[language] ?? id,
    door: (id) => flat.doors.find((door) => door.id === id)?.name[language] ?? id,
  };
}

export function zoneLabel(zone: ZoneRef, language: Language, names: Names): string {
  return zone.kind === "door"
    ? assistantText(language, "zone.door", { door: names.door(zone.doorId), depth: zone.depth })
    : assistantText(language, "zone.itemFront", { item: names.item(zone.itemId), depth: zone.depth });
}

function formatParam(value: MessageParam, language: Language, names: Names): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return formatCm(value, language);
  if ("item" in value) return names.item(value.item);
  if ("room" in value) return names.room(value.room);
  if ("zone" in value) return zoneLabel(value.zone, language, names);
  if ("cm" in value) return formatCm(Math.round(value.cm * 10) / 10, language);
  if ("m2" in value) return value.m2.toFixed(2);
  return formatCm(Math.round(value.deg), language);
}

/** A message in the chosen language; a key the dictionary lacks is shown as-is so it cannot fail silently. */
export function formatMessage(message: Message, language: Language, names: Names): string {
  if (!isAssistantKey(message.key)) return message.key;
  const parameters = Object.fromEntries(Object.entries(message.params ?? {}).map(([name, value]) => [name, formatParam(value, language, names)]));
  return assistantText(language, message.key, parameters);
}

export function preferenceMessage(preference: Preference): Message {
  switch (preference.type) {
    case "keep-in-place":
      return { key: preference.pose ? "pref.keepPose" : preference.allowRotation ? "pref.keepTurn" : "pref.keep", params: { item: { item: preference.itemId } } };
    case "minimise-changes":
      return preference.maxChangedItems !== undefined ? { key: "pref.changeLimit", params: { count: preference.maxChangedItems } } : { key: "pref.changeLittle" };
    case "open-zone":
      return { key: "pref.zone", params: { zone: { zone: preference.zone } } };
    case "pair":
      return { key: preference.direction === "closer" ? "pref.closer" : "pref.farther", params: { first: { item: preference.firstId }, second: { item: preference.secondId } } };
    case "avoid-position":
      return { key: "pref.avoidPosition", params: { item: { item: preference.itemId } } };
    case "avoid-orientation":
      return { key: "pref.avoidOrientation", params: { item: { item: preference.itemId }, angle: { deg: preference.angle } } };
  }
}
