import { createFileRoute } from "@tanstack/solid-router";

import { ConsumersScreen } from "~/screens/consumers";

export const Route = createFileRoute("/consumers")({
  component: ConsumersScreen,
});
