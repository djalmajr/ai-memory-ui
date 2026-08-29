import { createFileRoute } from "@tanstack/solid-router";

import { ServerOverviewScreen } from "~/screens/server-overview";

export const Route = createFileRoute("/")({
  component: ServerOverviewScreen,
});
