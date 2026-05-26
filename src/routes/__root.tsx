import { Outlet, createRootRoute } from "@tanstack/solid-router";

import App from "~/App";

function RootRoute() {
  return <Outlet />;
}

function NotFoundRoute() {
  return <App routeSelection={() => ({ path: null, project: null, workspace: null })} />;
}

export const Route = createRootRoute({
  component: RootRoute,
  notFoundComponent: NotFoundRoute,
});
