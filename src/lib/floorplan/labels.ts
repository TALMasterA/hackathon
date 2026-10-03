import type { Box } from "../geometry/architecture";
import type { PlanPoint } from "./scale";
import { isFlatType, type FlatType } from "./trace";

/** A text label of the source, in source units with y down: its box, top-left first. */
export interface TextBox {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScaleBarLabels {
  zero: TextBox;
  end: TextBox;
  metres: number;
}

const NUMBER = /^\d+(?:\.\d+)?$/;
const SAME_LINE = 0.5;
const BAR_REACH = 40;

/**
 * A metric scale bar from its labels: a "m" with numbers on the same line to its left, including 0.
 * The bar runs from the "0" to the largest number to its right (8 m on Housing Authority plans).
 */
export function findScaleBar(texts: readonly TextBox[]): ScaleBarLabels | null {
  for (const unit of texts.filter((text) => /^m$/i.test(text.text.trim()))) {
    const bottom = unit.y + unit.height;
    const numbers = texts.filter((text) => NUMBER.test(text.text.trim()) && Math.abs(text.y + text.height - bottom) <= unit.height * SAME_LINE && text.x < unit.x && unit.x - text.x <= unit.height * BAR_REACH);
    const zero = numbers.filter((text) => Number(text.text) === 0).sort((first, second) => second.x - first.x)[0];
    if (!zero) continue;
    const end = numbers.filter((text) => text.x > zero.x && Number(text.text) > 0).sort((first, second) => Number(second.text) - Number(first.text) || second.x - first.x)[0];
    if (end) return { zero, end, metres: Number(end.text) };
  }
  return null;
}

/** Where to look for a scale-bar tick: around the label's centre line, reaching past its bottom. */
export function tickSearch(label: TextBox): { tap: PlanPoint; radius: number } {
  return { tap: { x: label.x + label.width / 2, y: label.y + label.height * 1.5 }, radius: label.height * 1.2 };
}

/** The Housing Authority flat type labelled inside a box, when exactly one type is. */
export function flatTypeIn(texts: readonly TextBox[], box: Box): FlatType | null {
  const types = new Set(texts.filter((text) => {
    const x = text.x + text.width / 2;
    const y = text.y + text.height / 2;
    return isFlatType(text.text.trim()) && x >= box.minX && x <= box.maxX && y >= box.minZ && y <= box.maxZ;
  }).map((text) => text.text.trim() as FlatType));
  return types.size === 1 ? [...types][0] : null;
}
