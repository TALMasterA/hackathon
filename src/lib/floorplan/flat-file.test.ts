import { describe, expect, it } from "vitest";
import { DEMO_FLAT } from "../../data/flat-preset";
import { FLAT_FILE_FORMAT, FLAT_FILE_VERSION, flatFileName, parseFlatFile, serializeFlat } from "./flat-file";
import { L_FLAT } from "./test-flats";

type Mutable = Record<string, unknown> & { flat: Record<string, unknown> & { rooms: Record<string, unknown>[]; walls: Record<string, unknown>[]; doors: Record<string, unknown>[]; windows: Record<string, unknown>[] } };

/** A fresh, editable copy of a valid file for one rule to break. */
const file = (): Mutable => JSON.parse(serializeFlat(L_FLAT));
const parse = (value: unknown) => parseFlatFile(JSON.stringify(value));

describe("flat files", () => {
  it("round-trips the demo flat and a traced flat exactly", () => {
    expect(parseFlatFile(serializeFlat(DEMO_FLAT))).toEqual({ ok: true, flat: DEMO_FLAT });
    expect(parseFlatFile(serializeFlat(L_FLAT))).toEqual({ ok: true, flat: L_FLAT });
  });

  it("names the download after the flat", () => {
    expect(flatFileName(L_FLAT)).toBe("l-shaped-test-flat.fitin-flat.json");
  });

  it("drops fields it does not know", () => {
    const value = file();
    value.flat.picture = "data:image/png;base64,AAAA";
    value.flat.rooms[0].secret = true;
    const result = parse(value);
    expect(result.ok && "picture" in result.flat).toBe(false);
    expect(result.ok && "secret" in result.flat.rooms[0]).toBe(false);
  });

  it("rejects files that are too large, not JSON, or not FitIn flats", () => {
    expect(parseFlatFile(" ".repeat(1_000_001))).toEqual({ ok: false, error: "too-large" });
    expect(parseFlatFile("{ nope")).toEqual({ ok: false, error: "not-json" });
    expect(parse({ format: "other", version: FLAT_FILE_VERSION, flat: {} })).toEqual({ ok: false, error: "format" });
    expect(parse({ format: FLAT_FILE_FORMAT, version: 3, flat: {} })).toEqual({ ok: false, error: "format" });
  });

  it("writes version 2 and still opens version 1 files", () => {
    expect(file().version).toBe(2);
    expect(parse({ ...file(), version: 1 })).toEqual({ ok: true, flat: L_FLAT });
  });

  it("keeps a room outline, an angled wall and a door's hinge", () => {
    const value = file();
    // The kitchen as an L: its back-right corner cut out.
    value.flat.rooms[2].outline = [{ x: 420, z: 10 }, { x: 620, z: 10 }, { x: 620, z: 200 }, { x: 520, z: 200 }, { x: 520, z: 310 }, { x: 420, z: 310 }];
    value.flat.walls.push({ id: "angled", name: { en: "Angled", "zh-Hant": "斜牆" }, start: { x: 100, z: 400 }, end: { x: 200, z: 500 }, thickness: 10, outer: false });
    Object.assign(value.flat.doors[0], { hinge: { x: 155, z: 10 }, closedDirection: { x: 1, z: 0 }, openDirection: { x: 0, z: 1 } });
    const result = parse(value);
    expect(result.ok).toBe(true);
    const flat = result.ok ? result.flat : null;
    expect(flat?.rooms[2].outline).toHaveLength(6);
    expect(flat?.walls.at(-1)).toMatchObject({ id: "angled", end: { x: 200, z: 500 } });
    expect(flat?.doors[0]).toMatchObject({ hinge: { x: 155, z: 10 }, closedDirection: { x: 1, z: 0 }, openDirection: { x: 0, z: 1 } });
  });

  it.each([
    ["a wall of no length", (value: Mutable) => { value.flat.walls[3].end = value.flat.walls[3].start; }, "flat.walls[3].end"],
    ["a room outline that does not fill its rectangle", (value: Mutable) => { value.flat.rooms[0].outline = [{ x: 10, z: 10 }, { x: 300, z: 10 }, { x: 300, z: 310 }, { x: 10, z: 310 }]; }, "flat.rooms[0].outline"],
    ["a room outline that crosses itself", (value: Mutable) => { value.flat.rooms[0].outline = [{ x: 10, z: 10 }, { x: 410, z: 310 }, { x: 410, z: 10 }, { x: 10, z: 310 }]; }, "flat.rooms[0].outline"],
    ["a hinge away from its wall", (value: Mutable) => { Object.assign(value.flat.doors[0], { hinge: { x: 155, z: 60 }, closedDirection: { x: 1, z: 0 }, openDirection: { x: 0, z: 1 } }); }, "flat.doors[0].hinge"],
    ["a door leaf that closes across its wall", (value: Mutable) => { Object.assign(value.flat.doors[0], { hinge: { x: 155, z: 10 }, closedDirection: { x: 0, z: 1 }, openDirection: { x: 0, z: 1 } }); }, "flat.doors[0].closedDirection"],
    ["a flat outline that crosses itself", (value: Mutable) => { value.flat.outline = [{ x: 0, z: 0 }, { x: 630, z: 630 }, { x: 630, z: 0 }, { x: 0, z: 630 }]; }, "flat.outline"],
    ["a wall running backwards", (value: Mutable) => { value.flat.walls[0].start = { x: 630, z: 5 }; value.flat.walls[0].end = { x: 0, z: 5 }; }, "flat.walls[0].end"],
    ["a door on a missing wall", (value: Mutable) => { value.flat.doors[0].wallId = "nowhere"; }, "flat.doors[0].wallId"],
    ["a door off its wall line", (value: Mutable) => { value.flat.doors[0].position = { x: 200, z: 40 }; }, "flat.doors[0].position"],
    ["a door overhanging its wall", (value: Mutable) => { value.flat.doors[1].position = { x: 400, z: 315 }; }, "flat.doors[1].width"],
    ["a door to an unknown room", (value: Mutable) => { value.flat.doors[1].connects = ["living", "attic"]; }, "flat.doors[1].connects[1]"],
    ["a window in a missing room", (value: Mutable) => { value.flat.windows[0].roomId = "attic"; }, "flat.windows[0].roomId"],
    ["a room outside the flat", (value: Mutable) => { value.flat.rooms[2].position = { x: 600, z: 160 }; }, "flat.rooms[2].position"],
    ["a duplicate room ID", (value: Mutable) => { value.flat.rooms[1].id = "living"; }, "flat.rooms[1].id"],
    ["an unknown room kind", (value: Mutable) => { value.flat.rooms[0].kind = "garage"; }, "flat.rooms[0].kind"],
    ["a rotated room", (value: Mutable) => { value.flat.rooms[0].orientation = 90; }, "flat.rooms[0].orientation"],
    ["a 31 m flat", (value: Mutable) => { value.flat.width = 3100; }, "flat.width"],
    ["a ceiling outside its own range", (value: Mutable) => { value.flat.height = 400; }, "flat.height"],
    ["a non-finite number", (value: Mutable) => { value.flat.wallThickness = "10"; }, "flat.wallThickness"],
    ["a room called outside", (value: Mutable) => { value.flat.rooms[0].id = "outside"; }, "flat.rooms[0].id"],
    ["a broken trace record", (value: Mutable) => { (value.flat.trace as Record<string, unknown>).readBy = "magic"; }, "flat.trace.readBy"],
  ])("rejects %s", (_, breakIt, detail) => {
    const value = file();
    breakIt(value);
    expect(parse(value)).toEqual({ ok: false, error: "invalid", detail });
  });
});
