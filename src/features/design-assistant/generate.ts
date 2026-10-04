import { containingRoom } from "../../lib/geometry/architecture";
import { itemViolations } from "../../lib/geometry/layout";
import { distanceLockViolations } from "../../lib/geometry/locks";
import { normalizeAngle, polygonOverlap, rectanglePolygon } from "../../lib/geometry/oriented";
import type { Flat, FlatFurniture, LayoutLocks, LayoutSnapshot, Position2D } from "../../types/domain";
import { getLayoutContext, insideRoom, type LayoutContext } from "./context";
import { evaluatePreferences, hitsAvoided, itemZoneOverlap, validateLayout, type Evaluation, type EvaluationScope } from "./evaluate";
import { buildProposal, noResult } from "./explain";
import { angleDifference, isGoal } from "./preferences";
import type { Arrangement, GenerationOutcome, Message, Pose, Preference, SearchStats } from "./types";

/**
 * generateLayoutCandidates: a bounded, deterministic heuristic search from the baseline layout. It
 * never touches the editor's state: it reads plain values and returns a proposal record (or why there
 * is none). It is not exhaustive and not a guarantee of the best possible layout.
 */
export const SEARCH_LIMITS = {
  /** Grid step: the room's shorter side / 16, kept between 10 and 25 cm, then widened until at most 600 positions per rotation. */
  stepDivisor: 16,
  minStepCm: 10,
  maxStepCm: 25,
  maxPositions: 600,
  /** Rotations tried, added to the item's original angle. */
  rotations: [0, 90, 180, 270],
  /** Best single moves per item combined into two-item changes. */
  topPerItem: 6,
  /** Moves of a blocking item tried to make room for another. */
  makeRoomMoves: 12,
  /** Two arrangements are the same when every item is within 15 cm and 10 degrees. */
  repeatToleranceCm: 15,
  repeatToleranceDeg: 10,
  /** Under "change as little as possible", the size of the change counts three times as much. */
  changeLittleWeight: 3,
  /** Candidates re-validated with the full layout check before giving up. */
  revalidateAttempts: 25,
  deadlineMs: 8000,
  sliceMs: 12,
} as const;

export interface GenerationInput {
  flat: Flat;
  roomId: string;
  baseline: LayoutSnapshot;
  locks: LayoutLocks;
  preferences: readonly Preference[];
  /** Arrangements already shown or rejected in this session; never proposed again. */
  avoid: readonly Arrangement[];
  version: number;
  proposalId: string;
  inputRevision: string;
}

interface Move {
  itemId: string;
  item: FlatFurniture;
  polygon: Position2D[];
  /** The one other movable item this pose overlaps at its original place, if any. */
  collides: string | null;
  evaluation: Evaluation;
  key: RankKey;
}

interface Candidate {
  furniture: FlatFurniture[];
  evaluation: Evaluation;
  key: RankKey;
}

type RankKey = [improved: number, score: number, signature: string];

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

function signature(furniture: readonly FlatFurniture[], evaluation: Evaluation): string {
  return evaluation.changes.map((change) => `${change.id}@${Math.round(change.to.position.x)},${Math.round(change.to.position.z)},${Math.round(change.to.orientation)}`).join(";") || furniture.length.toString();
}

/** Higher is better: goals improved first, then improvement against the size of the change. */
function rankKey(furniture: readonly FlatFurniture[], evaluation: Evaluation, weight: number): RankKey {
  const gain = evaluation.goals.reduce((sum, goal) => sum + goal.gain, 0) * 10;
  return [evaluation.improved, Math.round((gain - weight * evaluation.cost) * 1000) / 1000, signature(furniture, evaluation)];
}

const better = (first: RankKey, second: RankKey) => first[0] !== second[0] ? second[0] - first[0] : first[1] !== second[1] ? second[1] - first[1] : first[2] < second[2] ? -1 : first[2] > second[2] ? 1 : 0;

/** True when the candidate puts every item within tolerance of an earlier arrangement. */
export function repeatsArrangement(baseline: readonly FlatFurniture[], candidate: readonly FlatFurniture[], arrangement: Arrangement): boolean {
  const ids = new Set([...Object.keys(arrangement.poses), ...candidate.filter((item) => {
    const previous = baseline.find((entry) => entry.id === item.id);
    return previous && (Math.hypot(item.position.x - previous.position.x, item.position.z - previous.position.z) > 0.5 || angleDifference(item.orientation, previous.orientation) > 0.5);
  }).map((item) => item.id)]);
  for (const id of ids) {
    const item = candidate.find((entry) => entry.id === id);
    const original = baseline.find((entry) => entry.id === id);
    const shown: Pose | undefined = arrangement.poses[id] ?? (original && { position: original.position, orientation: original.orientation });
    if (!item || !shown) return false;
    if (Math.hypot(item.position.x - shown.position.x, item.position.z - shown.position.z) > SEARCH_LIMITS.repeatToleranceCm || angleDifference(item.orientation, shown.orientation) > SEARCH_LIMITS.repeatToleranceDeg) return false;
  }
  return true;
}

/** Grid steps of the search for a room: its shorter side / 16 between 10 and 25 cm. */
export function gridStep(context: Pick<LayoutContext, "shape">): number {
  const { bounds } = context.shape;
  return Math.min(SEARCH_LIMITS.maxStepCm, Math.max(SEARCH_LIMITS.minStepCm, Math.min(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / SEARCH_LIMITS.stepDivisor));
}

/** Centre positions for an item at one angle: a grid over the room's bounds plus the positions flush with each side. */
function gridPositions(context: LayoutContext, item: FlatFurniture, angle: number, step: number): Position2D[] {
  const { bounds } = context.shape;
  const radians = angle * Math.PI / 180;
  const halfX = Math.abs(item.width / 2 * Math.cos(radians)) + Math.abs(item.depth / 2 * Math.sin(radians));
  const halfZ = Math.abs(item.width / 2 * Math.sin(radians)) + Math.abs(item.depth / 2 * Math.cos(radians));
  const axis = (low: number, high: number, size: number) => {
    if (high < low) return [];
    const values: number[] = [];
    for (let value = low; value <= high + 1e-6; value += size) values.push(Math.round(value * 100) / 100);
    if (high - values[values.length - 1] > 0.5) values.push(Math.round(high * 100) / 100);
    return values;
  };
  let size = step;
  let xs = axis(bounds.minX + halfX, bounds.maxX - halfX, size);
  let zs = axis(bounds.minZ + halfZ, bounds.maxZ - halfZ, size);
  while (xs.length * zs.length > SEARCH_LIMITS.maxPositions) {
    size *= 1.25;
    xs = axis(bounds.minX + halfX, bounds.maxX - halfX, size);
    zs = axis(bounds.minZ + halfZ, bounds.maxZ - halfZ, size);
  }
  return xs.flatMap((x) => zs.map((z) => ({ x, z })));
}

function replace(furniture: readonly FlatFurniture[], moved: readonly FlatFurniture[]): FlatFurniture[] {
  return furniture.map((item) => moved.find((entry) => entry.id === item.id) ?? item);
}

function* search(input: GenerationInput, stats: SearchStats): Generator<void, GenerationOutcome> {
  const context = getLayoutContext({ flat: input.flat, current: input.baseline, locks: input.locks }, input.roomId);
  if (!context) return noResult(stats, [{ key: "blocker.noRoom" }], []);
  const { flat } = context;
  const ceiling = input.baseline.ceilingHeight;
  const preferences = input.preferences;
  const scope: EvaluationScope = { flat, shape: context.shape, roomItemIds: context.roomItems.map((item) => item.id) };
  const baseline = input.baseline.furniture;
  const goals = preferences.filter(isGoal);
  if (goals.length === 0) return noResult(stats, [{ key: "blocker.noGoal" }], [{ key: "suggestion.addGoal" }]);
  const changeLittle = preferences.find((preference) => preference.type === "minimise-changes");
  const weight = changeLittle ? SEARCH_LIMITS.changeLittleWeight : 1;
  const maxChanged = changeLittle?.type === "minimise-changes" ? changeLittle.maxChangedItems ?? Infinity : Infinity;
  const keeps = preferences.filter((preference) => preference.type === "keep-in-place");
  const roomIds = new Set(scope.roomItemIds);
  const pinned = keeps.filter((keep) => keep.pose && roomIds.has(keep.itemId));
  const fixed = new Set(keeps.filter((keep) => !keep.pose && !keep.allowRotation).map((keep) => keep.itemId));
  const turnOnly = new Set([...context.rotationOnly, ...keeps.filter((keep) => !keep.pose && keep.allowRotation).map((keep) => keep.itemId)]);
  const pinnedIds = new Set(pinned.map((keep) => keep.itemId));

  // The pose the user chose from a proposal is placed first; every candidate starts from it.
  const base = baseline.map((item) => {
    const keep = pinned.find((entry) => entry.itemId === item.id);
    return keep?.pose ? { ...item, position: { ...keep.pose.position }, orientation: normalizeAngle(keep.pose.orientation) } : item;
  });
  const baseEvaluation = evaluatePreferences(scope, baseline, baseline, preferences);
  if (baseEvaluation.goals.length === 0) return noResult(stats, [{ key: "blocker.goalUnavailable" }], [{ key: "suggestion.otherGoal" }]);
  if (pinned.length === 0 && baseEvaluation.goals.every((goal) => goal.metric.outcome === "already-met")) return { status: "baseline-meets-goals", metrics: baseEvaluation.metrics };

  const movers = context.roomItems.filter((item) => !fixed.has(item.id) && !pinnedIds.has(item.id));
  const moverIds = new Set(movers.map((item) => item.id));
  const step = gridStep(context);
  stats.items = movers.length;
  stats.rotationOnly = movers.filter((item) => turnOnly.has(item.id)).length;
  stats.gridStep = Math.round(step * 10) / 10;
  const relatedLocks = (ids: readonly string[]) => input.locks.distance.filter((lock) => ids.includes(lock.firstId) || ids.includes(lock.secondId));
  const roomOf = (item: FlatFurniture) => containingRoom(flat, item.position)?.id;
  const evaluate = (furniture: readonly FlatFurniture[]) => {
    const evaluation = evaluatePreferences(scope, baseline, furniture, preferences);
    return { evaluation, key: rankKey(furniture, evaluation, weight) };
  };

  const moves = new Map<string, Move[]>();
  let lastYield = now();
  for (const item of movers) {
    const list: Move[] = [];
    const angles = [...new Set(SEARCH_LIMITS.rotations.map((turn) => normalizeAngle(Math.round((item.orientation + turn) * 1e6) / 1e6)))];
    for (const angle of angles) {
      const positions = turnOnly.has(item.id) ? [item.position] : [...gridPositions(context, item, angle, step), item.position];
      stats.positionsPerItem = Math.max(stats.positionsPerItem, positions.length);
      for (const position of positions) {
        if (Math.hypot(position.x - item.position.x, position.z - item.position.z) <= 0.5 && angleDifference(angle, item.orientation) <= 0.5) continue;
        stats.movesTried++;
        const moved: FlatFurniture = { ...item, position: { x: position.x, z: position.z }, orientation: angle };
        const polygon = rectanglePolygon(moved);
        if (!insideRoom(context.shape, polygon, moved) || roomOf(moved) !== input.roomId) continue;
        const layout = replace(base, [moved]);
        let collides: string | null = null;
        let valid = true;
        for (const violation of itemViolations(flat, layout, item.id, ceiling)) {
          const other = violation.code === "furniture" ? (violation.itemId === item.id ? violation.obstacleId : violation.itemId) : null;
          if (other && moverIds.has(other) && (collides === null || collides === other)) collides = other;
          else valid = false;
          if (!valid) break;
        }
        if (!valid) continue;
        const locks = relatedLocks([item.id]).filter((lock) => lock.firstId !== collides && lock.secondId !== collides);
        if (locks.length > 0 && distanceLockViolations(layout, locks).length > 0) continue;
        // Counted only for poses that pass every check, so the number reported is what the user's rejection removed.
        if (hitsAvoided(preferences, moved)) {
          stats.filteredAvoided++;
          continue;
        }
        stats.movesValid++;
        const { evaluation, key } = evaluate(layout);
        list.push({ itemId: item.id, item: moved, polygon, collides, evaluation, key });
        if (now() - lastYield > 4) {
          yield;
          lastYield = now();
        }
      }
    }
    moves.set(item.id, list.sort((first, second) => better(first.key, second.key)));
  }

  const candidates: Candidate[] = [];
  const pinnedChanges = base.filter((item, index) => item !== baseline[index]).length;
  const consider = (moved: readonly FlatFurniture[]) => {
    stats.combinationsTried++;
    const furniture = replace(base, moved);
    const ids = [...moved.map((item) => item.id), ...pinnedIds];
    const { evaluation, key } = evaluate(furniture);
    if (evaluation.changes.length === 0 || evaluation.changes.length > maxChanged) return;
    if (evaluation.improved === 0 || evaluation.worsened > 0) return;
    const locks = relatedLocks(ids);
    if (locks.length > 0 && distanceLockViolations(furniture, locks).length > 0) return;
    for (const id of pinnedIds) if (itemViolations(flat, furniture, id, ceiling).length > 0) return;
    if (input.avoid.some((arrangement) => repeatsArrangement(baseline, furniture, arrangement))) {
      stats.skippedAsRepeat++;
      return;
    }
    candidates.push({ furniture, evaluation, key });
  };

  if (pinned.length > 0) consider([]);
  for (const list of moves.values()) for (const move of list) if (move.collides === null) consider([move.item]);
  yield;
  if (maxChanged - pinnedChanges >= 2) {
    const items = [...moves.keys()];
    for (const first of items) {
      const firstMoves = moves.get(first)!;
      // Make room: a good move blocked by one movable item, with that item moved out of the way.
      for (const move of firstMoves.filter((entry) => entry.collides !== null).slice(0, SEARCH_LIMITS.topPerItem)) {
        const blocker = moves.get(move.collides!) ?? [];
        const room = blocker.filter((other) => (other.collides === null || other.collides === first) && !polygonOverlap(other.polygon, move.polygon))
          .sort((a, b) => a.evaluation.cost - b.evaluation.cost || better(a.key, b.key))
          .slice(0, SEARCH_LIMITS.makeRoomMoves);
        for (const other of room) consider([move.item, other.item]);
      }
      // Two separate changes: the best clean moves of two items together.
      for (const second of items) {
        if (second <= first) continue;
        const a = firstMoves.filter((entry) => entry.collides === null).slice(0, SEARCH_LIMITS.topPerItem);
        const b = moves.get(second)!.filter((entry) => entry.collides === null).slice(0, SEARCH_LIMITS.topPerItem);
        for (const one of a) for (const two of b) if (!polygonOverlap(one.polygon, two.polygon)) consider([one.item, two.item]);
      }
      yield;
    }
  }

  candidates.sort((first, second) => better(first.key, second.key));
  for (const candidate of candidates.slice(0, SEARCH_LIMITS.revalidateAttempts)) {
    const validation = validateLayout({ flat, shape: context.shape, ceilingHeight: ceiling, baseline, candidate: candidate.furniture, locks: input.locks, preferences });
    if (!validation.feasible) continue;
    return { status: "found", proposal: buildProposal({ input, context, scope, baseline, candidate: candidate.furniture, evaluation: candidate.evaluation, validation, stats, weight }) };
  }
  return noResult(stats, ...explainNone({ context, scope, preferences, baseline, stats, maxChanged, fixed, turnOnly, movesFound: [...moves.values()].some((list) => list.length > 0) }));
}

/** Blockers and user-controlled changes for a search that found nothing new and suitable. */
function explainNone({ context, scope, preferences, baseline, stats, maxChanged, fixed, turnOnly, movesFound }: { context: LayoutContext; scope: EvaluationScope; preferences: readonly Preference[]; baseline: readonly FlatFurniture[]; stats: SearchStats; maxChanged: number; fixed: Set<string>; turnOnly: Set<string>; movesFound: boolean }): [Message[], Message[]] {
  const blockers: Message[] = [];
  const suggestions: Message[] = [];
  for (const preference of preferences) {
    if (preference.type === "open-zone") {
      for (const item of context.roomItems) {
        if (preference.zone.kind === "item-front" && preference.zone.itemId === item.id) continue;
        if (itemZoneOverlap(scope, preference.zone, baseline, item.id) <= 0) continue;
        if (fixed.has(item.id)) {
          blockers.push({ key: "blocker.zoneKept", params: { item: { item: item.id }, zone: { zone: preference.zone } } });
          suggestions.push({ key: "suggestion.unkeep", params: { item: { item: item.id } } });
        } else if (turnOnly.has(item.id)) {
          blockers.push({ key: context.rotationOnly.includes(item.id) ? "blocker.zoneLocked" : "blocker.zoneTurnOnly", params: { item: { item: item.id }, zone: { zone: preference.zone } } });
          suggestions.push({ key: context.rotationOnly.includes(item.id) ? "suggestion.unlock" : "suggestion.unkeep", params: { item: { item: item.id } } });
        }
      }
      suggestions.push({ key: "suggestion.smallerZone", params: { zone: { zone: preference.zone } } });
    }
    if (preference.type === "pair") {
      const blocked = [preference.firstId, preference.secondId].filter((id) => fixed.has(id) || !context.roomItems.some((item) => item.id === id));
      if (blocked.length === 2) blockers.push({ key: "blocker.pairFixed", params: { first: { item: preference.firstId }, second: { item: preference.secondId } } });
      const lock = context.locks.distance.find((entry) => [entry.firstId, entry.secondId].sort().join() === [preference.firstId, preference.secondId].sort().join());
      if (lock) {
        blockers.push({ key: "blocker.pairLock", params: { first: { item: preference.firstId }, second: { item: preference.secondId }, minimum: { cm: lock.minimum } } });
        suggestions.push({ key: "suggestion.editLock" });
      }
    }
    if (preference.type === "minimise-changes" && preference.maxChangedItems !== undefined) {
      blockers.push({ key: "blocker.limit", params: { count: preference.maxChangedItems } });
      suggestions.push({ key: "suggestion.removeLimit" });
    }
  }
  if (stats.filteredAvoided > 0) {
    blockers.push({ key: "blocker.avoided", params: { count: stats.filteredAvoided } });
    suggestions.push({ key: "suggestion.removeAvoided" });
  }
  if (stats.skippedAsRepeat > 0) blockers.push({ key: "blocker.repeats", params: { count: stats.skippedAsRepeat } });
  if (!movesFound) blockers.push({ key: "blocker.noSpace" });
  if (context.locks.distance.some((lock) => scope.roomItemIds.includes(lock.firstId) || scope.roomItemIds.includes(lock.secondId))) blockers.push({ key: "blocker.distanceLocks" });
  if (maxChanged === Infinity && blockers.length === 0) blockers.push({ key: "blocker.noImprovement" });
  suggestions.push({ key: "suggestion.otherGoal" });
  const unique = (messages: Message[]) => messages.filter((message, index) => messages.findIndex((other) => JSON.stringify(other) === JSON.stringify(message)) === index);
  return [unique(blockers), unique(suggestions)];
}

export function emptyStats(): SearchStats {
  return { items: 0, rotationOnly: 0, gridStep: 0, positionsPerItem: 0, movesTried: 0, movesValid: 0, combinationsTried: 0, skippedAsRepeat: 0, filteredAvoided: 0, elapsedMs: 0 };
}

/** The whole search at once, for tests and for callers that can block. */
export function generateLayoutCandidatesSync(input: GenerationInput): GenerationOutcome {
  const stats = emptyStats();
  const started = now();
  const iterator = search(input, stats);
  let step = iterator.next();
  while (!step.done) step = iterator.next();
  stats.elapsedMs = Math.round(now() - started);
  return step.value;
}

/**
 * The search in slices of about 12 ms with a yield to the browser between them, so the page stays
 * responsive. Cancelling (the signal) or passing the deadline stops it; the caller ignores results of
 * superseded requests.
 */
export async function generateLayoutCandidates(input: GenerationInput, options: { signal?: AbortSignal; deadlineMs?: number; yieldToBrowser?: () => Promise<void> } = {}): Promise<GenerationOutcome> {
  const stats = emptyStats();
  const started = now();
  const deadline = started + (options.deadlineMs ?? SEARCH_LIMITS.deadlineMs);
  const pause = options.yieldToBrowser ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  const iterator = search(input, stats);
  let slice = now();
  for (;;) {
    if (options.signal?.aborted) return { status: "cancelled" };
    const step = iterator.next();
    if (step.done) {
      stats.elapsedMs = Math.round(now() - started);
      return step.value;
    }
    if (now() > deadline) {
      stats.elapsedMs = Math.round(now() - started);
      return { status: "timed-out", searched: stats };
    }
    if (now() - slice >= SEARCH_LIMITS.sliceMs) {
      await pause();
      slice = now();
    }
  }
}
