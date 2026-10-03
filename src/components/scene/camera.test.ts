import { describe, expect, it } from "vitest";
import { DEMO_FLAT } from "../../data/flat-preset";
import { INITIAL_CAMERA_POSITION, ROOM_DISTANCE, roomCameraFrame, WHOLE_FLAT_DISTANCE, WHOLE_FLAT_TARGET } from "./camera";

const unit = (vector: readonly number[]) => vector.map((value) => value / Math.hypot(...vector));

describe("3D room-focus camera framing", () => {
  it("returns the original whole-flat framing for no focus", () => {
    expect(roomCameraFrame(null, DEMO_FLAT, [1, 2, 3])).toEqual({ target: WHOLE_FLAT_TARGET, position: INITIAL_CAMERA_POSITION, minDistance: WHOLE_FLAT_DISTANCE.min, maxDistance: WHOLE_FLAT_DISTANCE.max });
  });

  it.each(DEMO_FLAT.rooms.map((room) => [room.id]))("frames room %s at its centre within the focused distance limits", (roomId) => {
    const room = DEMO_FLAT.rooms.find((entry) => entry.id === roomId)!;
    const direction = [4, 6, -9];
    const frame = roomCameraFrame(room, DEMO_FLAT, direction);
    expect(frame.target[0]).toBeCloseTo((room.position.x - DEMO_FLAT.width / 2) / 100, 10);
    expect(frame.target[1]).toBe(0.6);
    expect(frame.target[2]).toBeCloseTo((room.position.z - DEMO_FLAT.depth / 2) / 100, 10);
    const offset = frame.position.map((value, index) => value - frame.target[index]);
    const distance = Math.hypot(...offset);
    expect(distance).toBeGreaterThanOrEqual(ROOM_DISTANCE.min);
    expect(distance).toBeLessThanOrEqual(ROOM_DISTANCE.max);
    expect(distance).toBeCloseTo(Math.max(room.width, room.depth) / 100 * 1.6, 10);
    unit(offset).forEach((value, index) => expect(value).toBeCloseTo(unit(direction)[index], 10));
    expect([frame.minDistance, frame.maxDistance]).toEqual([ROOM_DISTANCE.min, ROOM_DISTANCE.max]);
  });

  it("frames the 2.2 m bathroom close up and defaults to the initial viewing direction", () => {
    const bathroom = DEMO_FLAT.rooms.find((room) => room.id === "bathroom")!;
    const frame = roomCameraFrame(bathroom, DEMO_FLAT);
    const offset = frame.position.map((value, index) => value - frame.target[index]);
    expect(Math.hypot(...offset)).toBeCloseTo(3.52, 10);
    unit(offset).forEach((value, index) => expect(value).toBeCloseTo(unit(INITIAL_CAMERA_POSITION.map((entry, axis) => entry - WHOLE_FLAT_TARGET[axis]))[index], 10));
  });
});
