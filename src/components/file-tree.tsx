import { Link } from "@tanstack/solid-router";
import { Box, ChevronRight, FileText, Folder, FolderOpen } from "lucide-solid";
import { For, Match, Show, Switch, createSignal } from "solid-js";

import { cn } from "~/lib/utils";
import type { PageSummary } from "~/lib/types";

// Estado de UI do file-tree em escopo de módulo: o App é remontado ao alternar
// entre rota de projeto e rota de página (componentes distintos no TanStack
// Router), então signals locais seriam resetados. Em escopo de módulo eles
// sobrevivem ao remount — é o que faz "selecionar projeto" surtir efeito.
export const [treeScope, setTreeScope] = createSignal<string | null>(null); // null = workspace inteiro
// Posição de scroll do file-tree, preservada entre navegações de página. O
// scrollTop é DOM (não signal) e zeraria ao re-renderizar/remontar na navegação;
// em escopo de módulo o offset sobrevive e é restaurado na mesma árvore.
export const [treeScrollTop, setTreeScrollTop] = createSignal(0);
// Identidade da árvore p/ qual o offset acima vale (workspace|escopo|filtro). Só
// restauramos o scroll quando a árvore é a mesma; em outra árvore, começa no topo.
export const [treeScrollKey, setTreeScrollKey] = createSignal("");
export const [treeWidth, setTreeWidth] = createSignal(280);

// Pastas começam expandidas; rastreamos apenas as recolhidas pelo usuário.
export const [collapsed, setCollapsed] = createSignal<Set<string>>(new Set());
export const [expandedProjects, setExpandedProjects] = createSignal<Set<string>>(new Set());

export function ResizeHandle(props: { class?: string; onDelta: (dx: number) => void }) {
  function onPointerDown(event: PointerEvent) {
    event.preventDefault();
    let last = event.clientX;
    const move = (moveEvent: PointerEvent) => {
      props.onDelta(moveEvent.clientX - last);
      last = moveEvent.clientX;
    };
    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }
  return (
    <div
      aria-hidden="true"
      class={cn("group relative w-1 shrink-0 cursor-col-resize", props.class)}
      onPointerDown={onPointerDown}
    >
      <div class="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors group-hover:bg-primary" />
    </div>
  );
}

// Chave do estado de colapso de uma PASTA — qualificada por workspace+projeto.
// O `path` de um nó `dir` é relativo ao projeto (ex.: `notes`), então pastas
// homônimas em projetos diferentes (cada projeto tem seu `notes/`) colidiriam e
// colapsariam/expandiriam juntas. Projeto+workspace no prefixo as torna únicas.
export function folderKey(node: TreeNode): string {
  return `${node.workspace}/${node.project}/${node.path}`;
}

export function FileTreeNodes(props: {
  depth: number;
  isFolderExpanded: (path: string) => boolean;
  isProjectExpanded: (name: string) => boolean;
  nodes: TreeNode[];
  onToggleFolder: (path: string) => void;
  onToggleProject: (name: string) => void;
  selectedPath: string | null;
  selectedProject: string | null;
}) {
  return (
    <For each={props.nodes}>
      {(node) => {
        // Alinhamento (asciimark): slot do chevron = largura do ícone (16px) e
        // passo de recuo = ícone+gap, então o chevron do filho alinha com o
        // ícone do pai e o ícone do filho alinha com o texto do pai.
        const indent = () => `${props.depth * 20 + 8}px`;
        const expanded = () =>
          node.type === "project"
            ? props.isProjectExpanded(node.name)
            : props.isFolderExpanded(folderKey(node));
        const selected = () =>
          node.type === "file" &&
          node.path === props.selectedPath &&
          node.project === props.selectedProject;
        const renderChildren = () => (
          <Show when={expanded()}>
            <FileTreeNodes
              depth={props.depth + 1}
              isFolderExpanded={props.isFolderExpanded}
              isProjectExpanded={props.isProjectExpanded}
              nodes={node.children}
              onToggleFolder={props.onToggleFolder}
              onToggleProject={props.onToggleProject}
              selectedPath={props.selectedPath}
              selectedProject={props.selectedProject}
            />
          </Show>
        );
        return (
          <Switch>
            <Match when={node.type === "file"}>
              <Link
                class={cn(
                  "flex w-full min-w-0 items-center gap-1 rounded-md py-1 pr-2 text-left outline-none transition hover:bg-hover focus-visible:bg-hover",
                  selected() && "bg-primary/10 font-medium text-primary hover:bg-primary/10",
                )}
                data-testid={`page-${node.project}/${node.path}`}
                params={{ _splat: node.path, project: node.project, workspace: node.workspace }}
                style={{ "padding-left": indent() }}
                title={node.name}
                to="/s/$workspace/$project/pages/$"
              >
                <span aria-hidden="true" class="w-4 shrink-0" />
                <FileText class={cn("shrink-0", selected() ? "opacity-100" : "opacity-70")} size={16} />
                <span class="min-w-0 flex-1 truncate text-sm">{node.name}</span>
              </Link>
            </Match>
            <Match when={node.type === "dir"}>
              <button
                class="flex w-full min-w-0 items-center gap-1 rounded-md py-1 pr-2 text-left outline-none transition hover:bg-hover focus-visible:bg-hover"
                style={{ "padding-left": indent() }}
                title={node.name}
                type="button"
                onClick={() => props.onToggleFolder(folderKey(node))}
              >
                <span class="flex w-4 shrink-0 items-center justify-center">
                  <ChevronRight
                    class={cn("text-muted-foreground transition-transform", expanded() && "rotate-90")}
                    size={14}
                  />
                </span>
                <Show fallback={<Folder class="shrink-0 text-primary" size={16} />} when={expanded()}>
                  <FolderOpen class="shrink-0 text-primary" size={16} />
                </Show>
                <span class="min-w-0 flex-1 truncate text-sm">{node.name}</span>
              </button>
              {renderChildren()}
            </Match>
            <Match when={node.type === "project"}>
              <button
                class="flex w-full min-w-0 items-center gap-1 rounded-md py-1 pr-2 text-left outline-none transition hover:bg-hover focus-visible:bg-hover"
                style={{ "padding-left": indent() }}
                title={node.name}
                type="button"
                onClick={() => props.onToggleProject(node.name)}
              >
                <span class="flex w-4 shrink-0 items-center justify-center">
                  <ChevronRight
                    class={cn("text-muted-foreground transition-transform", expanded() && "rotate-90")}
                    size={14}
                  />
                </span>
                <Box class="shrink-0 text-primary" size={16} />
                <span class="min-w-0 flex-1 truncate text-sm font-semibold">{node.name}</span>
                <Show when={node.count !== undefined}>
                  <span class="shrink-0 rounded-full bg-accent px-1.5 text-[0.625rem] font-semibold text-accent-foreground">
                    {node.count}
                  </span>
                </Show>
              </button>
              {renderChildren()}
            </Match>
          </Switch>
        );
      }}
    </For>
  );
}

export type TreeNodeType = "project" | "dir" | "file";

export interface TreeNode {
  type: TreeNodeType;
  name: string;
  path: string; // file: path da página; dir: path do diretório; project: nome do projeto
  project: string;
  workspace: string;
  kind?: string;
  count?: number; // total de páginas (apenas em nós de projeto)
  children: TreeNode[];
}

export interface ProjectPages {
  pageCount: number;
  pages: PageSummary[];
  project: string;
  workspace: string;
}

/** Forest do workspace: cada projeto é uma raiz, com sua árvore de páginas. */
export function buildWorkspaceForest(entries: ProjectPages[], filter: string): TreeNode[] {
  const roots: TreeNode[] = [];
  for (const entry of entries) {
    const pages = filter
      ? entry.pages.filter((page) => `${page.title} ${page.path}`.toLowerCase().includes(filter))
      : entry.pages;
    if (filter && pages.length === 0) {
      continue;
    }
    roots.push({
      children: buildPageNodes(pages, entry.workspace, entry.project),
      count: entry.pageCount,
      name: entry.project,
      path: `proj:${entry.workspace}/${entry.project}`,
      project: entry.project,
      type: "project",
      workspace: entry.workspace,
    });
  }
  // Projetos (nós de topo) em ordem alfabética. A ordenação dentro de cada
  // projeto (dirs→files) fica com sortTreeNode/buildPageNodes.
  roots.sort((a, b) => a.name.localeCompare(b.name));
  return roots;
}

/** Árvore de diretórios/arquivos de um projeto, a partir dos paths das páginas. */
export function buildPageNodes(pages: PageSummary[], workspace: string, project: string): TreeNode[] {
  const root: TreeNode = { children: [], name: "", path: "", project, type: "dir", workspace };
  for (const page of pages) {
    const segments = page.path.split("/");
    let cursor = root;
    segments.forEach((segment, index) => {
      const isFile = index === segments.length - 1;
      if (isFile) {
        cursor.children.push({
          children: [],
          kind: page.kind,
          name: page.title || segment,
          path: page.path,
          project,
          type: "file",
          workspace,
        });
        return;
      }
      const dirPath = segments.slice(0, index + 1).join("/");
      let dir = cursor.children.find((child) => child.type === "dir" && child.path === dirPath);
      if (!dir) {
        dir = { children: [], name: segment, path: dirPath, project, type: "dir", workspace };
        cursor.children.push(dir);
      }
      cursor = dir;
    });
  }
  sortTreeNode(root);
  return root.children;
}

export function sortTreeNode(node: TreeNode): void {
  node.children.sort((a, b) => {
    if ((a.type === "dir") !== (b.type === "dir")) {
      return a.type === "dir" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
  for (const child of node.children) {
    if (child.type === "dir") {
      sortTreeNode(child);
    }
  }
}
