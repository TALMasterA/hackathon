import { EXPECTED_BEDROOMS, type FlatType } from "./trace";

/** Prompts for reading the cropped plan of one Hong Kong public-housing flat. */

export const SYSTEM_PROMPT = "You read architectural floor plans precisely. You answer with one JSON object and nothing else.";

const RESPONSE_SHAPE = '{"flat_label": string or null, "has_diagonal_walls": boolean, "rooms": [{"kind": "living" | "bedroom" | "kitchen" | "bathroom" | "other", "box_2d": [ymin, xmin, ymax, xmax], "open_to": [room index, ...]}], "doors": [{"center": [y, x], "between": [room index, room index]}], "windows": [{"center": [y, x], "room": room index}]}';

function flatTypeHint(flatType: FlatType | null): string {
  if (!flatType) return "";
  if (flatType === "1P") return " Its label is 1P (a flat for one or two persons): usually one open living space with a kitchen and a bathroom.";
  const bedrooms = EXPECTED_BEDROOMS[flatType];
  return ` Its label is ${flatType}, a type meant for ${bedrooms} bedroom${bedrooms === 1 ? "" : "s"}; but describe only the rooms actually drawn, and never call a kitchen or bathroom a bedroom to reach that number.`;
}

export function userPrompt(flatType: FlatType | null): string {
  return [
    `This image is a cropped architectural floor plan of one flat in a Hong Kong public housing block, drawn in black lines on white. The flat to read is inside the dark outlined box; the faded area around it belongs to neighbouring flats, the corridor or the lift lobby and must be ignored.${flatTypeHint(flatType)}`,
    "Walls are drawn as pairs of parallel lines. Windows are groups of thin parallel lines in the outer walls. Doors are gaps in a wall with a quarter-circle swing arc. Plans often have no room names: infer each room's kind from its size, fixtures and position.",
    "Rules:",
    "- Give every enclosed space of this one flat as a rectangle covering its clear floor area, between the inner faces of the walls around it (do not include the walls). Check every part of the outlined box: spaces behind internal walls with their own door are separate rooms.",
    "- Kinds: \"living\" (living/dining: the largest space, entered from the flat's entrance), \"bedroom\" (a large room off the living room, usually with a window), \"kitchen\" and \"bathroom\" (the small rooms, often next to the entrance; a bathroom shows a WC, shower or basin when fixtures are drawn), \"other\" (store or anything else).",
    "- Rooms must not overlap. Split an L-shaped or irregular space into non-overlapping rectangles and list the parts of the same space in each other's \"open_to\".",
    "- Leave out the public corridor, lift lobby, stairs, pipe ducts, refuse rooms, bay-window recesses beyond the main wall line, and everything outside the outlined box.",
    "- Doors: the centre of the gap in the wall line of every door opening of this flat (not the middle of the swing arc), including the entrance from the corridor; \"between\" holds the indexes of the two rooms it connects, -1 for outside the flat.",
    "- Windows: the centre of every window and the index of its room.",
    "- \"flat_label\": the flat-type label printed inside the box (such as 2B), or null.",
    "Coordinates are normalised to this image from 0 to 1000 with the origin at the top left: boxes are [ymin, xmin, ymax, xmax] and points are [y, x].",
    `Answer with exactly this JSON shape: ${RESPONSE_SHAPE}`,
  ].join("\n");
}

const PREVIOUS_ANSWER_CHARS = 4000;

export function repairPrompt(flatType: FlatType | null, previous: string, errors: readonly string[]): string {
  return [
    userPrompt(flatType),
    "",
    "Your previous answer could not be used because:",
    ...errors.map((error) => `- ${error}`),
    "Previous answer:",
    previous.slice(0, PREVIOUS_ANSWER_CHARS),
    "Answer again with the corrected JSON object only.",
  ].join("\n");
}
