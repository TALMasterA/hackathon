import type { RateLimitOptions } from "../model3d/rate-limit";
import type { RoomKind } from "../../types/domain";

/**
 * What the vision model is asked to return for the cropped plan of one flat. Coordinates are
 * normalised to the image sent, 0–1000, y first (the order Gemini-family models are trained on):
 * boxes are [ymin, xmin, ymax, xmax] and points [y, x].
 */
export interface AiRoom {
  kind: RoomKind;
  box_2d: [number, number, number, number];
  /** Indexes of rooms this one is part of the same space with (an L-shaped room as two rectangles). */
  open_to: number[];
}

export interface AiDoor {
  center: [number, number];
  /** The two room indexes it connects; -1 is outside the flat. */
  between: [number, number] | null;
}

export interface AiWindow {
  center: [number, number];
  room: number;
}

export interface AiPlan {
  flat_label: string | null;
  has_diagonal_walls: boolean;
  rooms: AiRoom[];
  doors: AiDoor[];
  windows: AiWindow[];
}

/** The route's answer: the checked plan, the model that read it, and what had to be corrected or dropped. */
export interface FloorplanReading {
  plan: AiPlan;
  model: string;
  /** True when the first answer was unusable and a second, corrective request was made. */
  repaired: boolean;
  /** Doors and windows dropped because the model described them inconsistently. */
  dropped: number;
}

export type FloorplanErrorCode = "disabled" | "rate-limited" | "invalid-count" | "invalid-type" | "too-large" | "invalid-hint" | "upstream" | "unreadable" | "timeout";

export const FLOORPLAN_LIMITS = { rooms: 15, doors: 30, windows: 30, minimumSide: 10 } as const;
export const FLOORPLAN_TIMEOUT_MS = 100_000;
/** Reading a plan is cheap but not free: 10 per IP per 10 minutes, 100 a day per server instance. */
export const FLOORPLAN_RATE_LIMITS: RateLimitOptions = { perIp: 10, windowMs: 10 * 60 * 1000, daily: 100, dayMs: 24 * 60 * 60 * 1000 };
