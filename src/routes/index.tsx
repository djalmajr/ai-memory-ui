import { createFileRoute } from "@tanstack/solid-router";

import App from "~/App";

function HomeRoute() {
  return <App routeSelection={() => ({ path: null, project: null, workspace: null })} />;
}

export const Route = createFileRoute("/")({
  component: HomeRoute,
});
