import { createFileRoute } from "@tanstack/solid-router";

import { UsersScreen } from "~/screens/users";

export const Route = createFileRoute("/users")({
  component: UsersScreen,
});
