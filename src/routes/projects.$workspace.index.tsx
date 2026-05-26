import { createFileRoute } from "@tanstack/solid-router";
import { createMemo } from "solid-js";

import App from "~/App";

function WorkspaceRoute() {
  const params = Route.useParams();
  const routeSelection = createMemo(() => ({
    path: null,
    project: null,
    workspace: params().workspace,
  }));
  return <App routeSelection={routeSelection} />;
}

export const Route = createFileRoute("/projects/$workspace/")({
  component: WorkspaceRoute,
});
