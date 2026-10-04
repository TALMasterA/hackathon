import type { FlatFurniture, LayoutLocks, LayoutSnapshot, LayoutViolation, LockViolation, Position2D } from "../../types/domain";

/**
 * Data of the design assistant ("Designer feedback loop"): plain values only, so that every step can
 * be tested without React. Interpretation is rule-based and generation is a bounded heuristic search;
 * neither uses AI or the network.
 */

export const INTERPRETATION_MODE = "rule-based" as const;
export const GENERATION_MODE = "heuristic" as const;

/** Depths a user can choose for an open zone. They are the user's choice, not a clearance standard. */
export const ZONE_DEPTHS = [60, 90, 120] as const;
export type ZoneDepth = (typeof ZONE_DEPTHS)[number];

export interface Pose {
  position: Position2D;
  orientation: number;
}

/** A floor area the user wants kept free: in front of a door on this room's side, or in front of an item. */
export type ZoneRef =
  | { kind: "door"; doorId: string; depth: ZoneDepth }
  | { kind: "item-front"; itemId: string; depth: ZoneDepth };

export type Preference =
  /** Hard: the item keeps its original pose (or, with `pose`, the pose the user chose from a proposal). */
  | { type: "keep-in-place"; itemId: string; allowRotation: boolean; pose?: Pose }
  /** Soft: fewer and smaller changes; `maxChangedItems` is a limit the user set by rejecting a proposal. */
  | { type: "minimise-changes"; maxChangedItems?: number }
  /** Goal: less furniture in the zone. */
  | { type: "open-zone"; zone: ZoneRef }
  /** Goal: a shorter or longer edge-to-edge distance between two items. */
  | { type: "pair"; firstId: string; secondId: string; direction: "closer" | "farther" }
  /** Filter: when the item moves, it is not placed within `radius` of `centre`. */
  | { type: "avoid-position"; itemId: string; centre: Position2D; radius: number }
  /** Filter: when the item moves or turns, it does not face within 10 degrees of `angle`. */
  | { type: "avoid-orientation"; itemId: string; angle: number };

export type PreferenceSource = "control" | "text" | "feedback";

export interface PreferenceEntry {
  key: string;
  preference: Preference;
  source: PreferenceSource;
  round: number;
}

export type UnsupportedTopic = "lighting" | "daylight" | "colour" | "material" | "feng-shui" | "air" | "noise" | "style" | "budget" | "add-remove" | "other-room" | "resize";
export type UnresolvedTopic = "walking-space" | "no-door" | "not-in-room" | "keep-here" | "needs-second-item" | "needs-item";

/**
 * A text request whose items (or door) could not be told apart: the preference with placeholder ids,
 * and for each placeholder the words used and the possible ids. The user picks one per slot.
 */
export interface AmbiguousReference {
  id: string;
  clause: string;
  preference: Preference;
  slots: { slot: "itemId" | "firstId" | "secondId" | "doorId"; mention: string; candidates: string[] }[];
  /** For a single-slot reference whose preference depends on the item (an avoided spot), the preference per candidate. */
  options?: Record<string, Preference>;
}

/**
 * Two (or, for a lock, one) preferences that cannot all hold. `indices` point into the list the
 * conflicts were detected on; the user resolves each one explicitly, never the search.
 */
export interface Conflict {
  code: "pair-direction" | "keep-pose" | "keep-vs-avoid" | "closer-vs-lock";
  indices: number[];
  itemIds: string[];
  lock?: { id: string; minimum: number; actual: number };
}

/** Not contradictions, but limits on what the search can do; shown before generating. */
export interface InterpretationWarning {
  code: "zone-blocked-by-fixed" | "pair-fixed";
  itemIds: string[];
  reason?: "kept" | "locked";
}

export type AssumptionCode = "others-movable" | "zone-depth-default" | "front-zone-follows" | "text-confirmation" | "same-room" | "rotation-steps";

export interface TextPreference {
  clause: string;
  preference: Preference;
}

export interface Interpretation {
  mode: typeof INTERPRETATION_MODE;
  /** From the structured controls: authoritative. */
  preferences: Preference[];
  /** Recognised in the free text: used only after the user confirms each one. */
  textPreferences: TextPreference[];
  ambiguous: AmbiguousReference[];
  unsupported: { clause: string; topic: UnsupportedTopic }[];
  unresolved: { clause: string; topic: UnresolvedTopic }[];
  unrecognised: string[];
  assumptions: AssumptionCode[];
  invalid: InvalidInput[];
}

export type InvalidInput = "no-room" | "no-goal" | "pair-incomplete" | "pair-same-item" | "zone-missing" | "other-needs-text" | "no-reason";

export type RejectionReasonCode = "should-not-move" | "too-many-changes" | "dislike-position" | "dislike-orientation" | "closer" | "farther" | "keep-here" | "other";

export interface RejectionReason {
  code: RejectionReasonCode;
  itemId?: string;
  secondId?: string;
  /** For "keep-here": which pose was meant, the original or the one shown in the proposal. */
  at?: "original" | "proposed";
}

export interface FeedbackEntry {
  round: number;
  kind: "initial" | "rejection" | "restart";
  proposalId?: string;
  text: string;
  reasons: RejectionReason[];
  /** Keys of the preferences this feedback added after confirmation. */
  added: string[];
  replaced: string[];
  /** Feedback with no measurable meaning stays visible here; no metric is invented for it. */
  unsupported: { clause: string; topic: UnsupportedTopic }[];
  unrecognised: string[];
}

export interface ItemChangeRecord {
  id: string;
  from: Pose;
  to: Pose;
  displacement: number;
  rotation: number;
}

export type MetricKind = "changed-count" | "displacement" | "rotation" | "zone" | "pair" | "avoided";
export type GoalOutcome = "improved" | "met" | "already-met" | "unchanged" | "worsened";

export interface Metric {
  kind: MetricKind;
  /** The preference the metric measures, for goals. */
  key?: string;
  unit: "count" | "cm" | "deg" | "m2";
  before: number;
  after: number;
  outcome?: GoalOutcome;
}

export type MessageParam = string | number | { item: string } | { zone: ZoneRef } | { cm: number } | { m2: number } | { deg: number } | { room: string };

/** A localisable sentence: a key of the assistant dictionary and its parameters. */
export interface Message {
  key: string;
  params?: Record<string, MessageParam>;
}

export interface ValidationIssue {
  code: "layout" | "lock" | "keep" | "room" | "missing";
  itemId: string;
  violation?: LayoutViolation | LockViolation;
}

export interface ValidationReport {
  feasible: boolean;
  issues: ValidationIssue[];
  /** Warnings that involve only unchanged items: they were there before and are not caused by the proposal. */
  preExisting: LayoutViolation[];
  checkedLocks: { position: number; distance: number };
  keptItems: number;
}

export interface SearchStats {
  items: number;
  rotationOnly: number;
  gridStep: number;
  positionsPerItem: number;
  movesTried: number;
  movesValid: number;
  combinationsTried: number;
  skippedAsRepeat: number;
  filteredAvoided: number;
  elapsedMs: number;
}

export type ProposalStatus = "preview" | "rejected" | "accepted" | "discarded";

export interface ProposalRecord {
  id: string;
  version: number;
  inputRevision: string;
  roomId: string;
  changedIds: string[];
  changes: ItemChangeRecord[];
  reasons: { itemId: string; messages: Message[] }[];
  metrics: Metric[];
  tradeOffs: Message[];
  checks: Message[];
  unverified: Message[];
  ranking: Message[];
  validation: ValidationReport;
  interpretationMode: typeof INTERPRETATION_MODE;
  generationMode: typeof GENERATION_MODE;
  searched: SearchStats;
  status: ProposalStatus;
}

export type GenerationOutcome =
  | { status: "found"; proposal: ProposalRecord }
  | { status: "none"; blockers: Message[]; suggestions: Message[]; searched: SearchStats }
  | { status: "baseline-meets-goals"; metrics: Metric[] }
  | { status: "timed-out"; searched: SearchStats }
  | { status: "cancelled" };

/** An arrangement already shown or rejected: the poses of the items it changed. */
export interface Arrangement {
  proposalId: string;
  poses: Record<string, Pose>;
}

export interface AppliedRecord {
  proposalId: string;
  version: number;
  preRevision: string;
  postRevision: string;
  changes: ItemChangeRecord[];
}

export type DesignPhase = "confirm" | "generating" | "proposal" | "reject" | "result" | "paused" | "accepted";

export interface DesignSession {
  id: number;
  /** The editor session (plan) the design session belongs to. */
  scope: string;
  flatId: string;
  roomId: string;
  /** The committed layout when the session started: every proposal is generated from it. */
  baseline: LayoutSnapshot;
  locks: LayoutLocks;
  startRevision: string;
  phase: DesignPhase;
  /** The interpretation waiting for confirmation, with preferences carried over from a restart. */
  pending: { interpretation: Interpretation; carried: PreferenceEntry[]; dropped: PreferenceEntry[] } | null;
  preferences: PreferenceEntry[];
  feedbackHistory: FeedbackEntry[];
  proposals: ProposalRecord[];
  avoid: Arrangement[];
  request: { id: number } | null;
  nextRequestId: number;
  /** The last generation outcome that was not a proposal. */
  outcome: Exclude<GenerationOutcome, { status: "found" | "cancelled" }> | { status: "error"; message: string } | { status: "cancelled" } | null;
  applied: AppliedRecord | null;
  round: number;
}

export interface DesignState {
  session: DesignSession | null;
  nextSessionId: number;
}

/** The structured part of a request, from the assistant's controls. */
export interface StructuredRequest {
  roomId: string;
  changeLittle: boolean;
  openZone: ZoneRef | null;
  closer: [string, string] | null;
  farther: [string, string] | null;
  keep: { itemId: string; allowRotation: boolean }[];
}

export type FurnitureLookup = (id: string) => FlatFurniture | undefined;
