import { FAL_STORAGE, falClient } from "../model3d/fal-server";
import type { FloorplanReading } from "./ai-contract";
import { parseAiReply } from "./ai-parse";
import { repairPrompt, SYSTEM_PROMPT, userPrompt } from "./prompt";
import type { FlatType } from "./trace";

/** fal's OpenRouter vision router: one image in, the model's text reply out. */
export const VISION_ENDPOINT = "openrouter/router/vision";
export const DEFAULT_FLOORPLAN_MODEL = "google/gemini-2.5-flash";
const MAX_TOKENS = 8192;
const STATUS_POLL_MS = 1000;

/** Server-only: FAL_KEY is read at request time and never sent to the browser. */
export function floorplanEnabled(): boolean {
  return process.env.FLOORPLAN_ENABLED === "true" && Boolean(process.env.FAL_KEY);
}

export function floorplanModel(): string {
  const model = process.env.FLOORPLAN_MODEL?.trim();
  return model && /^[\w.-]+\/[\w.:-]+$/.test(model) ? model : DEFAULT_FLOORPLAN_MODEL;
}

/** Some models (e.g. Gemini 2.5 Pro) refuse to run with reasoning switched off; FLOORPLAN_REASONING=true allows them. */
export function floorplanReasoning(): boolean {
  return process.env.FLOORPLAN_REASONING === "true";
}

export class UnreadablePlanError extends Error {
  constructor(readonly errors: readonly string[]) {
    super("unreadable plan");
  }
}

interface VisionOutput {
  output?: unknown;
}

/**
 * Uploads the cropped plan to fal storage (expiring after an hour) and asks the vision model to read
 * it. An unusable first answer gets one corrective request quoting what was wrong; a second unusable
 * answer is an UnreadablePlanError. FitIn itself stores neither the picture nor the answer.
 */
export async function readPlan(picture: File, flatType: FlatType | null, signal: AbortSignal): Promise<FloorplanReading> {
  const fal = falClient();
  const model = floorplanModel();
  const imageUrl = await fal.storage.upload(picture, { lifecycle: FAL_STORAGE });
  const ask = async (prompt: string): Promise<string> => {
    const result = await fal.subscribe(VISION_ENDPOINT, {
      input: { model, system_prompt: SYSTEM_PROMPT, prompt, image_urls: [imageUrl], temperature: 0, reasoning: floorplanReasoning(), max_tokens: MAX_TOKENS },
      mode: "polling",
      pollInterval: STATUS_POLL_MS,
      abortSignal: signal,
      storageSettings: FAL_STORAGE,
    });
    const output = (result.data as VisionOutput | undefined)?.output;
    return typeof output === "string" ? output : "";
  };
  const first = await ask(userPrompt(flatType));
  const parsed = parseAiReply(first);
  if (parsed.ok) return { plan: parsed.plan, model, repaired: false, dropped: parsed.dropped };
  const second = parseAiReply(await ask(repairPrompt(flatType, first, parsed.errors)));
  if (second.ok) return { plan: second.plan, model, repaired: true, dropped: second.dropped };
  throw new UnreadablePlanError(second.errors);
}
