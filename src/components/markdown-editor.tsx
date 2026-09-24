import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownKeymap } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { Editor } from "@tiptap/core";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import type { JSX } from "@solidjs/web";
import { Show, createEffect, createSignal, onSettled, untrack } from "solid-js";

import { Button } from "~/components/button";
import { Bold, Code, Columns2, Eye, FileCode, Heading, Italic, List } from "~/components/icons";
import { ScrollArea } from "~/components/scroll-area";
import { Tooltip } from "~/components/tooltip";
import { t } from "~/lib/i18n";
import { cn } from "~/lib/utils";
import * as m from "~/paraglide/messages";

type EditorMode = "visual" | "split" | "raw";

// Destaque só com as cores do tema. CodeMirror 6 (sem basicSetup) fica leve:
// histórico, quebra de linha e o keymap de lista/citação do markdown.
const markdownHighlight = HighlightStyle.define([
  { tag: [tags.heading1, tags.heading2], fontWeight: "650" },
  { tag: [tags.heading3, tags.heading4, tags.heading5, tags.heading6], fontWeight: "600" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: [tags.link, tags.url], color: "var(--primary)" },
  { tag: tags.monospace, backgroundColor: "color-mix(in oklch, var(--muted) 70%, transparent)" },
  { tag: [tags.quote, tags.meta, tags.comment], color: "var(--muted-foreground)" },
  { tag: [tags.processingInstruction, tags.contentSeparator, tags.labelName], color: "var(--muted-foreground)" },
]);

const sourceTheme = EditorView.theme({
  "&": {
    minHeight: "100%",
    backgroundColor: "transparent",
    color: "var(--foreground)",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    overflow: "visible",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
  },
  ".cm-content": {
    padding: "12px",
    caretColor: "var(--foreground)",
    minHeight: "100%",
  },
  ".cm-line": { padding: "0" },
  ".cm-gutters": { display: "none" },
});

// TipTap core (sem React). O markdown entra e sai como texto; o frontmatter
// fica fora deste componente para o round-trip não reescrever o bloco YAML.
// O modo raw edita essa mesma string; o visual e o dividido leem o documento
// do TipTap. Enquanto o foco está na fonte, o documento é atualizado sem
// devolver o markdown normalizado, para o cursor da textarea não saltar.
export function MarkdownEditor(props: {
  actions?: JSX.Element;
  initial: string;
  onChange: (markdown: string) => void;
}) {
  let host: HTMLDivElement | undefined;
  let rawHost: HTMLDivElement | undefined;
  let rawViewport: HTMLElement | undefined;
  let source: EditorView | undefined;
  let applyingRaw = false;
  let applyingFromSource = false;
  const [editor, setEditor] = createSignal<Editor>();
  const [rev, setRev] = createSignal(0);
  const [view, setView] = createSignal<EditorMode>("visual");

  onSettled(() => {
    const element = host;
    if (!element) return;
    const notify = untrack(() => props.onChange);
    const instance = new Editor({
      content: untrack(() => props.initial),
      contentType: "markdown",
      editorProps: {
        attributes: {
          class:
            "prose prose-sm min-h-full max-w-none px-3 py-3 outline-none focus:outline-none focus-visible:outline-none dark:prose-invert prose-code:before:content-none prose-code:after:content-none",
        },
      },
      element,
      extensions: [StarterKit, Markdown],
      onTransaction: () => setRev((value) => value + 1),
      onUpdate: ({ editor: current }) => {
        if (applyingRaw) return;
        const next = current.getMarkdown();
        notify(next);
        syncSource(next);
      },
    });
    setEditor(instance);
    return () => {
      instance.destroy();
      setEditor(undefined);
    };
  });

  const syncSource = (next: string) => {
    const cm = source;
    if (!cm || applyingFromSource || cm.state.doc.toString() === next) return;
    applyingFromSource = true;
    cm.dispatch({ changes: { from: 0, to: cm.state.doc.length, insert: next } });
    applyingFromSource = false;
  };

  const revealCaret = (cm: EditorView) => {
    const viewport = rawViewport;
    if (!viewport) return;
    const coords = cm.coordsAtPos(cm.state.selection.main.head);
    if (!coords) return;
    const box = viewport.getBoundingClientRect();
    const pad = 24;
    if (coords.bottom > box.bottom - pad) viewport.scrollTop += coords.bottom - (box.bottom - pad);
    else if (coords.top < box.top + pad) viewport.scrollTop -= box.top + pad - coords.top;
  };

  onSettled(() => {
    const parent = rawHost;
    if (!parent) return;
    const notify = untrack(() => props.onChange);
    const cm = new EditorView({
      parent,
      state: EditorState.create({
        doc: untrack(() => props.initial),
        extensions: [
          EditorView.lineWrapping,
          history(),
          keymap.of([...markdownKeymap, ...defaultKeymap, ...historyKeymap]),
          markdown(),
          syntaxHighlighting(markdownHighlight),
          sourceTheme,
          EditorView.updateListener.of((update) => {
            if (applyingFromSource) return;
            if (update.docChanged) {
              const next = update.state.doc.toString();
              notify(next);
              const current = editor();
              if (current) {
                applyingRaw = true;
                try {
                  current.commands.setContent(next, { contentType: "markdown", emitUpdate: false });
                } catch {
                  // Markdown incompleto fica na fonte até o parse voltar a ser válido.
                } finally {
                  applyingRaw = false;
                }
              }
            }
            if (update.docChanged || update.selectionSet) revealCaret(update.view);
          }),
        ],
      }),
    });
    source = cm;
    return () => {
      cm.destroy();
      source = undefined;
    };
  });

  createEffect(
    () => view(),
    (next) => {
      source?.requestMeasure();
      if (next === "raw") source?.focus();
    },
  );

  const selectView = (next: EditorMode) => {
    setView(next);
  };

  const active = (name: string, attrs?: Record<string, unknown>) => {
    rev();
    return editor()?.isActive(name, attrs) ?? false;
  };

  const run = (apply: (current: Editor) => void) => {
    const current = editor();
    if (current) apply(current);
  };

  return (
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-input transition-[border-color,box-shadow] focus-within:border-ring/50 focus-within:ring-2 focus-within:ring-ring/30 [&_.ProseMirror]:outline-none [&_.ProseMirror]:focus:outline-none [&_.ProseMirror]:focus-visible:outline-none [&_[data-slot=scroll-area-viewport]]:outline-none [&_[data-slot=scroll-area-viewport]]:focus-visible:ring-0">
      <div class="flex shrink-0 flex-wrap items-center gap-1 border-b border-hairline p-1.5">
        <MarkButton
          active={active("bold")}
          disabled={view() === "raw"}
          icon={<Bold size={16} />}
          label={t(() => m.page_edit_bold())}
          onClick={() => run((current) => current.chain().focus().toggleBold().run())}
        />
        <MarkButton
          active={active("italic")}
          disabled={view() === "raw"}
          icon={<Italic size={16} />}
          label={t(() => m.page_edit_italic())}
          onClick={() => run((current) => current.chain().focus().toggleItalic().run())}
        />
        <MarkButton
          active={active("heading", { level: 2 })}
          disabled={view() === "raw"}
          icon={<Heading size={16} />}
          label={t(() => m.page_edit_heading())}
          onClick={() => run((current) => current.chain().focus().toggleHeading({ level: 2 }).run())}
        />
        <MarkButton
          active={active("bulletList")}
          disabled={view() === "raw"}
          icon={<List size={16} />}
          label={t(() => m.page_edit_list())}
          onClick={() => run((current) => current.chain().focus().toggleBulletList().run())}
        />
        <MarkButton
          active={active("codeBlock")}
          disabled={view() === "raw"}
          icon={<Code size={16} />}
          label={t(() => m.page_edit_code())}
          onClick={() => run((current) => current.chain().focus().toggleCodeBlock().run())}
        />
        <ViewSwitch value={view()} onChange={selectView} />
        <Show when={props.actions}>
          <div class="flex shrink-0 items-center gap-0.5">{props.actions}</div>
        </Show>
      </div>
      <div class="flex min-h-0 flex-1">
        <ScrollArea
          fill
          class={cn(
            "min-h-0 min-w-0 flex-1",
            view() === "visual" && "hidden",
            view() === "split" && "border-r border-hairline",
          )}
          tabIndex={-1}
          viewportRef={(el) => {
            rawViewport = el ?? undefined;
          }}
        >
          <div ref={rawHost} class="min-h-full" data-testid="markdown-source" />
        </ScrollArea>
        <ScrollArea
          fill
          class={cn("min-h-0 min-w-0 flex-1", view() === "raw" && "hidden")}
          tabIndex={-1}
        >
          <div ref={host} data-testid="markdown-editor" />
        </ScrollArea>
      </div>
    </div>
  );
}

function ViewSwitch(props: { onChange: (value: EditorMode) => void; value: EditorMode }) {
  const items: Array<{ icon: JSX.Element; label: () => string; value: EditorMode }> = [
    { icon: <Eye size={14} />, label: () => m.page_edit_mode_visual(), value: "visual" },
    { icon: <Columns2 size={14} />, label: () => m.page_edit_mode_split(), value: "split" },
    { icon: <FileCode size={14} />, label: () => m.page_edit_mode_raw(), value: "raw" },
  ];
  const onKeyDown = (event: KeyboardEvent) => {
    const order = items.map((item) => item.value);
    const index = order.indexOf(props.value);
    const next =
      event.key === "ArrowRight" ? order[(index + 1) % order.length]
      : event.key === "ArrowLeft" ? order[(index - 1 + order.length) % order.length]
      : undefined;
    if (!next) return;
    event.preventDefault();
    const tab = (event.currentTarget as HTMLElement).querySelector<HTMLButtonElement>(
      `[data-value="${next}"]`,
    );
    props.onChange(next);
    tab?.focus();
  };
  return (
    <div
      aria-label={t(() => m.page_edit_mode())}
      class="ml-auto inline-flex h-7 items-center rounded-lg bg-muted p-0.5"
      role="tablist"
      onKeyDown={onKeyDown}
    >
      {items.map((item) => (
        <Tooltip content={t(item.label)}>
          <button
            aria-label={t(item.label)}
            aria-selected={props.value === item.value ? "true" : "false"}
            class={cn(
              "inline-flex size-6 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring",
              props.value === item.value
                ? "bg-background text-foreground shadow-sm dark:bg-input/30"
                : "text-muted-foreground hover:text-foreground",
            )}
            data-value={item.value}
            role="tab"
            tabindex={props.value === item.value ? 0 : -1}
            type="button"
            onClick={() => props.onChange(item.value)}
          >
            {item.icon}
          </button>
        </Tooltip>
      ))}
    </div>
  );
}

function MarkButton(props: {
  active: boolean;
  disabled?: boolean;
  icon: JSX.Element;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip content={props.label}>
      <Button
        aria-label={props.label}
        disabled={props.disabled}
        size="icon-sm"
        type="button"
        variant={props.active ? "secondary" : "ghost"}
        onClick={props.onClick}
      >
        {props.icon}
      </Button>
    </Tooltip>
  );
}
