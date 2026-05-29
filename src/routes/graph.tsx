import { createFileRoute } from "@tanstack/solid-router";
import { createResource, Match, Switch } from "solid-js";

import DependencyGraph from "~/components/DependencyGraph";
import { graph } from "~/lib/api";

function GraphRoute() {
  const [data] = createResource(graph);

  return (
    <main style={{ "max-width": "720px", margin: "0 auto", padding: "1.5rem 1rem" }}>
      <h1 style={{ "font-size": "1.4rem", "margin-bottom": "0.25rem" }}>
        Cross-project dependencies
      </h1>
      <p style={{ color: "var(--muted, #888)", "margin-bottom": "1.25rem" }}>
        Each arrow is a project that links into another via{" "}
        <code>{"[[project:path.md]]"}</code>. Thicker / labelled arrows carry more links.
      </p>
      <Switch>
        <Match when={data.loading}>
          <p>Loading graph…</p>
        </Match>
        <Match when={data.error}>
          <p style={{ color: "var(--danger, #f85149)" }}>
            Failed to load graph: {String(data.error)}
          </p>
        </Match>
        <Match when={data()}>
          <DependencyGraph edges={data()!.edges} />
        </Match>
      </Switch>
    </main>
  );
}

export const Route = createFileRoute("/graph")({
  component: GraphRoute,
});
