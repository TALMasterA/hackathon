import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MODEL3D_MAX_PHOTO_BYTES } from "../model3d/contract";

const fal = vi.hoisted(() => ({ storage: { upload: vi.fn() }, subscribe: vi.fn() }));
vi.mock("@fal-ai/client", () => ({ createFalClient: vi.fn(() => fal) }));

const FAL_URL = "https://v3.fal.media/files/plan/upload.png";
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d];
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01];
const PLAN = { flat_label: "2B", has_diagonal_walls: false, rooms: [{ kind: "living", box_2d: [100, 100, 600, 700], open_to: [] }], doors: [{ center: [100, 400], between: [-1, 0] }], windows: [] };
const reply = (output: string) => ({ data: { output, usage: {} }, requestId: "request-1" });

const picture = (bytes: number[], type: string, size = bytes.length) => {
  const data = new Uint8Array(size);
  data.set(bytes);
  return new File([data], "plan", { type });
};

/** Fresh route module per test, so the in-memory rate limiter starts empty. */
async function routes() {
  vi.resetModules();
  return (await import("@/app/api/floorplan/route")).POST;
}

function send(post: (request: Request) => Promise<Response>, entries: (File | string)[] = [picture(PNG, "image/png")], { ip = "203.0.113.7", query = "?type=2B" } = {}) {
  const form = new FormData();
  entries.forEach((entry, index) => form.append(`photo${index}`, entry));
  return post(new Request(`http://localhost/api/floorplan${query}`, { method: "POST", body: form, headers: { "x-forwarded-for": ip } }));
}

beforeEach(() => {
  vi.stubEnv("FLOORPLAN_ENABLED", "true");
  vi.stubEnv("FAL_KEY", "test-secret-key");
  vi.stubEnv("FLOORPLAN_MODEL", "");
  fal.storage.upload.mockReset().mockResolvedValue(FAL_URL);
  fal.subscribe.mockReset().mockResolvedValue(reply(`\`\`\`json\n${JSON.stringify(PLAN)}\n\`\`\``));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/floorplan", () => {
  it("returns 503 unless FLOORPLAN_ENABLED is exactly true and a key exists", async () => {
    const post = await routes();
    vi.stubEnv("FLOORPLAN_ENABLED", "1");
    expect((await send(post)).status).toBe(503);
    vi.stubEnv("FLOORPLAN_ENABLED", "true");
    vi.stubEnv("FAL_KEY", "");
    const response = await send(post);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "disabled" });
    expect(fal.storage.upload).not.toHaveBeenCalled();
  });

  it("accepts a known flat-type hint or none, and rejects anything else", async () => {
    const post = await routes();
    expect((await send(post, undefined, { query: "?type=4B" })).status).toBe(400);
    expect(await (await send(post, undefined, { query: "?type=<script>" })).json()).toEqual({ error: "invalid-hint" });
    expect((await send(post, undefined, { query: "" })).status).toBe(200);
    expect(fal.subscribe.mock.calls[0][1].input.prompt).not.toContain("Its label is");
  });

  it("validates the picture like the 3D-look route: one PNG/JPEG/WebP of at most 4 MB", async () => {
    const post = await routes();
    expect((await send(post, [])).status).toBe(400);
    expect((await send(post, [picture(PNG, "image/png"), picture(PNG, "image/png")])).status).toBe(400);
    expect((await send(post, [picture(JPEG, "image/png")])).status).toBe(415);
    expect((await send(post, [picture(PNG, "image/png", MODEL3D_MAX_PHOTO_BYTES + 1)])).status).toBe(413);
    expect(fal.storage.upload).not.toHaveBeenCalled();
  });

  it("reads the plan with the default model and answers without fal URLs or the key", async () => {
    const post = await routes();
    const response = await send(post);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ plan: PLAN, model: "google/gemini-2.5-flash", repaired: false, dropped: 0 });
    for (const secret of ["fal.media", "test-secret-key", "request-1"]) expect(text).not.toContain(secret);
    expect(fal.storage.upload).toHaveBeenCalledWith(expect.any(File), { lifecycle: { expiresIn: "1h" } });
    expect(fal.subscribe).toHaveBeenCalledTimes(1);
    const [endpoint, options] = fal.subscribe.mock.calls[0];
    expect(endpoint).toBe("openrouter/router/vision");
    expect(options).toMatchObject({ mode: "polling", abortSignal: expect.any(AbortSignal), input: { model: "google/gemini-2.5-flash", image_urls: [FAL_URL], temperature: 0, reasoning: false, max_tokens: 8192 } });
    expect(options.input.prompt).toContain("Its label is 2B");
    expect(options.input.system_prompt).toContain("JSON");
  });

  it("uses FLOORPLAN_MODEL when it looks like a model ID", async () => {
    vi.stubEnv("FLOORPLAN_MODEL", "google/gemini-2.5-pro");
    const post = await routes();
    expect((await (await send(post)).json()).model).toBe("google/gemini-2.5-pro");
    vi.stubEnv("FLOORPLAN_MODEL", "rm -rf /");
    expect((await (await send(await routes())).json()).model).toBe("google/gemini-2.5-flash");
  });

  it("asks once more, quoting what was wrong, when the first answer is unusable", async () => {
    fal.subscribe.mockReset().mockResolvedValueOnce(reply("Sorry, here is my best guess: none")).mockResolvedValueOnce(reply(JSON.stringify(PLAN)));
    const post = await routes();
    const response = await send(post);
    expect(await response.json()).toMatchObject({ repaired: true, plan: PLAN });
    expect(fal.subscribe).toHaveBeenCalledTimes(2);
    expect(fal.subscribe.mock.calls[1][1].input.prompt).toContain("did not contain a valid JSON object");
    expect(fal.storage.upload).toHaveBeenCalledTimes(1);
  });

  it("gives up with 'unreadable' after two unusable answers", async () => {
    fal.subscribe.mockReset().mockResolvedValue(reply(JSON.stringify({ rooms: [] })));
    const response = await send(await routes());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "unreadable" });
  });

  it("reports an upstream failure without details", async () => {
    fal.subscribe.mockReset().mockRejectedValue(Object.assign(new Error("Unauthorized: test-secret-key"), { status: 401 }));
    const response = await send(await routes());
    expect(response.status).toBe(502);
    expect(await response.text()).toBe(JSON.stringify({ error: "upstream" }));
  });

  it("limits each IP to 10 readings per 10 minutes, counting only accepted pictures", async () => {
    const post = await routes();
    for (let index = 0; index < 3; index++) expect((await send(post, [picture(JPEG, "image/png")])).status).toBe(415);
    for (let index = 0; index < 10; index++) expect((await send(post)).status).toBe(200);
    const limited = await send(post);
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: "rate-limited", limit: "ip" });
    expect((await send(post, undefined, { ip: "198.51.100.9" })).status).toBe(200);
  });
});
