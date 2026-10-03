import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MODEL3D_MAX_MODEL_BYTES, MODEL3D_MAX_PHOTO_BYTES, type Model3dEvent } from "./contract";
import { mapQueueStatus } from "./fal-server";
import { clientIp, RateLimiter } from "./rate-limit";

const fal = vi.hoisted(() => ({
  storage: { upload: vi.fn() },
  queue: { submit: vi.fn(), subscribeToStatus: vi.fn(), result: vi.fn(), cancel: vi.fn() },
}));
vi.mock("@fal-ai/client", () => ({ createFalClient: vi.fn(() => fal) }));

const JOB_ID = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const FAL_PHOTO_URL = "https://v3.fal.media/files/photo/upload.jpg";
const FAL_MODEL_URL = "https://v3.fal.media/files/model/model_mesh.glb";
const GLB = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 12, 0, 0, 0]);
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d];
const WEBP = [..."RIFF"].map((char) => char.charCodeAt(0)).concat([0x24, 0, 0, 0], [..."WEBP"].map((char) => char.charCodeAt(0)));

type StatusOptions = { onQueueUpdate?: (status: { status: string }) => void; abortSignal?: AbortSignal };

const photo = (bytes: number[], type: string, size = bytes.length) => {
  const data = new Uint8Array(size);
  data.set(bytes);
  return new File([data], "sofa", { type });
};

/** Fresh route module per test, so the in-memory rate limiter starts empty. */
async function routes() {
  vi.resetModules();
  return { POST: (await import("@/app/api/model3d/route")).POST };
}

function upload(post: (request: Request) => Promise<Response>, entries: (File | string)[], ip = "203.0.113.7") {
  const form = new FormData();
  entries.forEach((entry, index) => form.append(`photo${index}`, entry));
  return post(new Request("http://localhost/api/model3d", { method: "POST", body: form, headers: { "x-forwarded-for": ip } }));
}

/** Reads the whole NDJSON stream of an accepted photo. */
async function streamed(response: Response): Promise<{ text: string; events: Model3dEvent[] }> {
  const text = await response.text();
  return { text, events: text.trim().split("\n").map((line) => JSON.parse(line) as Model3dEvent) };
}

const phases = (events: Model3dEvent[]) => events.map((event) => ("error" in event ? `error:${event.error}` : event.phase));

/** Accepted photos are read to the end so no stream outlives its test. */
async function accepted(response: Response): Promise<number> {
  await response.text();
  return response.status;
}

beforeEach(() => {
  vi.stubEnv("MODEL3D_ENABLED", "true");
  vi.stubEnv("FAL_KEY", "test-secret-key");
  fal.storage.upload.mockReset().mockResolvedValue(FAL_PHOTO_URL);
  fal.queue.submit.mockReset().mockResolvedValue({ request_id: JOB_ID, status: "IN_QUEUE" });
  fal.queue.subscribeToStatus.mockReset().mockImplementation(async (_endpoint: string, options: StatusOptions) => {
    options.onQueueUpdate?.({ status: "IN_QUEUE" });
    options.onQueueUpdate?.({ status: "IN_PROGRESS" });
    options.onQueueUpdate?.({ status: "IN_PROGRESS" });
    options.onQueueUpdate?.({ status: "COMPLETED" });
    return { status: "COMPLETED", request_id: JOB_ID };
  });
  fal.queue.result.mockReset().mockResolvedValue({ data: { model_mesh: { url: FAL_MODEL_URL } }, requestId: JOB_ID });
  fal.queue.cancel.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(GLB.slice(), { headers: { "content-length": String(GLB.byteLength) } })));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /api/model3d", () => {
  it("returns 503 unless MODEL3D_ENABLED is exactly true and a key exists", async () => {
    const { POST } = await routes();
    vi.stubEnv("MODEL3D_ENABLED", "1");
    const response = await upload(POST, [photo(JPEG, "image/jpeg")]);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "disabled" });
    vi.stubEnv("MODEL3D_ENABLED", "true");
    vi.stubEnv("FAL_KEY", "");
    expect((await upload(POST, [photo(JPEG, "image/jpeg")])).status).toBe(503);
    expect(fal.storage.upload).not.toHaveBeenCalled();
  });

  it("requires exactly one file entry", async () => {
    const { POST } = await routes();
    for (const entries of [[], ["not a file"], [photo(JPEG, "image/jpeg"), photo(PNG, "image/png")], [photo(JPEG, "image/jpeg"), "extra"]]) {
      const response = await upload(POST, entries);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid-count" });
    }
    expect(fal.storage.upload).not.toHaveBeenCalled();
  });

  it("accepts only JPEG, PNG and WebP whose bytes match the declared type", async () => {
    const { POST } = await routes();
    for (const file of [photo([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], "image/gif"), photo(JPEG, "image/png"), photo(PNG, "image/webp"), photo([], "image/jpeg"), photo(JPEG, "")]) {
      const response = await upload(POST, [file]);
      expect(response.status).toBe(415);
      expect(await response.json()).toEqual({ error: "invalid-type" });
    }
    for (const [index, file] of [photo(JPEG, "image/jpeg"), photo(PNG, "image/png"), photo(WEBP, "image/webp")].entries()) {
      expect(await accepted(await upload(POST, [file], `198.51.100.${index}`))).toBe(200);
    }
  });

  it("rejects photos over 4 MB and accepts exactly 4 MB", async () => {
    const { POST } = await routes();
    const tooLarge = await upload(POST, [photo(JPEG, "image/jpeg", MODEL3D_MAX_PHOTO_BYTES + 1)]);
    expect(tooLarge.status).toBe(413);
    expect(await tooLarge.json()).toEqual({ error: "too-large" });
    expect(await accepted(await upload(POST, [photo(JPEG, "image/jpeg", MODEL3D_MAX_PHOTO_BYTES)]))).toBe(200);
    const declaredTooLarge = await POST(new Request("http://localhost/api/model3d", { method: "POST", body: "x", headers: { "content-length": String(MODEL3D_MAX_PHOTO_BYTES * 2) } }));
    expect(declaredTooLarge.status).toBe(413);
  });

  it("streams each phase and then the GLB itself, without fal URLs, the job ID or the key", async () => {
    const { POST } = await routes();
    const response = await upload(POST, [photo(JPEG, "image/jpeg")]);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/x-ndjson");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const { text, events } = await streamed(response);
    expect(phases(events)).toEqual(["queued", "running", "downloading", "done"]);
    expect(events.every((event) => typeof event.t === "number" && event.t >= 0)).toBe(true);
    const done = events.at(-1);
    expect(done && "glb" in done && new Uint8Array(Buffer.from(done.glb, "base64"))).toEqual(GLB);
    for (const secret of ["fal.media", JOB_ID, "test-secret-key"]) expect(text).not.toContain(secret);
    expect(fal.storage.upload).toHaveBeenCalledWith(expect.any(File), { lifecycle: { expiresIn: "1h" } });
    expect(fal.queue.submit).toHaveBeenCalledWith("fal-ai/trellis", { input: { image_url: FAL_PHOTO_URL }, storageSettings: { expiresIn: "1h" } });
    expect(fal.queue.subscribeToStatus).toHaveBeenCalledWith("fal-ai/trellis", expect.objectContaining({ requestId: JOB_ID, mode: "polling", pollInterval: 1000, logs: false }));
    expect(fal.queue.result).toHaveBeenCalledWith("fal-ai/trellis", { requestId: JOB_ID, abortSignal: expect.any(AbortSignal) });
    expect(fetch).toHaveBeenCalledWith(FAL_MODEL_URL, expect.objectContaining({ cache: "no-store" }));
  });

  it("uses TRELLIS 2 with light output caps when MODEL3D_MODEL is trellis-2, and TRELLIS otherwise", async () => {
    vi.stubEnv("MODEL3D_MODEL", "trellis-2");
    const { POST } = await routes();
    fal.queue.result.mockResolvedValueOnce({ data: { model_glb: { url: FAL_MODEL_URL } }, requestId: JOB_ID });
    expect(phases((await streamed(await upload(POST, [photo(JPEG, "image/jpeg")]))).events).at(-1)).toBe("done");
    expect(fal.queue.submit).toHaveBeenLastCalledWith("fal-ai/trellis-2", { input: { image_url: FAL_PHOTO_URL, resolution: 1024, decimation_target: 50_000, texture_size: 1024 }, storageSettings: { expiresIn: "1h" } });
    vi.stubEnv("MODEL3D_MODEL", "unknown-model");
    await accepted(await upload(POST, [photo(JPEG, "image/jpeg")]));
    expect(fal.queue.submit).toHaveBeenLastCalledWith("fal-ai/trellis", expect.anything());
  });

  it("ends the stream with an error line and no upstream details when a step fails", async () => {
    const { POST } = await routes();
    const last = async (ip: string) => {
      const { text, events } = await streamed(await upload(POST, [photo(JPEG, "image/jpeg")], ip));
      for (const secret of ["fal.media", "test-secret-key"]) expect(text).not.toContain(secret);
      return phases(events).at(-1);
    };
    fal.queue.submit.mockRejectedValueOnce(Object.assign(new Error("boom test-secret-key"), { status: 500 }));
    expect(await last("192.0.2.1")).toBe("error:upstream");
    fal.queue.subscribeToStatus.mockResolvedValueOnce({ status: "COMPLETED", error: "Internal error test-secret-key" });
    expect(await last("192.0.2.2")).toBe("error:failed");
    fal.queue.result.mockRejectedValueOnce(Object.assign(new Error("Unprocessable"), { status: 422 }));
    expect(await last("192.0.2.3")).toBe("error:failed");
    fal.queue.result.mockResolvedValueOnce({ data: { model_mesh: { url: "http://insecure.example/model.glb" } } });
    expect(await last("192.0.2.4")).toBe("error:upstream");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("gone", { status: 404 })));
    expect(await last("192.0.2.5")).toBe("error:upstream");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(GLB.slice(), { headers: { "content-length": String(MODEL3D_MAX_MODEL_BYTES + 1) } })));
    expect(await last("192.0.2.6")).toBe("error:too-large");
  });

  it("stops waiting and cancels the fal job when the client stops reading", async () => {
    const { POST } = await routes();
    fal.queue.subscribeToStatus.mockImplementationOnce((_endpoint: string, options: StatusOptions) => new Promise((_resolve, reject) => {
      options.abortSignal?.addEventListener("abort", () => reject(new Error("aborted")));
    }));
    const response = await upload(POST, [photo(JPEG, "image/jpeg")]);
    const reader = response.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('"phase":"queued"');
    await reader.cancel();
    expect(fal.queue.cancel).toHaveBeenCalledWith("fal-ai/trellis", { requestId: JOB_ID });
    expect((fal.queue.subscribeToStatus.mock.calls[0][1] as StatusOptions).abortSignal?.aborted).toBe(true);
    expect(fal.queue.result).not.toHaveBeenCalled();
  });

  it("limits each IP to 5 accepted photos, without counting rejected ones", async () => {
    const { POST } = await routes();
    for (let index = 0; index < 3; index++) expect((await upload(POST, [photo(JPEG, "image/gif")])).status).toBe(415);
    for (let index = 0; index < 5; index++) expect(await accepted(await upload(POST, [photo(JPEG, "image/jpeg")]))).toBe(200);
    const limited = await upload(POST, [photo(JPEG, "image/jpeg")]);
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: "rate-limited", limit: "ip" });
    expect(await accepted(await upload(POST, [photo(JPEG, "image/jpeg")], "203.0.113.99"))).toBe(200);
    expect(fal.queue.submit).toHaveBeenCalledTimes(6);
  });

  it("caps one server instance at 60 accepted photos a day across all IPs", async () => {
    const { POST } = await routes();
    for (let index = 0; index < 60; index++) expect(await accepted(await upload(POST, [photo(JPEG, "image/jpeg")], `192.0.2.${index}`))).toBe(200);
    const limited = await upload(POST, [photo(JPEG, "image/jpeg")], "192.0.2.200");
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: "rate-limited", limit: "daily" });
  });
});

describe("rate limiter windows", () => {
  it("frees a per-IP slot after 10 minutes and the daily cap after 24 hours", () => {
    let now = 0;
    const limiter = new RateLimiter(undefined, () => now);
    for (let index = 0; index < 5; index++) limiter.record("a");
    expect(limiter.check("a")).toBe("ip");
    expect(limiter.check("b")).toBeNull();
    now = 10 * 60 * 1000 - 1;
    expect(limiter.check("a")).toBe("ip");
    now = 10 * 60 * 1000;
    expect(limiter.check("a")).toBeNull();
    for (let index = 0; index < 55; index++) limiter.record(`ip-${index}`);
    expect(limiter.check("fresh")).toBe("daily");
    now = 24 * 60 * 60 * 1000;
    expect(limiter.check("fresh")).toBeNull();
  });

  it("uses the first forwarded hop as the client IP", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }))).toBe("203.0.113.5");
    expect(clientIp(new Headers({ "x-real-ip": "203.0.113.6" }))).toBe("203.0.113.6");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

describe("fal queue status mapping", () => {
  it("maps fal queue states to queued, running, done and failed", () => {
    expect(mapQueueStatus({ status: "IN_QUEUE" })).toBe("queued");
    expect(mapQueueStatus({ status: "IN_PROGRESS" })).toBe("running");
    expect(mapQueueStatus({ status: "COMPLETED" })).toBe("done");
    expect(mapQueueStatus({ status: "COMPLETED", error: "Internal error" })).toBe("failed");
    expect(mapQueueStatus({ status: "CANCELLED" } as never)).toBe("failed");
  });
});
