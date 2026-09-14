import type { LayoutProject } from "./layout-engine";
export type ProjectHistory = {
  entries: LayoutProject[];
  position: number;
  group: string;
  time: number;
};
export type HistoryAction =
  | { type: "commit"; project: LayoutProject; group?: string; time: number }
  | { type: "undo" | "redo" | "end-group" }
  | { type: "restore"; project: LayoutProject };
export const createHistory = (project: LayoutProject): ProjectHistory => ({
  entries: [project],
  position: 0,
  group: "",
  time: 0,
});
export function projectHistory(
  state: ProjectHistory,
  action: HistoryAction,
): ProjectHistory {
  if (action.type === "restore") return createHistory(action.project);
  if (action.type === "end-group")
    return state.group ? { ...state, group: "" } : state;
  if (action.type === "undo" || action.type === "redo") {
    const position = Math.max(
      0,
      Math.min(
        state.entries.length - 1,
        state.position + (action.type === "undo" ? -1 : 1),
      ),
    );
    return { ...state, position, group: "" };
  }
  if (action.type !== "commit") return state;
  if (
    JSON.stringify(action.project) ===
    JSON.stringify(state.entries[state.position])
  )
    return state;
  const group = action.group ?? "";
  const merge =
    Boolean(group) &&
    group === state.group &&
    state.position > 0 &&
    state.position === state.entries.length - 1 &&
    action.time >= state.time &&
    action.time - state.time <= 750;
  const entries = (
    merge
      ? [...state.entries.slice(0, -1), action.project]
      : [...state.entries.slice(0, state.position + 1), action.project]
  ).slice(-51);
  return { entries, position: entries.length - 1, group, time: action.time };
}
