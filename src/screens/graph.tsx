import { useQuery } from "~/lib/query";
import { Link, useNavigate } from "@tanstack/solid-router";
import { CircleHelp } from "~/components/icons";
import { For, Show, createMemo, createSignal } from "solid-js";

import { Button } from "~/components/button";
import { DataGrid } from "~/components/data-grid";
import { Shell } from "~/components/shell";
import { Skeleton } from "~/components/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/tabs";
import { EmptyState } from "~/components/ui-bits";
import { graph } from "~/lib/api";
import { t } from "~/lib/i18n";
import type { CrossProjectEdge, GraphResponse } from "~/lib/types";
import * as m from "~/paraglide/messages";

// Grafo de dependências entre projetos: o /api/v1/graph devolve arestas
// página→página; aqui elas viram um mapa por projeto (peso = nº de links)
// mais a lista completa das ligações, ambas navegáveis.

export interface ProjectNode {
  inbound: number;
  key: string;
  outbound: number;
  project: string;
  workspace: string;
  x: number;
  y: number;
}

export interface ProjectLink {
  from: string;
  to: string;
  weight: number;
}

const WIDTH = 640;
const NODE_R = 30;

// Separador estrutural das chaves de par: NUL não aparece em nomes de
// workspace/projeto. O componente anterior concatenava sem separador e
// depois fazia `split("")`, quebrando nomes multi-caractere.
const KEY_SEP = "\u0000";

function GraphHelp() {
  const [open, setOpen] = createSignal(false);
  const id = "graph-help";
  return (
    <div class="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <Button
        aria-describedby={id}
        aria-label={t(() => m.graph_help())}
        size="icon-xs"
        type="button"
        variant="ghost"
        onBlur={() => setOpen(false)}
        onFocus={() => setOpen(true)}
      >
        <CircleHelp />
      </Button>
      <div
        class={
          open()
            ? "absolute top-full left-0 z-50 mt-1.5 w-80 rounded-md bg-foreground px-3 py-2 text-xs text-background shadow-md"
            : "sr-only"
        }
        id={id}
        role="tooltip"
      >
        <p>{t(() => m.graph_subtitle())}</p>
      </div>
    </div>
  );
}

function edgeLabel(edge: CrossProjectEdge, side: "from" | "to"): string {
  return side === "from"
    ? `${edge.from_workspace}/${edge.from_project}/${edge.from_path}`
    : `${edge.to_workspace}/${edge.to_project}/${edge.to_path}`;
}

function EdgeLink(props: { edge: CrossProjectEdge; side: "from" | "to" }) {
  const workspace = () => (props.side === "from" ? props.edge.from_workspace : props.edge.to_workspace);
  const project = () => (props.side === "from" ? props.edge.from_project : props.edge.to_project);
  const path = () => (props.side === "from" ? props.edge.from_path : props.edge.to_path);
  return (
    <Link
      class="block truncate font-mono text-xs text-foreground outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
      params={{ _splat: path(), project: project(), workspace: workspace() }}
      to="/s/$workspace/$project/pages/$"
    >
      {edgeLabel(props.edge, props.side)}
    </Link>
  );
}

function nodeKey(workspace: string, project: string): string {
  return `${workspace}/${project}`;
}

/** Agrega arestas página→página em nós de projeto posicionados num círculo. */
export function layout(edges: CrossProjectEdge[]): {
  height: number;
  links: ProjectLink[];
  nodes: ProjectNode[];
} {
  const meta = new Map<string, { inbound: number; outbound: number; project: string; workspace: string }>();
  const weights = new Map<string, ProjectLink>();

  for (const edge of edges) {
    const from = nodeKey(edge.from_workspace, edge.from_project);
    const to = nodeKey(edge.to_workspace, edge.to_project);
    const fromMeta = meta.get(from) ?? {
      inbound: 0,
      outbound: 0,
      project: edge.from_project,
      workspace: edge.from_workspace,
    };
    fromMeta.outbound += 1;
    meta.set(from, fromMeta);
    const toMeta = meta.get(to) ?? {
      inbound: 0,
      outbound: 0,
      project: edge.to_project,
      workspace: edge.to_workspace,
    };
    toMeta.inbound += 1;
    meta.set(to, toMeta);
    const pairKey = `${from}${KEY_SEP}${to}`;
    const link = weights.get(pairKey) ?? { from, to, weight: 0 };
    link.weight += 1;
    weights.set(pairKey, link);
  }

  const keys = [...meta.keys()].sort();
  const n = keys.length;
  const height = n <= 3 ? 300 : 560;
  const cx = WIDTH / 2;
  const cy = height / 2;
  const radius = n === 2 ? 180 : Math.min(cx, cy) - 76;
  const nodes = keys.map((key, i) => {
    const info = meta.get(key)!;
    // Par único fica horizontal (legendas livres); demais em círculo.
    const angle = n <= 1 ? 0 : n === 2 ? Math.PI * i : (2 * Math.PI * i) / n - Math.PI / 2;
    return {
      ...info,
      key,
      x: n <= 1 ? cx : cx + radius * Math.cos(angle),
      y: n <= 1 ? cy : cy + radius * Math.sin(angle),
    };
  });

  return { height, links: [...weights.values()], nodes };
}

/**
 * Segmento da aresta encurtado até a borda dos nós; pares bidirecionais são
 * deslocados perpendicularmente para as duas setas não se sobreporem.
 */
function edgeSegment(
  a: ProjectNode,
  b: ProjectNode,
  twoWay: boolean,
): { x1: number; x2: number; y1: number; y2: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const offset = twoWay ? 7 : 0;
  const px = -uy * offset;
  const py = ux * offset;
  return {
    x1: a.x + ux * NODE_R + px,
    y1: a.y + uy * NODE_R + py,
    x2: b.x - ux * (NODE_R + 8) + px,
    y2: b.y - uy * (NODE_R + 8) + py,
  };
}

export function GraphScreen() {
  const navigate = useNavigate();
  const graphQ = useQuery<GraphResponse>(() => ({
    queryFn: graph,
    queryKey: ["graph"],
  }));

  const model = createMemo(() => layout(graphQ.data?.edges ?? []));
  const nodeOf = createMemo(() => new Map(model().nodes.map((node) => [node.key, node])));
  const reverse = createMemo(() => new Set(model().links.map((link) => `${link.to}${KEY_SEP}${link.from}`)));
  const goToProject = (node: ProjectNode) =>
    navigate({
      params: { project: node.project, workspace: node.workspace },
      to: "/s/$workspace/$project",
    });

  return (
    <Shell
      description={<span>{t(() => m.graph_subtitle())}</span>}
      heading={<span>{t(() => m.nav_graph())}</span>}
      screen={t(() => m.nav_graph())}
      help={<GraphHelp />}
      level="server"
    >
      <Show
        fallback={
          <Show
            fallback={
              <div class="flex flex-col gap-3">
                <Skeleton class="h-4 w-1/3 rounded-md" />
                <Skeleton class="h-64 w-full rounded-md" />
              </div>
            }
            when={graphQ.isError}
          >
            <div class="flex flex-col items-start gap-2" role="alert">
              <strong class="text-sm">{t(() => m.state_error_title())}</strong>
              <p class="text-sm text-destructive">{graphQ.error?.message}</p>
              <Button onClick={() => void graphQ.refetch()} type="button" variant="outline">
                {t(() => m.state_retry())}
              </Button>
            </div>
          </Show>
        }
        when={graphQ.data}
      >
        {(data) => (
          <Show
            fallback={
              <div class="rounded-lg border border-hairline">
                <EmptyState body={t(() => m.graph_empty())} title={t(() => m.state_empty_title())} />
              </div>
            }
            when={data().edges.length > 0}
          >
            <Tabs defaultValue="map">
              <div class="flex items-center gap-2">
                <TabsList>
                  <TabsTrigger value="map">{t(() => m.graph_map_title())}</TabsTrigger>
                  <TabsTrigger value="links">
                    {t(() => m.graph_links_title({ count: data().edges.length }))}
                  </TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="map" class="flex flex-col gap-1.5">
              <div class="rounded-lg border border-hairline p-4">
                <svg
                  aria-label={t(() => m.graph_map_title())}
                  class="mx-auto h-auto w-full"
                  style={{ "max-width": `${WIDTH}px` }}
                  viewBox={`0 0 ${WIDTH} ${model().height}`}
                >
                  <defs>
                    <marker
                      id="graph-arrow"
                      markerHeight="7"
                      markerWidth="7"
                      orient="auto-start-reverse"
                      refX="9"
                      refY="5"
                      viewBox="0 0 10 10"
                    >
                      <path class="fill-muted-foreground" d="M 0 0 L 10 5 L 0 10 z" />
                    </marker>
                  </defs>

                  <For each={model().links}>
                    {(link) => {
                      const a = nodeOf().get(link.from);
                      const b = nodeOf().get(link.to);
                      if (!a || !b) return null;
                      const seg = edgeSegment(a, b, reverse().has(`${link.from}${KEY_SEP}${link.to}`));
                      return (
                        <g>
                          <line
                            class="stroke-muted-foreground opacity-70"
                            marker-end="url(#graph-arrow)"
                            stroke-width={1 + Math.min(link.weight, 5)}
                            x1={seg.x1}
                            x2={seg.x2}
                            y1={seg.y1}
                            y2={seg.y2}
                          />
                          <text
                            class="fill-muted-foreground text-[11px]"
                            text-anchor="middle"
                            x={(seg.x1 + seg.x2) / 2}
                            y={(seg.y1 + seg.y2) / 2 - 6}
                          >
                            {link.weight}
                          </text>
                        </g>
                      );
                    }}
                  </For>

                  <For each={model().nodes}>
                    {(node) => (
                      <g
                        aria-label={`${node.workspace}/${node.project}`}
                        class="group cursor-pointer outline-none"
                        role="link"
                        tabindex="0"
                        onClick={() => void goToProject(node)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void goToProject(node);
                        }}
                      >
                        <circle
                          class="hidden fill-none stroke-ring group-focus-visible:block"
                          cx={node.x}
                          cy={node.y}
                          r={NODE_R + 4}
                          stroke-width="2"
                        />
                        <circle class="fill-accent stroke-primary" cx={node.x} cy={node.y} r={NODE_R} stroke-width="1.5" />
                        <text
                          class="fill-accent-foreground text-[11px] font-semibold"
                          text-anchor="middle"
                          x={node.x}
                          y={node.y + 4}
                        >
                          {node.project.length > 9 ? `${node.project.slice(0, 8)}…` : node.project}
                        </text>
                        <text class="fill-muted-foreground text-[10px]" text-anchor="middle" x={node.x} y={node.y + NODE_R + 14}>
                          {node.workspace}/{node.project}
                        </text>
                        <text class="fill-muted-foreground text-[10px]" text-anchor="middle" x={node.x} y={node.y + NODE_R + 27}>
                          {t(() => m.graph_node_degree({ inbound: node.inbound, outbound: node.outbound }))}
                        </text>
                      </g>
                    )}
                  </For>
                </svg>
              </div>
              <p class="text-right text-xs text-muted-foreground">
                {t(() => m.graph_stats({ links: data().edges.length, projects: model().nodes.length }))}
              </p>
              </TabsContent>

              <TabsContent value="links" class="flex flex-col gap-1.5">
                <DataGrid
                  empty={t(() => m.graph_filter_no_match())}
                  items={data().edges}
                  searchPlaceholder={t(() => m.graph_filter_placeholder())}
                  columns={[
                    {
                      id: "from",
                      label: t(() => m.graph_col_from()),
                      class: "max-w-md truncate font-mono text-xs",
                      search: (edge) => edgeLabel(edge, "from"),
                      sortValue: (edge) => edgeLabel(edge, "from"),
                      cell: (edge) => <EdgeLink edge={edge} side="from" />,
                    },
                    {
                      id: "to",
                      label: t(() => m.graph_col_to()),
                      class: "max-w-md truncate font-mono text-xs",
                      search: (edge) => edgeLabel(edge, "to"),
                      sortValue: (edge) => edgeLabel(edge, "to"),
                      cell: (edge) => <EdgeLink edge={edge} side="to" />,
                    },
                  ]}
                />
                <p class="text-right text-xs text-muted-foreground">
                  {t(() => m.graph_stats({ links: data().edges.length, projects: model().nodes.length }))}
                </p>
              </TabsContent>
            </Tabs>
          </Show>
        )}
      </Show>
    </Shell>
  );
}
