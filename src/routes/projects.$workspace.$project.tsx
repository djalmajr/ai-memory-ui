import { Outlet, createFileRoute, useLocation } from "@tanstack/solid-router";
import { Match, Switch, createMemo } from "solid-js";

import App from "~/App";

function ProjectRoute() {
  const location = useLocation();
  const params = Route.useParams();
  const routeSelection = createMemo(() => ({
    path: null,
    project: params().project,
    workspace: params().workspace,
  }));
  const hasPageRoute = createMemo(() => location().pathname.includes("/pages/"));
  return (
    <Switch>
      <Match when={hasPageRoute()}>
        <Outlet />
      </Match>
      <Match when={true}>
        <App routeSelection={routeSelection} />
      </Match>
    </Switch>
  );
}

export const Route = createFileRoute("/projects/$workspace/$project")({
  component: ProjectRoute,
});
