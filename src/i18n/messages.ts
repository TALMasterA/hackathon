import { boundaryReduction } from "../lib/geometry/check-placement";
import type { FitResult, InputField, InputIssue, Language, PlacementViolation } from "../types/domain";
import { formatCm, translate } from "./dictionary";

export function inputMessage(issue: InputIssue, language: Language): string {
  return translate(language, issue.code, {
    field: translate(language, `form.field.${issue.field}`),
    minimum: issue.minimum ?? "",
    maximum: issue.maximum ?? "",
  });
}

export function violationMessage(violation: PlacementViolation, language: Language): string {
  switch (violation.code) {
    case "boundary":
      return translate(language, "violation.boundary", { excess: formatCm(violation.excess, language), side: translate(language, `side.${violation.side}`) });
    case "height":
      return translate(language, "violation.height", { excess: formatCm(violation.excess, language) });
    case "collision":
    case "reserved":
      return translate(language, `violation.${violation.code}`, { name: violation.name[language], x: formatCm(violation.overlapX, language), z: formatCm(violation.overlapZ, language) });
  }
}

export function correctionMessages(result: Extract<FitResult, { status: "invalid" }>, language: Language): string[] {
  const suggestions: string[] = [];
  for (const axis of ["x", "z"] as const) {
    const reduction = boundaryReduction(result, axis);
    if (reduction <= 0) continue;
    const unrotatedField = axis === "x" ? "width" : "depth";
    const rotatedField = axis === "x" ? "depth" : "width";
    const field: InputField = result.candidate.orientation === 0 ? unrotatedField : rotatedField;
    suggestions.push(translate(language, "suggestion.boundary", {
      field: translate(language, `form.field.${field}`),
      reduction: formatCm(reduction, language),
      axis: translate(language, axis === "x" ? "room.width" : "room.depth"),
    }));
  }
  const heightViolation = result.violations.find((violation) => violation.code === "height");
  if (heightViolation?.code === "height") suggestions.push(translate(language, "suggestion.height", { excess: formatCm(heightViolation.excess, language) }));
  if (result.violations.some((violation) => violation.code === "collision" || violation.code === "reserved")) {
    suggestions.push(translate(language, "suggestion.other"));
  }
  return suggestions;
}