import { createFileRoute } from "@tanstack/solid-router";

import { ConfigScreen } from "~/screens/config";

export const Route = createFileRoute("/config")({
  component: ConfigScreen,
});
