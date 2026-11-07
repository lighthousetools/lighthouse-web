import { autocompletion, type Completion, type CompletionContext } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import { EditorState, RangeSetBuilder } from "@codemirror/state";
import {
  Decoration, EditorView, ViewPlugin, keymap, placeholder, type DecorationSet, type ViewUpdate,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { t, type Key } from "../i18n";

const highlight = HighlightStyle.define([
  { tag: tags.heading1, fontWeight: "500", color: "var(--strong)", fontSize: "1.15em" },
  { tag: tags.heading2, fontWeight: "500", color: "var(--strong)", fontSize: "1.05em" },
  { tag: tags.heading3, fontWeight: "500", color: "var(--ink2)" },
  { tag: tags.strong, fontWeight: "500", color: "var(--strong)" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.link, color: "var(--accent)" },
  { tag: tags.url, color: "var(--ink3)" },
  { tag: tags.quote, color: "var(--ink2)" },
  { tag: tags.monospace, color: "var(--ink2)" },
  { tag: tags.processingInstruction, color: "var(--ink3)" },
  { tag: tags.contentSeparator, color: "var(--ink3)" },
  { tag: tags.list, color: "var(--ink)" },
]);

const HIDDEN_MARKS = new Set(["HeaderMark", "EmphasisMark", "CodeMark"]);
const hidden = Decoration.replace({});

/** Hides formatting marks outside the line being edited, so text reads as text. */
function hideMarks(view: EditorView): DecorationSet {
  const { state } = view;
  const active = new Set(state.selection.ranges.map((range) => state.doc.lineAt(range.head).number));
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter(node) {
        if (!HIDDEN_MARKS.has(node.name)) return;
        const line = state.doc.lineAt(node.from);
        if (active.has(line.number) || node.node.parent?.name === "FencedCode") return;
        const end = node.name === "HeaderMark" ? Math.min(node.to + 1, line.to) : node.to;
        builder.add(node.from, end, hidden);
      },
    });
  }
  return builder.finish();
}

const liveFormatting = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = hideMarks(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = hideMarks(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

const COMMANDS: { label: Key; insert: string }[] = [
  { label: "slash.heading", insert: "# " },
  { label: "slash.subheading", insert: "## " },
  { label: "slash.list", insert: "- " },
  { label: "slash.numbered", insert: "1. " },
  { label: "slash.task", insert: "- [ ] " },
  { label: "slash.quote", insert: "> " },
  { label: "slash.table", insert: "| A | B |\n|---|---|\n|   |   |\n" },
  { label: "slash.code", insert: "```\n\n```\n" },
];

/** Offers Markdown blocks when a line starts with a slash. */
export function slashCommands(context: CompletionContext) {
  const line = context.state.doc.lineAt(context.pos);
  const before = line.text.slice(0, context.pos - line.from);
  if (!/^\/\p{L}*$/u.test(before)) return null;
  const options: Completion[] = COMMANDS.map(({ label, insert }, index) => ({
    label: `/${t(label)}`,
    displayLabel: t(label),
    apply: insert,
    boost: COMMANDS.length - index,
  }));
  return { from: line.from, options };
}

export function createEditor(
  parent: HTMLElement,
  doc: string,
  onChange: (text: string) => void,
) {
  return new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown(),
        syntaxHighlighting(highlight),
        liveFormatting,
        autocompletion({ override: [slashCommands], icons: false }),
        placeholder(t("brain.placeholder")),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ "aria-label": t("brain.write") }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChange(update.state.doc.toString());
        }),
      ],
    }),
  });
}
