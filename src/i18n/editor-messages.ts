import type { EditorInputIssue, Flat, FlatFurniture, Language, LayoutViolation, LockViolation, SuggestionReport } from "../types/domain";
import { formatCm } from "./dictionary";
import { editorText } from "./editor";

export function editorInputMessage(issue: EditorInputIssue, language: Language): string {
  return editorText(language, `editor.${issue.code}`, { field: editorText(language, `editor.field.${issue.field}`), minimum: issue.minimum ?? "", maximum: issue.maximum ?? "" });
}

export function layoutMessage(issue: LayoutViolation, flat: Flat, furniture: readonly FlatFurniture[], language: Language): string {
  const first = furniture.find((item) => item.id === issue.itemId)?.name[language] ?? issue.itemId;
  if (issue.code === "height") return editorText(language, "editor.warning.height", { first, excess: formatCm(issue.excess, language) });
  if (issue.code === "envelope") return editorText(language, "editor.warning.envelope", { first, side: editorText(language, `editor.side.${issue.side}`), excess: formatCm(issue.excess, language) });
  if (issue.code === "outside") return editorText(language, "editor.warning.outside", { first, depth: formatCm(issue.penetration, language), x: formatCm(issue.overlapX, language), z: formatCm(issue.overlapZ, language) });
  const objects = issue.code === "furniture" ? furniture : issue.code === "wall" ? flat.walls : flat.doors;
  const second = objects.find((object) => object.id === issue.obstacleId)?.name[language] ?? issue.obstacleId;
  return editorText(language, `editor.warning.${issue.code}`, { first, second, depth: formatCm(issue.penetration, language), x: formatCm(issue.overlapX, language), z: formatCm(issue.overlapZ, language) });
}

export function lockMessage(issue: LockViolation, furniture: readonly FlatFurniture[], language: Language): string {
  const name = (id: string) => furniture.find((item) => item.id === id)?.name[language] ?? id;
  return issue.code === "lock.position"
    ? editorText(language, "locks.positionViolation", { item: name(issue.itemId), distance: formatCm(issue.displacement, language) })
    : editorText(language, "locks.distanceViolation", { id: issue.lockId, first: name(issue.firstId), second: name(issue.secondId), required: formatCm(issue.required, language), actual: formatCm(issue.actual, language) });
}

export function suggestionMessage(report: SuggestionReport, language: Language): string {
  const added = report.added.length > 0 ? editorText(language, "suggest.added", { count: report.added.length }) : editorText(language, "suggest.none");
  if (report.skipped.length === 0) return added;
  const items = report.skipped.map((entry) => editorText(language, "suggest.item", { name: entry.name[language], reason: editorText(language, `suggest.reason.${entry.reason}`) })).join(editorText(language, "suggest.separator"));
  return `${added}${language === "en" ? " " : ""}${editorText(language, "suggest.skipped", { items })}`;
}
