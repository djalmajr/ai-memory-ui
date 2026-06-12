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

// Só linkifica URLs com esquema explícito (http/https/mailto/…). Sem isto, o
// "fuzzy link" do linkify-it transforma qualquer token tipo-domínio em link
// externo — ex.: um título "…Funcionais.md" virava `http://funcionais.md/`
// (`.md` é TLD da Moldávia) e `foo.com` no texto idem. Wikis têm `.md`/nomes de
// arquivo no corpo o tempo todo, então o fuzzy gera links externos falsos.
md.linkify.set({ fuzzyLink: false });

/** Contexto passado via `md.render(src, env)` para resolver wikilinks. */
interface WikiEnv {
  workspace?: string;
  project?: string;
  /** Basepath do router (ex.: `/wiki/web`), derivado do `<base href>`. */
  basePath?: string;
}

interface ResolvedWikilink {
  href: string;
  label: string;
  workspace: string;
  project: string;
  path: string;
}

/**
 * Resolve um alvo `[[…]]` (texto interno, sem colchetes) em href de rota +
 * label. Espelha o extrator de links da engine: aceita `[[path]]`,
 * `[[path|label]]`, `[[project:path]]` e `[[workspace/project:path]]`.
 * Retorna `null` p/ alvos vazios, externos, com traversal, ou sem contexto.
 */
export function resolveWikilink(raw: string, env: WikiEnv): ResolvedWikilink | null {
  const bar = raw.indexOf("|");
  const target = (bar >= 0 ? raw.slice(0, bar) : raw).trim();
  const explicitLabel = bar >= 0 ? raw.slice(bar + 1).trim() : "";
  if (!target) return null;

  const lower = target.toLowerCase();
  if (
    target.includes("://") ||
    target.startsWith("#") ||
    lower.startsWith("mailto:") ||
    lower.startsWith("tel:") ||
    lower.startsWith("data:") ||
    lower.startsWith("javascript:")
  ) {
    return null;
  }

  // Qualificador de escopo opcional `[workspace/]project:`.
  let workspace = env.workspace;
  let project = env.project;
  let pathPart = target;
  const colon = target.indexOf(":");
  if (colon > 0) {
    const scope = target.slice(0, colon).trim();
    if (scope && /^[A-Za-z0-9._/-]+$/.test(scope)) {
      const slash = scope.indexOf("/");
      if (slash >= 0) {
        const w = scope.slice(0, slash).trim();
        const p = scope.slice(slash + 1).trim();
        if (p) {
          workspace = w;
          project = p;
          pathPart = target.slice(colon + 1).trim();
        }
      } else {
        project = scope;
        pathPart = target.slice(colon + 1).trim();
      }
    }
  }
  if (!workspace || !project) return null;

  let path = pathPart.split(/[#?]/)[0]?.trim() ?? "";
  if (!path || path.includes("..") || path.includes("\\")) return null;
  const lastSeg = path.split("/").pop() ?? "";
  if (!lastSeg.includes(".")) path += ".md";

  const enc = encodeURIComponent;
  const encPath = path.split("/").map(enc).join("/");
  const base = env.basePath ?? "";
  const href = `${base}/projects/${enc(workspace)}/${enc(project)}/pages/${encPath}`;
  return { href, label: explicitLabel || target, workspace, project, path };
}

// Regra inline: reescreve `[[…]]` em links de rota ANTES da regra `link`
// (markdown-it consome `[` como link/ref). Carrega ws/proj/path em data-attrs
// p/ o handler de clique fazer soft-nav; o href é fallback (nova aba / sem JS).
md.inline.ruler.before("link", "wikilink", (state, silent) => {
  const src = state.src;
  const start = state.pos;
  if (src.charCodeAt(start) !== 0x5b || src.charCodeAt(start + 1) !== 0x5b) {
    return false;
  }
  const close = src.indexOf("]]", start + 2);
  if (close < 0) return false;
  const resolved = resolveWikilink(src.slice(start + 2, close), (state.env as WikiEnv) ?? {});
  if (!resolved) return false; // deixa a regra `link`/texto tratar
  if (!silent) {
    const open = state.push("link_open", "a", 1);
    open.attrSet("href", resolved.href);
    open.attrSet("class", "wikilink");
    open.attrSet("data-ws", resolved.workspace);
    open.attrSet("data-proj", resolved.project);
    open.attrSet("data-path", resolved.path);
    const text = state.push("text", "", 0);
    text.content = resolved.label;
    state.push("link_close", "a", -1);
  }
  state.pos = close + 2;
  return true;
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

/** Renderiza markdown→HTML resolvendo wikilinks com o contexto `env`.
 * Exportado para testes (a instância `md` é privada ao módulo). */
export function renderMarkdown(source: string, env: WikiEnv = {}): string {
  return md.render(source ?? "", env);
}

/** Basepath do router derivado do `<base href>` injetado (mesma heurística do
 * `index.tsx`): `/wiki/web/` → `/wiki/web`, `/` → ``. */
function routerBasePath(): string {
  if (typeof document === "undefined") return "";
  return new URL(document.baseURI).pathname.replace(/\/+$/, "");
}

export function Markdown(props: {
  class?: string;
  source: string;
  /** Projeto da página atual — resolve wikilinks `[[path]]` sem escopo. */
  workspace?: string;
  project?: string;
  /** Encaminhado ao container; usado p/ interceptar cliques em `a.wikilink`. */
  onClick?: (event: MouseEvent) => void;
}) {
  const html = createMemo(() =>
    renderMarkdown(props.source ?? "", {
      workspace: props.workspace,
      project: props.project,
      basePath: routerBasePath(),
    }),
  );
  return (
    <div
      class={cn(
        "prose prose-sm max-w-none dark:prose-invert",
        "prose-code:before:content-none prose-code:after:content-none",
        props.class,
      )}
      data-testid="markdown"
      onClick={props.onClick}
      // markdown-it com html:false já escapa HTML embutido — render seguro.
      innerHTML={html()}
    />
  );
}
