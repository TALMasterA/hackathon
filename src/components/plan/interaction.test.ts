import { describe, expect, it } from "vitest";
import { DEMO_FLAT } from "../../data/flat-preset";
import { rectanglePolygon } from "../../lib/geometry/oriented";
import { clampView, ensureVisible, fitRoomView, flatBounds, MIN_VIEW_WIDTH_CM, panBy, planHome, ROOM_MARGIN_CM, zoomAt, type PlanBox } from "./interaction";

const home = planHome(DEMO_FLAT);
const bounds = flatBounds(DEMO_FLAT);
const limits = { home, minWidth: MIN_VIEW_WIDTH_CM };

function overlapFraction(view: PlanBox, area: PlanBox): number {
  const x = Math.max(0, Math.min(view.minX + view.width, area.minX + area.width) - Math.max(view.minX, area.minX));
  const z = Math.max(0, Math.min(view.minZ + view.height, area.minZ + area.height) - Math.max(view.minZ, area.minZ));
  return x * z / (view.width * view.height);
}

describe("plan zoom and room focus maths", () => {
  it.each(DEMO_FLAT.rooms.flatMap((room) => [[room.id, 2], [room.id, 0.5]] as const))("fits room %s with its margin at aspect %s", (roomId, aspect) => {
    const room = DEMO_FLAT.rooms.find((entry) => entry.id === roomId)!;
    const view = fitRoomView(room, ROOM_MARGIN_CM, aspect);
    expect(view.width / view.height).toBeCloseTo(aspect, 10);
    expect(view.minX).toBeLessThanOrEqual(room.position.x - room.width / 2 - ROOM_MARGIN_CM + 1e-9);
    expect(view.minZ).toBeLessThanOrEqual(room.position.z - room.depth / 2 - ROOM_MARGIN_CM + 1e-9);
    expect(view.minX + view.width).toBeGreaterThanOrEqual(room.position.x + room.width / 2 + ROOM_MARGIN_CM - 1e-9);
    expect(view.minZ + view.height).toBeGreaterThanOrEqual(room.position.z + room.depth / 2 + ROOM_MARGIN_CM - 1e-9);
    expect(view.minX + view.width / 2).toBeCloseTo(room.position.x, 10);
    expect(view.minZ + view.height / 2).toBeCloseTo(room.position.z, 10);
  });

  it("keeps the zoom anchor at the same screen position", () => {
    const anchor = { x: 540, z: 262.5 };
    const zoomed = zoomAt(home, 2.5, anchor, limits);
    expect(zoomed.width).toBeCloseTo(home.width / 2.5, 10);
    expect(zoomed.width / zoomed.height).toBeCloseTo(home.width / home.height, 10);
    expect((anchor.x - zoomed.minX) / zoomed.width).toBeCloseTo((anchor.x - home.minX) / home.width, 10);
    expect((anchor.z - zoomed.minZ) / zoomed.height).toBeCloseTo((anchor.z - home.minZ) / home.height, 10);
  });

  it("limits zoom between the whole flat and a 120 cm wide view", () => {
    expect(zoomAt(home, 1000, { x: 100, z: 100 }, limits).width).toBe(MIN_VIEW_WIDTH_CM);
    const room = fitRoomView(DEMO_FLAT.rooms[2], ROOM_MARGIN_CM, home.width / home.height);
    expect(zoomAt(room, 0.001, { x: 600, z: 300 }, limits)).toEqual(home);
    expect(zoomAt(home, 0.5, { x: 0, z: 0 }, limits)).toEqual(home);
  });

  it.each([[10000, 0], [-10000, 0], [0, 10000], [0, -10000], [10000, 10000], [-10000, -10000]])("keeps at least a quarter of the view over the flat after panning %s/%s", (dx, dz) => {
    const view = zoomAt(home, 4, { x: 330, z: 320 }, limits);
    const panned = panBy(view, dx, dz, bounds);
    expect(panned.width).toBe(view.width);
    expect(overlapFraction(panned, bounds)).toBeGreaterThanOrEqual(0.25 - 1e-9);
    expect(overlapFraction(clampView({ ...view, minX: -5000, minZ: 5000 }, bounds), bounds)).toBeGreaterThanOrEqual(0.25 - 1e-9);
  });

  it("leaves a visible item alone and centres an off-screen item without zooming", () => {
    const view = fitRoomView(DEMO_FLAT.rooms[0], ROOM_MARGIN_CM, home.width / home.height);
    const sofa = rectanglePolygon({ position: { x: 250, z: 270 }, width: 180, depth: 80, orientation: 0 });
    expect(ensureVisible(view, sofa)).toBe(view);
    const bed = rectanglePolygon({ position: { x: 480, z: 510 }, width: 100, depth: 190, orientation: 0 });
    const centred = ensureVisible(view, bed);
    expect(centred.width).toBe(view.width);
    expect(centred.height).toBe(view.height);
    expect(centred.minX + centred.width / 2).toBeCloseTo(480, 10);
    expect(centred.minZ + centred.height / 2).toBeCloseTo(510, 10);
  });
});
