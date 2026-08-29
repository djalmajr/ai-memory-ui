import { Outlet, createRootRoute, redirect } from "@tanstack/solid-router";

import { ensureTier, shouldRedirectToLogin } from "~/lib/auth";
import { NotFoundScreen } from "~/screens/not-found";

// Guard global de autenticação.
//
// Roda em `beforeLoad`, não no componente: o router aguarda o `beforeLoad`
// antes de criar o match, então uma rota protegida sem credencial NUNCA é
// montada. Gatear no render (`<Show>`) não resolve — no instante em que a URL
// vira `/login` a condição abre enquanto o router ainda tem o match anterior,
// e a tela protegida pisca junto com as queries dela (comprovado por um
// MutationObserver no e2e `guard.spec.ts`).
//
// `ensureTier` é single-flight: um probe por carga, compartilhado por todas as
// rotas que passarem por aqui.
export const Route = createRootRoute({
  beforeLoad: async ({ location }) => {
    const tier = await ensureTier();
    if (shouldRedirectToLogin(tier, location.pathname)) {
      throw redirect({ to: "/login", replace: true });
    }
  },
  component: () => <Outlet />,
  notFoundComponent: () => <NotFoundScreen />,
});
