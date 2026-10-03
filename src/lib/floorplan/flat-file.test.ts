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
    expect(parse({ format: FLAT_FILE_FORMAT, version: 2, flat: {} })).toEqual({ ok: false, error: "format" });
  });

  it.each([
    ["a diagonal wall", (value: Mutable) => { value.flat.walls[0].end = { x: 630, z: 50 }; }, "flat.walls[0].end"],
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
