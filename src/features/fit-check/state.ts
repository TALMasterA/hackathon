import { DEFAULT_INPUT } from "../../data/preset";
import type { FitResult, InputField, Language, Orientation, ReplacementInput } from "../../types/domain";

export type SceneView = "before" | "after";

export interface FitInState {
  input: ReplacementInput;
  language: Language;
  selectedId: string;
  result: FitResult | null;
  view: SceneView;
  hasChecked: boolean;
  dirty: boolean;
  demoRevision: number;
}

export const INITIAL_STATE: FitInState = {
  input: { ...DEFAULT_INPUT },
  language: "en",
  selectedId: "old-sofa",
  result: null,
  view: "before",
  hasChecked: false,
  dirty: false,
  demoRevision: 0,
};

export type FitInAction =
  | { type: "field"; field: InputField; value: string }
  | { type: "orientation"; orientation: Orientation }
  | { type: "select"; id: string }
  | { type: "language"; language: Language }
  | { type: "check"; result: FitResult }
  | { type: "view"; view: SceneView }
  | { type: "reset" };

export function fitInReducer(state: FitInState, action: FitInAction): FitInState {
  switch (action.type) {
    case "field":
      if (state.input[action.field] === action.value) return state;
      return { ...state, input: { ...state.input, [action.field]: action.value }, result: null, view: "before", dirty: true };
    case "orientation":
      if (state.input.orientation === action.orientation) return state;
      return { ...state, input: { ...state.input, orientation: action.orientation }, result: null, view: "before", dirty: true };
    case "select":
      if (state.selectedId === action.id) return state;
      return { ...state, selectedId: action.id, result: null, view: "before", dirty: true };
    case "language":
      return { ...state, language: action.language };
    case "check":
      return { ...state, result: action.result, hasChecked: true, dirty: false, view: action.result.status === "valid" ? "after" : "before" };
    case "view":
      return action.view === "after" && state.result?.status !== "valid" ? state : { ...state, view: action.view };
    case "reset":
      return { ...INITIAL_STATE, input: { ...DEFAULT_INPUT }, language: state.language, demoRevision: state.demoRevision + 1 };
  }
}