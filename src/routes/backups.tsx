import { createFileRoute } from "@tanstack/solid-router";

import { BackupsScreen } from "~/screens/backups";

export const Route = createFileRoute("/backups")({
  component: BackupsScreen,
});
