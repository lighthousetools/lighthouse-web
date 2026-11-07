// Lays out an automation as a flow: the trigger on top, steps below, and an `if` with branches splitting into a
// `then` lane on the left and an `else` lane on the right that join again before the next step.
import { isBranch, type Step, type StepPath } from "./automation";

export const NODE_W = 260;
export const NODE_H = 104;
export const NODE_GAP = 64;
const EMPTY_H = 32;

export type FlowNode = { kind: "trigger" | Step["kind"]; path: StepPath | null; side?: "then" | "else"; step?: Step; x: number; y: number };
/** A place where a step can be added: after the last step of the main line or of a lane. */
export type FlowAdd = { path: StepPath; x: number; y: number };
export type Flow = { nodes: FlowNode[]; wires: string[]; adds: FlowAdd[]; width: number; height: number };

type Point = [number, number];

export function widthOf(steps: Step[]): number {
  return steps.reduce((width, step) => Math.max(width, isBranch(step) ? widthOf(step.then ?? []) + NODE_GAP + widthOf(step.else ?? []) : NODE_W), NODE_W);
}

const wire = ([x1, y1]: Point, [x2, y2]: Point) => `M${x1} ${y1} C${x1} ${y1 + 30},${x2} ${y2 - 30},${x2} ${y2}`;

export function layoutFlow(steps: Step[]): Flow {
  const width = widthOf(steps);
  const nodes: FlowNode[] = [];
  const wires: string[] = [];
  const adds: FlowAdd[] = [];

  const sequence = (list: Step[], cx: number, top: number, prefix: StepPath, side: "then" | "else" | undefined, entry: Point[]): { bottom: number; exits: Point[] } => {
    let y = top;
    let exits = entry;
    if (!list.length) {
      // An empty lane still shows where its first step goes.
      adds.push({ path: [...prefix, 0], x: cx, y });
      for (const point of exits) wires.push(wire(point, [cx, y]));
      return { bottom: y + EMPTY_H, exits: [[cx, y + EMPTY_H]] };
    }
    list.forEach((step, index) => {
      const path = [...prefix, index];
      nodes.push({ kind: step.kind, path, side, step, x: cx - NODE_W / 2, y });
      for (const point of exits) wires.push(wire(point, [cx, y]));
      exits = [[cx, y + NODE_H]];
      y += NODE_H + NODE_GAP;
      if (isBranch(step)) {
        const thenWidth = widthOf(step.then ?? []);
        const elseWidth = widthOf(step.else ?? []);
        const total = thenWidth + NODE_GAP + elseWidth;
        const left = sequence(step.then ?? [], cx - total / 2 + thenWidth / 2, y, [...path, "then"], "then", exits);
        const right = sequence(step.else ?? [], cx + total / 2 - elseWidth / 2, y, [...path, "else"], "else", exits);
        exits = [...left.exits, ...right.exits];
        y = Math.max(left.bottom, right.bottom) + NODE_GAP;
      }
    });
    if (prefix.length) adds.push({ path: [...prefix, list.length], x: cx, y: y - NODE_GAP + 8 });
    return { bottom: y - NODE_GAP, exits };
  };

  const cx = width / 2;
  nodes.push({ kind: "trigger", path: null, x: cx - NODE_W / 2, y: 0 });
  const main = sequence(steps, cx, NODE_H + NODE_GAP, [], undefined, [[cx, NODE_H]]);
  if (steps.length) adds.push({ path: [steps.length], x: cx, y: main.bottom + 8 });
  return { nodes, wires, adds, width, height: main.bottom + 48 };
}
