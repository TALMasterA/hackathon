import { polygonDistance, polygonOverlap, rectanglePolygon } from "../../lib/geometry/oriented";
import type { FlatFurniture } from "../../types/domain";
import type { LayoutContext } from "./context";
import { isImproved, itemZoneOverlap, type Evaluation, type EvaluationScope } from "./evaluate";
import type { GenerationInput } from "./generate";
import { GENERATION_MODE, INTERPRETATION_MODE, type GenerationOutcome, type Message, type ProposalRecord, type SearchStats, type ValidationReport } from "./types";

/**
 * Deterministic explanation templates filled only from the candidate's own numbers: what changed,
 * which request it serves and the metric behind that, what got worse, what was checked and what was
 * not. Message keys are localised by the panel (src/i18n/assistant.ts).
 */

/** Distances between other pairs that change by more than this are reported as trade-offs (at most two). */
export const TRADE_OFF_DISTANCE_CM = 30;

const round = (value: number, places = 1) => Math.round(value * 10 ** places) / 10 ** places;

export function noResult(stats: SearchStats, blockers: Message[], suggestions: Message[]): GenerationOutcome {
  return { status: "none", blockers, suggestions, searched: stats };
}

export function buildProposal({ input, context, scope, baseline, candidate, evaluation, validation, stats, weight }: { input: GenerationInput; context: LayoutContext; scope: EvaluationScope; baseline: readonly FlatFurniture[]; candidate: readonly FlatFurniture[]; evaluation: Evaluation; validation: ValidationReport; stats: SearchStats; weight: number }): ProposalRecord {
  const changedIds = evaluation.changes.map((change) => change.id);
  const pinned = new Set(input.preferences.flatMap((preference) => preference.type === "keep-in-place" && preference.pose ? [preference.itemId] : []));
  const item = (furniture: readonly FlatFurniture[], id: string) => furniture.find((entry) => entry.id === id)!;

  const reasons = evaluation.changes.map((change) => {
    const messages: Message[] = [];
    const moved = change.displacement > 0.5;
    const turned = change.rotation > 0.5;
    messages.push(moved && turned
      ? { key: "reason.movedTurned", params: { item: { item: change.id }, distance: { cm: round(change.displacement) }, angle: { deg: round(change.rotation, 0) } } }
      : moved ? { key: "reason.moved", params: { item: { item: change.id }, distance: { cm: round(change.displacement) } } }
      : { key: "reason.turned", params: { item: { item: change.id }, angle: { deg: round(change.rotation, 0) } } });
    let linked = false;
    if (pinned.has(change.id)) {
      messages.push({ key: "reason.pinned", params: { item: { item: change.id } } });
      linked = true;
    }
    for (const goal of evaluation.goals) {
      if (!isImproved(goal.metric.outcome)) continue;
      const preference = goal.preference;
      if (preference.type === "open-zone") {
        if (preference.zone.kind === "item-front" && preference.zone.itemId === change.id) {
          messages.push({ key: "reason.zoneAnchor", params: { item: { item: change.id }, zone: { zone: preference.zone }, before: { m2: goal.metric.before }, after: { m2: goal.metric.after } } });
          linked = true;
          continue;
        }
        const before = itemZoneOverlap(scope, preference.zone, baseline, change.id);
        const after = itemZoneOverlap(scope, preference.zone, candidate, change.id);
        if (before - after > 0.0005) {
          messages.push({ key: "reason.zone", params: { item: { item: change.id }, zone: { zone: preference.zone }, before: { m2: before }, after: { m2: after }, total: { m2: goal.metric.after } } });
          linked = true;
        }
      } else if (preference.firstId === change.id || preference.secondId === change.id) {
        messages.push({ key: preference.direction === "closer" ? "reason.closer" : "reason.farther", params: { first: { item: preference.firstId }, second: { item: preference.secondId }, before: { cm: round(goal.metric.before) }, after: { cm: round(goal.metric.after) } } });
        linked = true;
      }
    }
    // An item moved off the spot another moved item now uses made room for it.
    for (const other of evaluation.changes) {
      if (other.id === change.id) continue;
      if (polygonOverlap(rectanglePolygon(item(baseline, change.id)), rectanglePolygon(item(candidate, other.id)))) {
        messages.push({ key: "reason.madeRoom", params: { item: { item: change.id }, other: { item: other.id } } });
        linked = true;
      }
    }
    if (!linked) messages.push({ key: "reason.noGoal", params: { item: { item: change.id } } });
    return { itemId: change.id, messages };
  });

  const tradeOffs: Message[] = [];
  for (const goal of evaluation.goals) {
    const { before, after, outcome } = goal.metric;
    const preference = goal.preference;
    if (preference.type === "open-zone") {
      if (outcome === "improved") tradeOffs.push({ key: "tradeoff.zonePartly", params: { zone: { zone: preference.zone }, after: { m2: after } } });
      else if (after - before > 0.0005) tradeOffs.push({ key: "tradeoff.zoneWorse", params: { zone: { zone: preference.zone }, before: { m2: before }, after: { m2: after } } });
    } else {
      const worse = preference.direction === "closer" ? after - before : before - after;
      if (worse > 0.5) tradeOffs.push({ key: preference.direction === "closer" ? "tradeoff.pairFarther" : "tradeoff.pairCloser", params: { first: { item: preference.firstId }, second: { item: preference.secondId }, before: { cm: round(before) }, after: { cm: round(after) } } });
    }
  }
  const goalPairs = new Set(input.preferences.flatMap((preference) => preference.type === "pair" ? [[preference.firstId, preference.secondId].sort().join("+")] : []));
  const distances: { first: string; second: string; before: number; after: number }[] = [];
  const roomItems = context.roomItems.map((entry) => entry.id);
  for (const [index, first] of roomItems.entries()) {
    for (const second of roomItems.slice(index + 1)) {
      if (!changedIds.includes(first) && !changedIds.includes(second)) continue;
      if (goalPairs.has([first, second].sort().join("+"))) continue;
      const before = polygonDistance(rectanglePolygon(item(baseline, first)), rectanglePolygon(item(baseline, second)));
      const after = polygonDistance(rectanglePolygon(item(candidate, first)), rectanglePolygon(item(candidate, second)));
      if (Math.abs(after - before) > TRADE_OFF_DISTANCE_CM) distances.push({ first, second, before, after });
    }
  }
  for (const entry of distances.sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before) || (a.first + a.second).localeCompare(b.first + b.second)).slice(0, 2)) {
    tradeOffs.push({ key: entry.after > entry.before ? "tradeoff.distanceUp" : "tradeoff.distanceDown", params: { first: { item: entry.first }, second: { item: entry.second }, before: { cm: round(entry.before) }, after: { cm: round(entry.after) } } });
  }
  const moved = evaluation.changes.reduce((sum, change) => sum + change.displacement, 0);
  tradeOffs.push({ key: "tradeoff.effort", params: { count: evaluation.changes.length, distance: { cm: round(moved) } } });

  const checks: Message[] = [
    { key: "check.room", params: { room: { room: input.roomId } } },
    { key: "check.collisions" },
    { key: "check.unchangedSizes" },
  ];
  if (validation.checkedLocks.position > 0) checks.push({ key: "check.positionLocks", params: { count: validation.checkedLocks.position } });
  if (validation.checkedLocks.distance > 0) checks.push({ key: "check.distanceLocks", params: { count: validation.checkedLocks.distance } });
  if (validation.keptItems > 0) checks.push({ key: "check.kept", params: { count: validation.keptItems } });
  if (validation.preExisting.length > 0) checks.push({ key: "check.preExisting", params: { count: validation.preExisting.length } });

  const unverified: Message[] = [
    { key: "unverified.route" },
    { key: "unverified.comfort" },
    { key: "unverified.real" },
    { key: "unverified.search", params: { step: { cm: stats.gridStep }, positions: stats.positionsPerItem } },
  ];
  const ranking: Message[] = [{ key: "ranking.order" }];
  if (weight > 1) ranking.push({ key: "ranking.changeLittle" });
  ranking.push({ key: "ranking.notStandard" });

  return {
    id: input.proposalId,
    version: input.version,
    inputRevision: input.inputRevision,
    roomId: input.roomId,
    changedIds,
    changes: evaluation.changes,
    reasons,
    metrics: evaluation.metrics,
    tradeOffs,
    checks,
    unverified,
    ranking,
    validation,
    interpretationMode: INTERPRETATION_MODE,
    generationMode: GENERATION_MODE,
    searched: stats,
    status: "preview",
  };
}
