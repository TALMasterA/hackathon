import { describe, expect, it, vi } from "vitest";
import { boxInRaster, readPlanWithAi, ReadError, type ReadErrorCode } from "./floorplan-client";

const PLAN = { flat_label: null, has_diagonal_walls: false, rooms: [{ kind: "bedroom", box_2d: [100, 100, 500, 500], open_to: [] }], doors: [], windows: [] };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const picture = () => new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" });

async function failure(promise: Promise<unknown>): Promise<ReadErrorCode> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ReadError) return error.code;
    throw error;
  }
  throw new Error("expected a failure");
}

describe("AI plan-reading client", () => {
  it("posts the picture with the flat type and returns the checked reading", async () => {
    const fetchImpl = vi.fn(async () => json({ plan: PLAN, model: "google/gemini-2.5-flash", repaired: true, dropped: 1 }));
    const reading = await readPlanWithAi(picture(), "2B", { fetchImpl: fetchImpl as typeof fetch });
    expect(reading).toEqual({ plan: PLAN, model: "google/gemini-2.5-flash", repaired: true, dropped: 1 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/floorplan?type=2B");
    expect(init.method).toBe("POST");
    expect((init.body as FormData).get("photo")).toBeInstanceOf(Blob);
    await readPlanWithAi(picture(), null, { fetchImpl: fetchImpl as typeof fetch });
    expect((fetchImpl.mock.calls[1] as unknown as [string])[0]).toBe("/api/floorplan");
  });

  it("maps server refusals to clear codes", async () => {
    const refused = (body: unknown, status: number) => failure(readPlanWithAi(picture(), null, { fetchImpl: (async () => json(body, status)) as typeof fetch }));
    expect(await refused({ error: "disabled" }, 503)).toBe("disabled");
    expect(await refused({ error: "rate-limited", limit: "ip" }, 429)).toBe("rate-limited");
    expect(await refused({ error: "invalid-type" }, 415)).toBe("invalid-picture");
    expect(await refused({ error: "unreadable" }, 502)).toBe("unreadable");
    expect(await refused({ error: "timeout" }, 504)).toBe("timeout");
    expect(await refused("gateway down", 502)).toBe("upstream");
  });

  it("re-checks the reading and refuses a malformed one", async () => {
    expect(await failure(readPlanWithAi(picture(), null, { fetchImpl: (async () => json({ plan: { rooms: [] }, model: "x" })) as typeof fetch }))).toBe("unreadable");
  });

  it("reports network failures, cancelling and its own timeout", async () => {
    expect(await failure(readPlanWithAi(picture(), null, { fetchImpl: (async () => { throw new TypeError("offline"); }) as typeof fetch }))).toBe("network");
    const hold = ((_: string, init: RequestInit) => new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))) as unknown as typeof fetch;
    const controller = new AbortController();
    const cancelled = failure(readPlanWithAi(picture(), null, { fetchImpl: hold, signal: controller.signal }));
    controller.abort();
    expect(await cancelled).toBe("cancelled");
    expect(await failure(readPlanWithAi(picture(), null, { fetchImpl: hold, timeoutMs: 5 }))).toBe("timeout");
  });

  it("maps the user's box into raster pixels of the crop", () => {
    const frame = { centre: { x: 500, y: 200 }, rotation: 0, width: 140, height: 120 };
    expect(boxInRaster({ minX: 450, maxX: 550, minZ: 150, maxZ: 250 }, frame, 2).bounds).toEqual({ minX: 40, maxX: 240, minZ: 20, maxZ: 220 });
  });
});
