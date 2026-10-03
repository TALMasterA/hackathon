import { OrthographicCamera, Vector3 } from "three";
import { scenePositionCm } from "../../lib/geometry/oriented";
import type { FlatRoom } from "../../types/domain";
import { METRES_PER_CM } from "./palette";

export type Vector3Tuple = [number, number, number];

export const INITIAL_CAMERA_POSITION: Vector3Tuple = [8.5, 10, -11.5];
export const WHOLE_FLAT_TARGET: Vector3Tuple = [0, 0.6, 0];
export const WHOLE_FLAT_DISTANCE = { min: 6, max: 22 };
export const ROOM_DISTANCE = { min: 2, max: 10 };
export const ROOM_TARGET_HEIGHT = 0.6;
const ROOM_DISTANCE_FACTOR = 1.6;

export interface CameraFrame {
  target: Vector3Tuple;
  position: Vector3Tuple;
  minDistance: number;
  maxDistance: number;
}

const DEFAULT_DIRECTION: Vector3Tuple = [INITIAL_CAMERA_POSITION[0] - WHOLE_FLAT_TARGET[0], INITIAL_CAMERA_POSITION[1] - WHOLE_FLAT_TARGET[1], INITIAL_CAMERA_POSITION[2] - WHOLE_FLAT_TARGET[2]];

export function cameraDistanceLimits(room: FlatRoom | null) {
  return room ? ROOM_DISTANCE : WHOLE_FLAT_DISTANCE;
}

/** Frames one room (or the whole flat for null), keeping the viewing direction the camera already has. */
export function roomCameraFrame(room: FlatRoom | null, envelope: { width: number; depth: number }, direction: readonly number[] = DEFAULT_DIRECTION): CameraFrame {
  if (!room) return { target: [...WHOLE_FLAT_TARGET], position: [...INITIAL_CAMERA_POSITION], minDistance: WHOLE_FLAT_DISTANCE.min, maxDistance: WHOLE_FLAT_DISTANCE.max };
  const [x, , z] = scenePositionCm(room.position, envelope);
  const distance = Math.min(ROOM_DISTANCE.max, Math.max(ROOM_DISTANCE.min, Math.max(room.width, room.depth) * METRES_PER_CM * ROOM_DISTANCE_FACTOR));
  const length = Math.hypot(direction[0], direction[1], direction[2]);
  const unit = length > 0 ? direction.map((value) => value / length) : DEFAULT_DIRECTION.map((value) => value / Math.hypot(...DEFAULT_DIRECTION));
  return { target: [x, ROOM_TARGET_HEIGHT, z], position: [x + unit[0] * distance, ROOM_TARGET_HEIGHT + unit[1] * distance, z + unit[2] * distance], minDistance: ROOM_DISTANCE.min, maxDistance: ROOM_DISTANCE.max };
}

export function orthographicFitZoom(envelope: { width: number; depth: number; height: number }, viewport: { width: number; height: number }, direction: readonly number[]): number {
  const forward = new Vector3(...direction).normalize();
  const right = new Vector3(forward.z, 0, -forward.x).normalize();
  const up = new Vector3().crossVectors(forward, right).normalize();
  const span = (axis: Vector3) => (Math.abs(axis.x) * envelope.width + Math.abs(axis.z) * envelope.depth + Math.abs(axis.y) * envelope.height) / 100;
  return Math.min(viewport.width / (span(right) * 1.18), viewport.height / (span(up) * 1.18));
}

export function setOrthographicZoom(camera: OrthographicCamera, zoom: number) {
  camera.zoom = zoom;
  camera.updateProjectionMatrix();
}
