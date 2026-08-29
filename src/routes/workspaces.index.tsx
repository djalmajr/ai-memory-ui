import { createFileRoute } from "@tanstack/solid-router";

import { WorkspacesScreen } from "~/screens/workspaces";

export const Route = createFileRoute("/workspaces/")({
  component: WorkspacesScreen,
});
