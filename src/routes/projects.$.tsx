import { createFileRoute, redirect } from "@tanstack/solid-router";

// Cutover das URLs antigas (`/projects/...`) para a IA nova.
//
// É uma rota splat única, e não três rotas espelhando as antigas, porque com
// rotas planas um arquivo `.index` registra o caminho COM barra final
// (`/projects/$workspace/`) e a forma sem barra — a que está nos bookmarks —
// não casa com rota nenhuma: cai no notFound e o redirect nunca roda.
// O splat casa qualquer profundidade e decide o destino pelos segmentos.
export const Route = createFileRoute("/projects/$")({
  beforeLoad: ({ params }) => {
    // O router já aplica `decodeURIComponent` nos params wildcard, então aqui
    // só se divide. Decodificar de novo transformaria um `%2F` literal do nome
    // em separador (criando segmentos falsos) e pode estourar num `%` solto.
    const segments = (params._splat ?? "").split("/").filter(Boolean);
    const [workspace, project, ...rest] = segments;

    // `/projects` sem nada: a lista de workspaces é o equivalente novo.
    if (!workspace) {
      throw redirect({ to: "/workspaces", replace: true });
    }

    // `/projects/{ws}` → detalhe do workspace no nível servidor.
    if (!project) {
      throw redirect({
        to: "/workspaces/$workspace",
        params: { workspace },
        replace: true,
      });
    }

    // `/projects/{ws}/{proj}/pages/{path...}` → leitor do escopo, preservando
    // o caminho do documento para que links antigos abram a mesma página.
    if (rest[0] === "pages" && rest.length > 1) {
      throw redirect({
        to: "/s/$workspace/$project/pages/$",
        params: { _splat: rest.slice(1).join("/"), project, workspace },
        replace: true,
      });
    }

    // `/projects/{ws}/{proj}` (e qualquer outra subrota antiga) → Wiki do escopo.
    throw redirect({
      to: "/s/$workspace/$project",
      params: { project, workspace },
      replace: true,
    });
  },
});
