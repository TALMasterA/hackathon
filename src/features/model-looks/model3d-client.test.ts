import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JOB_TIMEOUT_MS, LookError, parseGlb, POLL_INTERVAL_MS, runModelJob, type JobPhase } from "./model3d-client";

const JOB_ID = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function server(statuses: string[], glb = new Uint8Array([1, 2, 3])) {
  let poll = 0;
  return vi.fn(async (url: string | URL | Request) => {
    const path = String(url);
    if (path === "/api/model3d") return json({ jobId: JOB_ID });
    if (path === `/api/model3d/${JOB_ID}`) return json({ status: statuses[Math.min(poll++, statuses.length - 1)] });
    if (path === `/api/model3d/${JOB_ID}/file`) return new Response(glb, { headers: { "Content-Type": "model/gltf-binary" } });
    return new Response(null, { status: 404 });
  });
}

const failure = (promise: Promise<unknown>) => promise.then(() => null, (error: unknown) => (error instanceof LookError ? error.code : error));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("AI look job client", () => {
  it("posts the photo, polls every 4 s through queued/running and downloads the GLB from the app route", async () => {
    vi.useFakeTimers();
    const fetchImpl = server(["queued", "running", "done"]);
    const phases: JobPhase[] = [];
    const job = runModelJob(new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" }), { fetchImpl: fetchImpl as typeof fetch, onPhase: (phase) => phases.push(phase) });
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS - 1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2);
    expect(new Uint8Array(await job)).toEqual(new Uint8Array([1, 2, 3]));
    expect(phases).toEqual(["sending", "queued", "running", "downloading"]);
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual(["/api/model3d", `/api/model3d/${JOB_ID}`, `/api/model3d/${JOB_ID}`, `/api/model3d/${JOB_ID}`, `/api/model3d/${JOB_ID}/file`]);
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect([...(init.body as FormData).values()]).toHaveLength(1);
  });

  it("stops waiting after 180 s", async () => {
    vi.useFakeTimers();
    const job = failure(runModelJob(new Blob(["x"]), { fetchImpl: server(["running"]) as typeof fetch }));
    await vi.advanceTimersByTimeAsync(JOB_TIMEOUT_MS);
    expect(await job).toBe("timeout");
  });

  it("can be cancelled while polling", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const job = failure(runModelJob(new Blob(["x"]), { fetchImpl: server(["queued"]) as typeof fetch, signal: controller.signal }));
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2);
    controller.abort();
    expect(await job).toBe("cancelled");
  });

  it("reports a failed job and maps server refusals to bilingual message codes", async () => {
    vi.useFakeTimers();
    const failed = failure(runModelJob(new Blob(["x"]), { fetchImpl: server(["queued", "failed"]) as typeof fetch }));
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2);
    expect(await failed).toBe("failed");
    vi.useRealTimers();
    const refused = async (body: unknown, status: number) => failure(runModelJob(new Blob(["x"]), { fetchImpl: (async () => json(body, status)) as typeof fetch }));
    expect(await refused({ error: "disabled" }, 503)).toBe("disabled");
    expect(await refused({ error: "rate-limited", limit: "ip" }, 429)).toBe("rate-limited");
    expect(await refused({ error: "invalid-type" }, 415)).toBe("invalid-photo");
    expect(await refused({ error: "too-large" }, 413)).toBe("too-large");
    expect(await failure(runModelJob(new Blob(["x"]), { fetchImpl: (async () => { throw new TypeError("offline"); }) as typeof fetch }))).toBe("network");
  });
});

describe("GLB parsing", () => {
  it("loads a committed binary glTF", async () => {
    const file = readFileSync(join(process.cwd(), "public", "models", "furniture", "chair.glb"));
    const scene = await parseGlb(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
    expect(scene.children.length).toBeGreaterThan(0);
  });

  it("rejects non-GLB files and never fetches external resources", async () => {
    expect(await failure(parseGlb(new TextEncoder().encode('{"asset":{"version":"2.0"}}').buffer))).toBe("glb-type");
    const json = new TextEncoder().encode(JSON.stringify({ asset: { version: "2.0" }, buffers: [{ uri: "https://example.com/model.bin", byteLength: 36 }], bufferViews: [{ buffer: 0, byteLength: 36 }], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 1] }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0 }));
    const padded = new Uint8Array(Math.ceil(json.length / 4) * 4).fill(0x20);
    padded.set(json);
    const glb = new DataView(new ArrayBuffer(20 + padded.length));
    glb.setUint32(0, 0x46546c67, true);
    glb.setUint32(4, 2, true);
    glb.setUint32(8, 20 + padded.length, true);
    glb.setUint32(12, padded.length, true);
    glb.setUint32(16, 0x4e4f534a, true);
    new Uint8Array(glb.buffer).set(padded, 20);
    const realFetch = globalThis.fetch;
    const fetchSpy = vi.fn((input: RequestInfo | URL, init?: RequestInit) => realFetch(input, init));
    vi.stubGlobal("fetch", fetchSpy);
    expect(await failure(parseGlb(glb.buffer))).toBe("glb-parse");
    const urls = fetchSpy.mock.calls.map(([input]) => (input instanceof Request ? input.url : String(input)));
    expect(urls).toContain("data:,");
    expect(urls.some((url) => url.includes("example.com"))).toBe(false);
  });
});
