import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import diff from "highlight.js/lib/languages/diff";
import go from "highlight.js/lib/languages/go";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import toml from "highlight.js/lib/languages/ini";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import MarkdownIt from "markdown-it";
import { createMemo } from "solid-js";

import { cn } from "~/lib/utils";

// Linguagens curadas (corta o bundle vs. o highlight.js completo).
for (const [name, lang] of Object.entries({
  bash,
  css,
  diff,
  dockerfile,
  go,
  html: xml,
  javascript: typescript,
  json,
  markdown,
  python,
  rust,
  shell: bash,
  sql,
  toml,
  ts: typescript,
  typescript,
  yaml,
  yml: yaml,
})) {
  hljs.registerLanguage(name, lang);
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

// Syntax highlight via highlight.js. Standalone (não referencia `md`) para o TS
// inferir o tipo de `md` sem ciclo.
function highlight(code: string, lang: string): string {
  if (lang && hljs.getLanguage(lang)) {
    try {
      const out = hljs.highlight(code, { language: lang }).value;
      return `<pre class="hljs"><code class="language-${lang}">${out}</code></pre>`;
    } catch {
      // cai no escape abaixo
    }
  }
  return `<pre class="hljs"><code>${escapeHtml(code)}</code></pre>`;
}

// `html: false` neutraliza HTML embutido (XSS-safe p/ conteúdo de wiki).
const md: MarkdownIt = new MarkdownIt({
  breaks: false,
  highlight,
  html: false,
  linkify: true,
  typographer: true,
});

// Links http(s) abrem em nova aba com rel seguro; relativos (.md internos) ficam.
const defaultLinkOpen =
  md.renderer.rules.link_open ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const href = tokens[idx].attrGet("href") ?? "";
  if (/^https?:\/\//i.test(href)) {
    tokens[idx].attrSet("target", "_blank");
    tokens[idx].attrSet("rel", "noreferrer noopener");
  }
  return defaultLinkOpen(tokens, idx, options, env, self);
};

/**
 * Remove um bloco de frontmatter YAML no topo do corpo, se existir. A API já
 * expõe `frontmatter` estruturado em campo separado; isto cobre o caso em que o
 * `body_markdown` ainda traz o `---...---` literal.
 */
export function stripFrontmatter(source: string): string {
  if (!source.startsWith("---")) {
    return source;
  }
  const end = source.indexOf("\n---", 3);
  if (end === -1) {
    return source;
  }
  const after = source.indexOf("\n", end + 1);
  return after === -1 ? "" : source.slice(after + 1).replace(/^\s+/, "");
}

export function Markdown(props: { class?: string; source: string }) {
  const html = createMemo(() => md.render(props.source ?? ""));
  return (
    <div
      class={cn(
        "prose prose-sm max-w-none dark:prose-invert",
        "prose-pre:bg-transparent prose-pre:p-0 prose-code:before:content-none prose-code:after:content-none",
        props.class,
      )}
      data-testid="markdown"
      // markdown-it com html:false já escapa HTML embutido — render seguro.
      innerHTML={html()}
    />
  );
}
