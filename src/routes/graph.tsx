import { createFileRoute } from "@tanstack/solid-router";

import { GraphScreen } from "~/screens/graph";

export const Route = createFileRoute("/graph")({
  component: GraphScreen,
});
