import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BufferAttribute, BufferGeometry, Mesh, MeshBasicMaterial, MeshStandardMaterial, Texture, type Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { matteLookMaterials } from "../../components/scene/model-object";
import { JOB_TIMEOUT_MS, LookError, parseGlb, runModelJob, type JobPhase } from "./model3d-client";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/**
 * A fake /api/model3d that streams the given NDJSON lines in small chunks (splitting lines on purpose).
 * With `hold`, the stream stays open like a job still running, until the request is aborted.
 */
function server(lines: unknown[], { hold = false } = {}) {
  return vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const bytes = new TextEncoder().encode(lines.map((line) => `${JSON.stringify(line)}\n`).join(""));
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let index = 0; index < bytes.length; index += 7) controller.enqueue(bytes.slice(index, index + 7));
        if (!hold) controller.close();
        init?.signal?.addEventListener("abort", () => {
          try {
            controller.error(init.signal?.reason);
          } catch {
            // Already closed.
          }
        });
      },
    });
    return new Response(body, { headers: { "Content-Type": "application/x-ndjson" } });
  });
}

const failure = (promise: Promise<unknown>) => promise.then(() => null, (error: unknown) => (error instanceof LookError ? error.code : error));
const photo = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" });

/** A binary glTF from a JSON chunk and an optional BIN chunk. */
function glbFile(gltf: object, bin?: Uint8Array): ArrayBuffer {
  const pad = (bytes: Uint8Array, fill: number) => {
    const padded = new Uint8Array(Math.ceil(bytes.length / 4) * 4).fill(fill);
    padded.set(bytes);
    return padded;
  };
  const jsonChunk = pad(new TextEncoder().encode(JSON.stringify(gltf)), 0x20);
  const binChunk = bin && pad(bin, 0);
  const length = 20 + jsonChunk.length + (binChunk ? 8 + binChunk.length : 0);
  const view = new DataView(new ArrayBuffer(length));
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, length, true);
  view.setUint32(12, jsonChunk.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(view.buffer).set(jsonChunk, 20);
  if (binChunk) {
    const at = 20 + jsonChunk.length;
    view.setUint32(at, binChunk.length, true);
    view.setUint32(at + 4, 0x004e4942, true);
    new Uint8Array(view.buffer).set(binChunk, at + 8);
  }
  return view.buffer;
}

/** One textureless triangle with no normals and no metallicFactor, like TRELLIS output. */
function trellisLikeGlb(): ArrayBuffer {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  return glbFile({
    asset: { version: "2.0" },
    buffers: [{ byteLength: positions.byteLength }],
    bufferViews: [{ buffer: 0, byteLength: positions.byteLength }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.8, 0.45, 0.4, 1], roughnessFactor: 1 } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    nodes: [{ mesh: 0 }],
    scenes: [{ nodes: [0] }],
    scene: 0,
  }, new Uint8Array(positions.buffer));
}

function firstMesh(object: Object3D): Mesh<BufferGeometry, MeshStandardMaterial> {
  let found: Mesh | undefined;
  object.traverse((child) => { if (!found && child instanceof Mesh) found = child; });
  if (!found) throw new Error("No mesh");
  return found as Mesh<BufferGeometry, MeshStandardMaterial>;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("AI look job client", () => {
  it("posts the photo once and follows the streamed phases until the GLB arrives", async () => {
    const fetchImpl = server([{ phase: "queued", t: 900 }, { phase: "running", t: 4000 }, { phase: "downloading", t: 30000 }, { phase: "done", t: 31000, glb: btoa("\x01\x02\x03") }]);
    const phases: JobPhase[] = [];
    const glb = await runModelJob(photo(), { fetchImpl: fetchImpl as typeof fetch, onPhase: (phase) => phases.push(phase) });
    expect(new Uint8Array(glb)).toEqual(new Uint8Array([1, 2, 3]));
    expect(phases).toEqual(["sending", "queued", "running", "downloading"]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/model3d");
    expect(init.method).toBe("POST");
    expect([...(init.body as FormData).values()]).toHaveLength(1);
  });

  it("stops waiting after 180 s", async () => {
    vi.useFakeTimers();
    const job = failure(runModelJob(photo(), { fetchImpl: server([{ phase: "running", t: 1 }], { hold: true }) as typeof fetch }));
    await vi.advanceTimersByTimeAsync(JOB_TIMEOUT_MS);
    expect(await job).toBe("timeout");
  });

  it("can be cancelled while waiting, which closes the stream", async () => {
    const controller = new AbortController();
    const fetchImpl = server([{ phase: "queued", t: 1 }], { hold: true });
    const phases: JobPhase[] = [];
    const job = failure(runModelJob(photo(), { fetchImpl: fetchImpl as typeof fetch, signal: controller.signal, onPhase: (phase) => phases.push(phase) }));
    await vi.waitFor(() => expect(phases).toContain("queued"));
    controller.abort();
    expect(await job).toBe("cancelled");
    expect((fetchImpl.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true);
  });

  it("maps stream errors and server refusals to bilingual message codes", async () => {
    const streamed = async (lines: unknown[]) => failure(runModelJob(photo(), { fetchImpl: server(lines) as typeof fetch }));
    expect(await streamed([{ phase: "queued", t: 1 }, { error: "failed", t: 2 }])).toBe("failed");
    expect(await streamed([{ error: "upstream", t: 2 }])).toBe("upstream");
    expect(await streamed([{ phase: "downloading", t: 1 }, { error: "too-large", t: 2 }])).toBe("failed");
    expect(await streamed([{ phase: "running", t: 1 }])).toBe("network");
    const garbled = await failure(runModelJob(photo(), { fetchImpl: (async () => new Response("not json\n")) as typeof fetch }));
    expect(garbled).toBe("upstream");
    const refused = async (body: unknown, status: number) => failure(runModelJob(photo(), { fetchImpl: (async () => json(body, status)) as typeof fetch }));
    expect(await refused({ error: "disabled" }, 503)).toBe("disabled");
    expect(await refused({ error: "rate-limited", limit: "ip" }, 429)).toBe("rate-limited");
    expect(await refused({ error: "invalid-type" }, 415)).toBe("invalid-photo");
    expect(await refused({ error: "too-large" }, 413)).toBe("too-large");
    expect(await failure(runModelJob(photo(), { fetchImpl: (async () => { throw new TypeError("offline"); }) as typeof fetch }))).toBe("network");
  });
});

describe("GLB parsing", () => {
  it("loads a committed binary glTF", async () => {
    const file = readFileSync(join(process.cwd(), "public", "models", "furniture", "chair.glb"));
    const scene = await parseGlb(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
    expect(scene.children.length).toBeGreaterThan(0);
  });

  it("makes a TRELLIS-style model matte and smooth so its colours show", async () => {
    // glTF's default metallicFactor is 1: loaded as-is, the model is a black-looking metal without normals.
    const raw = firstMesh((await new GLTFLoader().parseAsync(trellisLikeGlb(), "")).scene);
    expect(raw.material.metalness).toBe(1);
    expect(raw.geometry.getAttribute("normal")).toBeUndefined();
    const mesh = firstMesh(await parseGlb(trellisLikeGlb()));
    expect(mesh.material.metalness).toBe(0);
    expect(mesh.material.flatShading).toBe(false);
    expect(mesh.material.color.getHexString()).toBe(raw.material.color.getHexString());
    expect(mesh.geometry.getAttribute("normal")?.count).toBe(3);
  });

  it("leaves metal maps, unlit materials and existing normals alone except for metalness", () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
    geometry.setAttribute("normal", new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3));
    const metal = new MeshStandardMaterial({ metalness: 0.7, metalnessMap: new Texture(), flatShading: true });
    const unlit = new MeshBasicMaterial();
    const mesh = new Mesh(geometry, [metal, unlit]);
    matteLookMaterials(mesh);
    expect(metal.metalness).toBe(0);
    expect(metal.metalnessMap).toBeNull();
    expect(metal.flatShading).toBe(true);
    expect(geometry.getAttribute("normal").getZ(0)).toBe(1);
    expect(unlit).toBeInstanceOf(MeshBasicMaterial);
  });

  it("rejects non-GLB files and never fetches external resources", async () => {
    expect(await failure(parseGlb(new TextEncoder().encode('{"asset":{"version":"2.0"}}').buffer))).toBe("failed");
    const external = glbFile({ asset: { version: "2.0" }, buffers: [{ uri: "https://example.com/model.bin", byteLength: 36 }], bufferViews: [{ buffer: 0, byteLength: 36 }], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 1] }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0 });
    const realFetch = globalThis.fetch;
    const fetchSpy = vi.fn((input: RequestInfo | URL, init?: RequestInit) => realFetch(input, init));
    vi.stubGlobal("fetch", fetchSpy);
    expect(await failure(parseGlb(external))).toBe("failed");
    const urls = fetchSpy.mock.calls.map(([input]) => (input instanceof Request ? input.url : String(input)));
    expect(urls).toContain("data:,");
    expect(urls.some((url) => url.includes("example.com"))).toBe(false);
  });
});
