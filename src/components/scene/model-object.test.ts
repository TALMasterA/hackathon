import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Box3, Group, Mesh, MeshStandardMaterial, Vector3, type Material, type Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DEMO_FLAT, FURNITURE_LIBRARY, SUGGESTED_FURNITURE } from "../../data/flat-preset";
import { scenePositionCm, threeRotation } from "../../lib/geometry/oriented";
import type { FlatFurniture } from "../../types/domain";
import { fitObjectToBox, MODEL_FACING_DEGREES } from "./fit";
import { furnitureModelUrl } from "./furniture-models";
import { objectBounds, prepareModelObject } from "./model-object";
import { COLLISION_COLOR } from "./palette";

async function loadModel(url: string): Promise<Object3D> {
  const file = readFileSync(join(process.cwd(), "public", ...url.split("/").filter(Boolean)));
  const gltf = await new GLTFLoader().parseAsync(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), "");
  return gltf.scene;
}

/** Mirrors RoomScene: item group (position, clockwise angle) > fit group > prepared model. */
function placeInScene(source: Object3D, item: FlatFurniture) {
  const prepared = prepareModelObject(source, { lit: true, colliding: false });
  const fit = fitObjectToBox(objectBounds(source), item, MODEL_FACING_DEGREES);
  const fitGroup = new Group();
  fitGroup.position.set(...fit.position);
  fitGroup.rotation.y = fit.rotationY;
  fitGroup.scale.set(...fit.scale);
  fitGroup.add(prepared.object);
  const itemGroup = new Group();
  itemGroup.position.set(...scenePositionCm(item.position, DEMO_FLAT));
  itemGroup.rotation.y = threeRotation(item.orientation);
  itemGroup.add(fitGroup);
  itemGroup.updateMatrixWorld(true);
  return { itemGroup, model: prepared.object };
}

/** A point in the model's own frame, returned in plan centimetres (x, z) plus height in cm. */
function planPoint(model: Object3D, point: [number, number, number]) {
  const world = model.localToWorld(new Vector3(...point));
  return { x: world.x * 100 + DEMO_FLAT.width / 2, y: world.y * 100, z: world.z * 100 + DEMO_FLAT.depth / 2 };
}

describe("Kenney furniture models in the scene", () => {
  it("stretch every library template's model to exactly its checked box, resting on the floor", async () => {
    for (const template of FURNITURE_LIBRARY) {
      const item: FlatFurniture = { ...template, roomId: "living", position: { x: 200, z: 150 }, orientation: 0 };
      const { itemGroup } = placeInScene(await loadModel(furnitureModelUrl(item)!), item);
      const box = new Box3().setFromObject(itemGroup, true);
      const size = box.getSize(new Vector3());
      expect(size.x * 100, template.id).toBeCloseTo(template.width, 6);
      expect(size.y * 100, template.id).toBeCloseTo(template.height, 6);
      expect(size.z * 100, template.id).toBeCloseTo(template.depth, 6);
      expect(box.min.y, template.id).toBeCloseTo(0, 9);
      expect((box.min.x + box.max.x) * 50 + DEMO_FLAT.width / 2, template.id).toBeCloseTo(200, 6);
      expect((box.min.z + box.max.z) * 50 + DEMO_FLAT.depth / 2, template.id).toBeCloseTo(150, 6);
    }
  });

  it("puts the sofa's backrest away from the TV console and the console's front toward the sofa", async () => {
    const sofa = SUGGESTED_FURNITURE.find((entry) => entry.id === "living-sofa")!;
    const tv = SUGGESTED_FURNITURE.find((entry) => entry.id === "living-tv")!;
    const sofaSource = await loadModel(furnitureModelUrl(sofa)!);
    const sofaBounds = objectBounds(sofaSource);
    const placedSofa = placeInScene(sofaSource, sofa);
    // The Kenney sofa's backrest top is its tallest geometry, on the model's -Z side.
    const backrest = planPoint(placedSofa.model, [(sofaBounds.min[0] + sofaBounds.max[0]) / 2, sofaBounds.max[1], sofaBounds.min[2]]);
    expect(backrest.z).toBeCloseTo(sofa.position.z + sofa.depth / 2, 6);
    expect(backrest.y).toBeCloseTo(sofa.height, 6);

    const tvSource = await loadModel(furnitureModelUrl(tv)!);
    const tvBounds = objectBounds(tvSource);
    const placedTv = placeInScene(tvSource, tv);
    // glTF models face +Z, so the console's front face is its model-space max Z.
    const tvFront = planPoint(placedTv.model, [(tvBounds.min[0] + tvBounds.max[0]) / 2, 0, tvBounds.max[2]]);
    expect(tvFront.z).toBeCloseTo(tv.position.z + tv.depth / 2, 6);
    expect(Math.abs(tvFront.z - sofa.position.z)).toBeLessThan(Math.abs(tv.position.z - tv.depth / 2 - sofa.position.z));
  });

  it("converts the kit's unlit materials to shared lit ones and tints colliding clones without touching the cache", async () => {
    const source = await loadModel(furnitureModelUrl({ kind: "chair", width: 42 })!);
    const original: Material[] = [];
    source.traverse((child) => { if (child instanceof Mesh) original.push(child.material as Material); });
    const first = prepareModelObject(source, { lit: true, colliding: false });
    const second = prepareModelObject(source, { lit: true, colliding: false });
    const materials = (object: Object3D) => { const found: Material[] = []; object.traverse((child) => { if (child instanceof Mesh) found.push(child.material as Material); }); return found; };
    expect(materials(first.object).every((material) => material instanceof MeshStandardMaterial)).toBe(true);
    expect(materials(first.object)).toEqual(materials(second.object));
    expect(first.owned).toEqual([]);

    const tinted = prepareModelObject(source, { lit: true, colliding: true });
    expect(tinted.owned).toHaveLength(original.length);
    for (const material of materials(tinted.object) as MeshStandardMaterial[]) {
      expect(`#${material.color.getHexString()}`).toBe(COLLISION_COLOR);
      expect(material.transparent).toBe(true);
      expect(material.depthWrite).toBe(false);
    }
    expect(materials(source)).toEqual(original);
    expect(materials(first.object).every((material) => !tinted.owned.includes(material))).toBe(true);
  });

  it("rejects an object with no geometry so the box fallback is drawn", () => {
    expect(() => objectBounds(new Group())).toThrow();
  });
});
