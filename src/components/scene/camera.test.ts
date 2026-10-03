import { describe, expect, it } from "vitest";
import { OrthographicCamera, Vector3 } from "three";
import { DEMO_FLAT } from "../../data/flat-preset";
import { HARMONY_FLAT } from "../../data/harmony-preset";
import { cameraDistanceLimits, INITIAL_CAMERA_POSITION, orthographicFitZoom, ROOM_DISTANCE, roomCameraFrame, setOrthographicZoom, WHOLE_FLAT_DISTANCE, WHOLE_FLAT_TARGET } from "./camera";

const unit = (vector: readonly number[]) => vector.map((value) => value / Math.hypot(...vector));

describe("Harmony orthographic aspect framing", () => {
  it.each([[510, 500], [326, 358], [288, 360]])("contains the full envelope at %s x %s", (width, height) => {
    const direction = new Vector3(1, 1.2, 1).normalize();
    const target = new Vector3(0, HARMONY_FLAT.height / 200, 0);
    const camera = new OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, 0.1, 80);
    camera.position.copy(target).add(direction.clone().multiplyScalar(20));
    camera.lookAt(target);
    setOrthographicZoom(camera, orthographicFitZoom(HARMONY_FLAT, { width, height }, direction.toArray()));
    camera.updateMatrixWorld();
    for (const horizontal of [-1, 1]) for (const depth of [-1, 1]) for (const vertical of [0, HARMONY_FLAT.height / 100]) {
      const point = new Vector3(horizontal * HARMONY_FLAT.width / 200, vertical, depth * HARMONY_FLAT.depth / 200).project(camera);
      expect(Math.abs(point.x)).toBeLessThan(1);
      expect(Math.abs(point.y)).toBeLessThan(1);
      expect(Math.abs(point.z)).toBeLessThan(1);
    }
  });
});

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

  it("backs off for a larger flat along the same direction, with scaled distance limits", () => {
    const frame = roomCameraFrame(null, { width: 990, depth: 500 });
    INITIAL_CAMERA_POSITION.forEach((value, axis) => expect(frame.position[axis]).toBeCloseTo(WHOLE_FLAT_TARGET[axis] + (value - WHOLE_FLAT_TARGET[axis]) * 1.5, 10));
    expect([frame.minDistance, frame.maxDistance]).toEqual([WHOLE_FLAT_DISTANCE.min * 1.5, WHOLE_FLAT_DISTANCE.max * 1.5]);
    expect(cameraDistanceLimits(null, { width: 99999, depth: 1 })).toEqual({ min: WHOLE_FLAT_DISTANCE.min * 2, max: WHOLE_FLAT_DISTANCE.max * 2 });
  });

  it("frames the 2.2 m bathroom close up and defaults to the initial viewing direction", () => {
    const bathroom = DEMO_FLAT.rooms.find((room) => room.id === "bathroom")!;
    const frame = roomCameraFrame(bathroom, DEMO_FLAT);
    const offset = frame.position.map((value, index) => value - frame.target[index]);
    expect(Math.hypot(...offset)).toBeCloseTo(3.52, 10);
    unit(offset).forEach((value, index) => expect(value).toBeCloseTo(unit(INITIAL_CAMERA_POSITION.map((entry, axis) => entry - WHOLE_FLAT_TARGET[axis]))[index], 10));
  });
});
