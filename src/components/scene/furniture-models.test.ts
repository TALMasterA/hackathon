import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { FurnitureKind } from "../../types/domain";
import { FURNITURE_MODEL_URLS, furnitureModelUrl } from "./furniture-models";
import { FURNITURE_COLORS } from "./palette";

const publicFile = (url: string) => join(process.cwd(), "public", ...url.split("/").filter(Boolean));

describe("furniture model mapping", () => {
  it("maps every furniture kind to a committed model file", () => {
    for (const kind of Object.keys(FURNITURE_COLORS) as FurnitureKind[]) {
      const url = furnitureModelUrl({ kind, width: 100 });
      expect(url, kind).not.toBeNull();
      expect(existsSync(publicFile(url!)), url!).toBe(true);
    }
  });

  it("preloads exactly the mapped files, each of which exists", () => {
    expect(new Set(FURNITURE_MODEL_URLS).size).toBe(FURNITURE_MODEL_URLS.length);
    for (const url of FURNITURE_MODEL_URLS) expect(existsSync(publicFile(url)), url).toBe(true);
    expect(existsSync(join(process.cwd(), "public", "models", "furniture", "License.txt"))).toBe(true);
  });

  it("uses the double bed from 120 cm wide and the single bed below", () => {
    expect(furnitureModelUrl({ kind: "bed", width: 140 })).toBe("/models/furniture/bed-double.glb");
    expect(furnitureModelUrl({ kind: "bed", width: 120 })).toBe("/models/furniture/bed-double.glb");
    expect(furnitureModelUrl({ kind: "bed", width: 119.5 })).toBe("/models/furniture/bed-single.glb");
  });
});
