import { createFileRoute } from "@tanstack/solid-router";

import { WorkspaceDetailScreen } from "~/screens/workspace-detail";

// A tela recebe o workspace por prop; o componente de rota lê o param e
// repassa, mantendo a tela livre de dependência do router.
function Screen() {
  const params = Route.useParams();
  return <WorkspaceDetailScreen workspace={params().workspace} />;
}

export const Route = createFileRoute("/workspaces/$workspace")({
  component: Screen,
});
