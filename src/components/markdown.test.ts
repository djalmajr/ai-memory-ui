import { describe, expect, it } from "vitest";

import { renderMarkdown, resolveWikilink } from "./markdown";

const ENV = { workspace: "default", project: "scratch", basePath: "" };

describe("resolveWikilink", () => {
  it("resolves a bare target against the current project and adds .md", () => {
    const r = resolveWikilink("notes/foo", ENV);
    expect(r).toMatchObject({
      href: "/projects/default/scratch/pages/notes/foo.md",
      label: "notes/foo",
      workspace: "default",
      project: "scratch",
      path: "notes/foo.md",
    });
  });

  it("keeps an explicit extension and honours an explicit label", () => {
    expect(resolveWikilink("notes/foo.md|the foo", ENV)).toMatchObject({
      href: "/projects/default/scratch/pages/notes/foo.md",
      label: "the foo",
    });
  });

  it("honours [[project:path]] and [[workspace/project:path]] scopes", () => {
    expect(resolveWikilink("other:notes/x", ENV)?.href).toBe(
      "/projects/default/other/pages/notes/x.md",
    );
    expect(resolveWikilink("ws2/proj2:y", ENV)?.href).toBe(
      "/projects/ws2/proj2/pages/y.md",
    );
  });

  it("prefixes the router basePath", () => {
    expect(resolveWikilink("notes/foo", { ...ENV, basePath: "/wiki/web" })?.href).toBe(
      "/wiki/web/projects/default/scratch/pages/notes/foo.md",
    );
  });

  it("percent-encodes segments", () => {
    expect(resolveWikilink("notes/a b#frag", ENV)?.href).toBe(
      "/projects/default/scratch/pages/notes/a%20b.md",
    );
  });

  it("rejects external, traversal, empty, and context-less targets", () => {
    expect(resolveWikilink("https://example.com", ENV)).toBeNull();
    expect(resolveWikilink("mailto:a@b.c", ENV)).toBeNull();
    expect(resolveWikilink("../etc/passwd", ENV)).toBeNull();
    expect(resolveWikilink("  ", ENV)).toBeNull();
    expect(resolveWikilink("notes/foo", {})).toBeNull();
  });
});

describe("renderMarkdown wikilinks", () => {
  it("renders a wikilink as an anchor with data attributes", () => {
    const html = renderMarkdown("see [[notes/foo]] here", ENV);
    expect(html).toContain('href="/projects/default/scratch/pages/notes/foo.md"');
    expect(html).toContain('class="wikilink"');
    expect(html).toContain('data-ws="default"');
    expect(html).toContain('data-proj="scratch"');
    expect(html).toContain('data-path="notes/foo.md"');
    expect(html).toContain(">notes/foo</a>");
  });

  it("does not linkify inside fenced or inline code", () => {
    expect(renderMarkdown("```\n[[notes/foo]]\n```", ENV)).not.toContain("<a ");
    expect(renderMarkdown("use `[[notes/foo]]` literally", ENV)).not.toContain("<a ");
  });

  it("does not turn external/malformed targets into wikilinks", () => {
    // The URL may be autolinked by markdown-it, but it must NOT become a
    // wikilink and the brackets stay literal.
    const ext = renderMarkdown("[[https://example.com]]", ENV);
    expect(ext).not.toContain('class="wikilink"');
    expect(ext).toContain("[[");
    // Traversal is rejected outright (no anchor at all).
    expect(renderMarkdown("[[../etc/passwd]]", ENV)).not.toContain("<a ");
  });
});

describe("renderMarkdown linkify", () => {
  it("does not autolink bare domain-like text (e.g. a `.md` filename)", () => {
    // `.md` is a valid ccTLD (Moldova); with linkify-it's fuzzyLink on, the
    // renderer turned "Funcionais.md" into <a href="http://funcionais.md/">.
    // Wikis carry .md filenames / domain-like words in prose constantly, so
    // schema-less autolinking produces false external links.
    const html = renderMarkdown("Requisitos Funcionais.md e veja foo.com depois", ENV);
    expect(html).not.toContain("<a ");
    expect(html).toContain("Funcionais.md");
  });

  it("still linkifies explicit-scheme URLs and opens them in a new tab", () => {
    const html = renderMarkdown("see https://example.com here", ENV);
    expect(html).toContain('href="https://example.com');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer noopener"');
  });
});

describe("renderMarkdown relative `.md` links", () => {
  const PAGE_ENV = { ...ENV, pagePath: "business/index.md" };

  it("rewrites `./x.md` to the in-app route, resolved against the page dir", () => {
    // Without this, the browser resolves `./rf001…` against the `<base href>`
    // and lands on `/wiki/web/rf001-cadastro.md` (outside the project route).
    const html = renderMarkdown("see [RF001](./rf001-cadastro.md)", PAGE_ENV);
    expect(html).toContain('href="/projects/default/scratch/pages/business/rf001-cadastro.md"');
    expect(html).toContain('class="wikilink"');
    expect(html).toContain('data-path="business/rf001-cadastro.md"');
    expect(html).toContain(">RF001</a>");
  });

  it("resolves `../` against the page dir", () => {
    const html = renderMarkdown("[x](../notes/y.md)", PAGE_ENV);
    expect(html).toContain('href="/projects/default/scratch/pages/notes/y.md"');
  });

  it("leaves external, non-`.md` and anchor links as plain hrefs", () => {
    expect(renderMarkdown("[e](https://example.com)", PAGE_ENV)).toContain('href="https://example.com');
    expect(renderMarkdown("[img](./pic.png)", PAGE_ENV)).toContain('href="./pic.png"');
    const anchor = renderMarkdown("[a](#sec)", PAGE_ENV);
    expect(anchor).toContain('href="#sec"');
    expect(anchor).not.toContain('class="wikilink"');
  });

  it("does nothing without page context (href stays relative)", () => {
    expect(renderMarkdown("[x](./y.md)", ENV)).toContain('href="./y.md"');
  });

  it("rejects traversal past the project root", () => {
    expect(renderMarkdown("[x](../../etc/passwd.md)", PAGE_ENV)).toContain('href="../../etc/passwd.md"');
  });
});
