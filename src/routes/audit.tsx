import { createFileRoute } from "@tanstack/solid-router";

import { AuditScreen } from "~/screens/audit";

export const Route = createFileRoute("/audit")({
  component: AuditScreen,
});
