import { Outlet, createFileRoute } from "@tanstack/solid-router";

// Layout do nível escopo. Existe só para que `/s/{ws}/{proj}` resolva sem a
// barra final: com rotas planas, o arquivo `.index` registra o caminho
// `/s/$workspace/$project/` e um link (ou redirect) para a forma sem barra não
// casava com rota nenhuma — caía no notFound e, no caso do redirect das rotas
// antigas, abortava silenciosamente deixando a URL velha.
//
// Não renderiza chrome: cada tela do escopo monta o próprio `Shell`.
export const Route = createFileRoute("/s/$workspace/$project")({
  component: () => <Outlet />,
});
