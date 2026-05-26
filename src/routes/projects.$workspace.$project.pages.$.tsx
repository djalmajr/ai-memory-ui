import { createFileRoute } from "@tanstack/solid-router";
import { createMemo } from "solid-js";

import App from "~/App";

function PageRoute() {
  const params = Route.useParams();
  const routeSelection = createMemo(() => ({
    path: params()._splat ?? null,
    project: params().project,
    workspace: params().workspace,
  }));
  return <App routeSelection={routeSelection} />;
}

export const Route = createFileRoute("/projects/$workspace/$project/pages/$")({
  component: PageRoute,
});
