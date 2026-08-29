import { createFileRoute } from "@tanstack/solid-router";

import { ActivityScreen } from "~/screens/activity";

export const Route = createFileRoute("/activity")({
  component: ActivityScreen,
});
