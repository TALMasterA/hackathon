import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isJobId, MODEL3D_MAX_PHOTO_BYTES } from "./contract";
import { mapQueueStatus } from "./fal-server";
import { clientIp, RateLimiter } from "./rate-limit";

const fal = vi.hoisted(() => ({
  storage: { upload: vi.fn() },
  queue: { submit: vi.fn(), status: vi.fn(), result: vi.fn() },
}));
vi.mock("@fal-ai/client", () => ({ createFalClient: vi.fn(() => fal) }));

const JOB_ID = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const FAL_PHOTO_URL = "https://v3.fal.media/files/photo/upload.jpg";
const FAL_MODEL_URL = "https://v3.fal.media/files/model/model_mesh.glb";
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d];
const WEBP = [..."RIFF"].map((char) => char.charCodeAt(0)).concat([0x24, 0, 0, 0], [..."WEBP"].map((char) => char.charCodeAt(0)));

const photo = (bytes: number[], type: string, size = bytes.length) => {
  const data = new Uint8Array(size);
  data.set(bytes);
  return new File([data], "sofa", { type });
};

/** Fresh route modules per test, so the in-memory rate limiter starts empty. */
async function routes() {
  vi.resetModules();
  return {
    POST: (await import("@/app/api/model3d/route")).POST,
    status: (await import("@/app/api/model3d/[id]/route")).GET,
    file: (await import("@/app/api/model3d/[id]/file/route")).GET,
  };
}

function upload(post: (request: Request) => Promise<Response>, entries: (File | string)[], ip = "203.0.113.7") {
  const form = new FormData();
  entries.forEach((entry, index) => form.append(`photo${index}`, entry));
  return post(new Request("http://localhost/api/model3d", { method: "POST", body: form, headers: { "x-forwarded-for": ip } }));
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.stubEnv("MODEL3D_ENABLED", "true");
  vi.stubEnv("FAL_KEY", "test-secret-key");
  fal.storage.upload.mockReset().mockResolvedValue(FAL_PHOTO_URL);
  fal.queue.submit.mockReset().mockResolvedValue({ request_id: JOB_ID, status: "IN_QUEUE" });
  fal.queue.status.mockReset();
  fal.queue.result.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /api/model3d", () => {
  it("returns 503 unless MODEL3D_ENABLED is exactly true and a key exists", async () => {
    const { POST, status, file } = await routes();
    vi.stubEnv("MODEL3D_ENABLED", "1");
    const response = await upload(POST, [photo(JPEG, "image/jpeg")]);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "disabled" });
    expect((await status(new Request("http://localhost"), params(JOB_ID))).status).toBe(503);
    expect((await file(new Request("http://localhost"), params(JOB_ID))).status).toBe(503);
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
      expect((await upload(POST, [file], `198.51.100.${index}`)).status).toBe(200);
    }
  });

  it("rejects photos over 4 MB and accepts exactly 4 MB", async () => {
    const { POST } = await routes();
    const tooLarge = await upload(POST, [photo(JPEG, "image/jpeg", MODEL3D_MAX_PHOTO_BYTES + 1)]);
    expect(tooLarge.status).toBe(413);
    expect(await tooLarge.json()).toEqual({ error: "too-large" });
    expect((await upload(POST, [photo(JPEG, "image/jpeg", MODEL3D_MAX_PHOTO_BYTES)])).status).toBe(200);
    const declaredTooLarge = await POST(new Request("http://localhost/api/model3d", { method: "POST", body: "x", headers: { "content-length": String(MODEL3D_MAX_PHOTO_BYTES * 2) } }));
    expect(declaredTooLarge.status).toBe(413);
  });

  it("uploads the photo to fal storage, submits TRELLIS and returns only the job ID", async () => {
    const { POST } = await routes();
    const file = photo(JPEG, "image/jpeg");
    const response = await upload(POST, [file]);
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toEqual({ jobId: JOB_ID });
    expect(text).not.toContain("fal.media");
    expect(text).not.toContain("test-secret-key");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(fal.storage.upload).toHaveBeenCalledWith(expect.any(File), { lifecycle: { expiresIn: "1h" } });
    expect(fal.queue.submit).toHaveBeenCalledWith("fal-ai/trellis", { input: { image_url: FAL_PHOTO_URL }, storageSettings: { expiresIn: "1h" } });
  });

  it("reports an upstream failure without details", async () => {
    const { POST } = await routes();
    fal.queue.submit.mockRejectedValueOnce(Object.assign(new Error("boom test-secret-key"), { status: 500 }));
    const response = await upload(POST, [photo(JPEG, "image/jpeg")]);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "upstream" });
  });

  it("limits each IP to 5 accepted photos, without counting rejected ones", async () => {
    const { POST } = await routes();
    for (let index = 0; index < 3; index++) expect((await upload(POST, [photo(JPEG, "image/gif")])).status).toBe(415);
    for (let index = 0; index < 5; index++) expect((await upload(POST, [photo(JPEG, "image/jpeg")])).status).toBe(200);
    const limited = await upload(POST, [photo(JPEG, "image/jpeg")]);
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: "rate-limited", limit: "ip" });
    expect((await upload(POST, [photo(JPEG, "image/jpeg")], "203.0.113.99")).status).toBe(200);
    expect(fal.queue.submit).toHaveBeenCalledTimes(6);
  });

  it("caps one server instance at 60 accepted photos a day across all IPs", async () => {
    const { POST } = await routes();
    for (let index = 0; index < 60; index++) expect((await upload(POST, [photo(JPEG, "image/jpeg")], `192.0.2.${index}`)).status).toBe(200);
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

describe("GET /api/model3d/[id]", () => {
  it("maps fal queue states to queued, running, done and failed", () => {
    expect(mapQueueStatus({ status: "IN_QUEUE" })).toBe("queued");
    expect(mapQueueStatus({ status: "IN_PROGRESS" })).toBe("running");
    expect(mapQueueStatus({ status: "COMPLETED" })).toBe("done");
    expect(mapQueueStatus({ status: "COMPLETED", error: "Internal error" })).toBe("failed");
    expect(mapQueueStatus({ status: "CANCELLED" } as never)).toBe("failed");
  });

  it("returns the mapped status, treats unknown jobs as failed and rejects odd IDs", async () => {
    const { status } = await routes();
    fal.queue.status.mockResolvedValueOnce({ status: "IN_PROGRESS", request_id: JOB_ID, logs: [] });
    const running = await status(new Request("http://localhost"), params(JOB_ID));
    expect(await running.json()).toEqual({ status: "running" });
    expect(fal.queue.status).toHaveBeenCalledWith("fal-ai/trellis", { requestId: JOB_ID, logs: false });
    fal.queue.status.mockRejectedValueOnce(Object.assign(new Error("Not found"), { status: 404 }));
    expect(await (await status(new Request("http://localhost"), params(JOB_ID))).json()).toEqual({ status: "failed" });
    fal.queue.status.mockRejectedValueOnce(new Error("network"));
    expect((await status(new Request("http://localhost"), params(JOB_ID))).status).toBe(502);
    expect((await status(new Request("http://localhost"), params("../../secrets"))).status).toBe(400);
    expect(isJobId(JOB_ID)).toBe(true);
  });
});

describe("GET /api/model3d/[id]/file", () => {
  it("fetches the GLB server-side and streams it as model/gltf-binary without exposing the fal URL", async () => {
    const { file } = await routes();
    const glb = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 12, 0, 0, 0]);
    fal.queue.result.mockResolvedValueOnce({ data: { model_mesh: { url: FAL_MODEL_URL } }, requestId: JOB_ID });
    const fetchMock = vi.fn(async () => new Response(glb, { headers: { "content-length": String(glb.byteLength) } }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await file(new Request("http://localhost"), params(JOB_ID));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("model/gltf-binary");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect([...response.headers.values()].join(" ")).not.toContain("fal.media");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(glb);
    expect(fetchMock).toHaveBeenCalledWith(FAL_MODEL_URL, { cache: "no-store" });
  });

  it("returns 502 for a failed result, a non-https URL or a failed download", async () => {
    const { file } = await routes();
    fal.queue.result.mockRejectedValueOnce(Object.assign(new Error("Unprocessable"), { status: 422 }));
    expect((await file(new Request("http://localhost"), params(JOB_ID))).status).toBe(502);
    fal.queue.result.mockResolvedValueOnce({ data: { model_mesh: { url: "http://insecure.example/model.glb" } } });
    expect((await file(new Request("http://localhost"), params(JOB_ID))).status).toBe(502);
    fal.queue.result.mockResolvedValueOnce({ data: { model_mesh: { url: FAL_MODEL_URL } } });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("gone", { status: 404 })));
    const failed = await file(new Request("http://localhost"), params(JOB_ID));
    expect(failed.status).toBe(502);
    expect(await failed.json()).toEqual({ error: "upstream" });
  });
});
