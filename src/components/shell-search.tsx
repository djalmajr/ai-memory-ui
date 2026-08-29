import { useNavigate } from "@tanstack/solid-router";
import { useQuery } from "@tanstack/solid-query";
import { createMemo, createSignal, onCleanup, onMount } from "solid-js";

import { CommandPalette, type SearchTarget } from "~/components/command-palette";
import { listProjects, listWorkspaces, searchPages } from "~/lib/api";
import type { SearchHit, WorkspaceWithProjects } from "~/lib/types";

// Busca do shell (⌘K). Vive fora do `Shell` para que o gatilho da sidebar e o
// atalho global compartilhem um único estado, sem cada tela ter de montar a
// paleta. A paleta em si é a que já existia no browser de wiki — só o chrome
// ao redor mudou.
export interface ShellSearch {
  open: () => void;
  palette: () => ReturnType<typeof CommandPalette>;
}

export function useShellSearch(): ShellSearch {
  const navigate = useNavigate();
  const [open, setOpen] = createSignal(false);
  const [draft, setDraft] = createSignal("");
  const [submitted, setSubmitted] = createSignal("");
  const [target, setTarget] = createSignal<SearchTarget>({ kind: "global" });

  // ⌘K / Ctrl+K abre de qualquer tela; Esc fecha (a paleta trata o resto).
  onMount(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
  });

  const workspacesQuery = useQuery(() => ({
    queryKey: ["shell", "workspaces"],
    queryFn: () => listWorkspaces(),
    enabled: open(),
  }));
  const projectsQuery = useQuery(() => ({
    queryKey: ["shell", "projects"],
    queryFn: () => listProjects(),
    enabled: open(),
  }));

  // A paleta espera workspaces com seus projetos inline; monta-se aqui a partir
  // das duas listas, como o browser antigo fazia (sem chamada extra).
  const workspaces = createMemo<WorkspaceWithProjects[]>(() => {
    const projects = projectsQuery.data ?? [];
    return (workspacesQuery.data ?? []).map((workspace) => ({
      ...workspace,
      projects: projects.filter((project) => project.workspace_name === workspace.workspace_name),
    }));
  });

  const searchQuery = useQuery(() => ({
    queryKey: ["shell", "search", submitted(), target()],
    queryFn: () => {
      const scope = target();
      if (scope.kind === "project") {
        return searchPages(submitted(), {
          key: { project: scope.project, workspace: scope.workspace },
        });
      }
      if (scope.kind === "workspace") {
        // Sem endpoint de busca por workspace: manda os escopos do workspace.
        return searchPages(submitted(), {
          scopes: workspaces()
            .find((entry) => entry.workspace_name === scope.workspace)
            ?.projects.map((project) => ({
              workspace: project.workspace_name,
              project: project.project_name,
            })),
        });
      }
      return searchPages(submitted());
    },
    enabled: submitted().trim().length > 0,
  }));

  const onSelect = (hit: SearchHit) => {
    setOpen(false);
    navigate({
      to: "/s/$workspace/$project/pages/$",
      params: { _splat: hit.path, project: hit.project, workspace: hit.workspace },
    });
  };

  return {
    open: () => setOpen(true),
    palette: () => (
      <CommandPalette
        loading={searchQuery.isFetching}
        open={open()}
        query={draft()}
        results={searchQuery.data ?? []}
        submitted={submitted()}
        target={target()}
        workspaces={workspaces()}
        onClose={() => setOpen(false)}
        onInput={(value) => {
          setDraft(value);
          setSubmitted(value);
        }}
        onSelect={onSelect}
        onTargetChange={setTarget}
      />
    ),
  };
}
