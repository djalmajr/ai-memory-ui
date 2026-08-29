import { createFileRoute } from "@tanstack/solid-router";

import { AccessScreen } from "~/screens/access";

export const Route = createFileRoute("/access")({
  component: AccessScreen,
});
