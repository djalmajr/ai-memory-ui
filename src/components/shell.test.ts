import { describe, expect, it } from "vitest";

import { scopeGroups, serverGroups } from "~/components/shell";
import type { NavGroup } from "~/components/shell";
import type { Tier } from "~/lib/auth";

// A sidebar é a fronteira visível de capability: oferecer um item que o engine
// vai recusar é mentira de UI. Por isso as asserções são a lista COMPLETA por
// tier — verificar só ausência de um item deixaria links errados passarem.
function targets(groups: NavGroup[]): string[] {
  return groups.flatMap((group) => group.items.map((item) => item.to));
}

const SCOPE = { workspace: "default", project: "scratch" };

const SERVER_PUBLIC = ["/", "/workspaces", "/graph"];
const SERVER_MONITORING = ["/sessions", "/activity", "/audit"];
const SERVER_ADMIN = ["/consumers", "/ops", "/backups", "/config"];

describe("sidebar de servidor", () => {
  it("root vê tudo, com Usuários", () => {
    expect(targets(serverGroups("root"))).toEqual([
      "/",
      "/workspaces",
      ...SERVER_MONITORING,
      "/graph",
      "/access",
      "/users",
      "/consumers",
      "/ops",
      "/backups",
      "/config",
    ]);
  });
  // `Capability::UserManagement` é root-only inclusive no modo anônimo:
  // credenciais nativas e usuários não podem ser oferecidos sem root humano.
  it("anonymous-admin não vê Acesso nem Usuários", () => {
    expect(targets(serverGroups("anonymous-admin"))).toEqual([
      "/",
      "/workspaces",
      ...SERVER_MONITORING,
      "/graph",
      ...SERVER_ADMIN,
    ]);
  });

  // Sessões/Atividade/Auditoria e o grupo Administração são `/admin/*`: para
  // estes degraus o engine responde 401, então nada disso pode ser oferecido.
  const readOnly: Tier[] = ["user", "anonymous", "unauthenticated", "unreachable"];
  for (const current of readOnly) {
    it(`${current} só vê leitura pública`, () => {
      expect(targets(serverGroups(current))).toEqual(SERVER_PUBLIC);
    });
  }

  it("mantém o grupo de monitoramento titulado mesmo só com o grafo", () => {
    const groups = serverGroups("user");
    expect(groups).toHaveLength(2);
    expect(groups[1].title?.()).toBeTruthy();
    expect(targets([groups[1]])).toEqual(["/graph"]);
  });
});

describe("sidebar de escopo", () => {
  it("root vê wiki, sessões, handoffs, pending e operações", () => {
    expect(targets(scopeGroups(SCOPE, "root"))).toEqual([
      "/s/$workspace/$project",
      "/s/$workspace/$project/sessions",
      "/s/$workspace/$project/handoffs",
      "/s/$workspace/$project/pending",
      "/s/$workspace/$project/ops",
    ]);
  });

  it("anonymous-admin tem a mesma sidebar de escopo do root", () => {
    expect(targets(scopeGroups(SCOPE, "anonymous-admin"))).toEqual(
      targets(scopeGroups(SCOPE, "root")),
    );
  });

  // Modo usuário do protótipo: sem pending/operações, com visão geral do
  // projeto e grafo — ambos leitura de `/api/v1`.
  const readOnly: Tier[] = ["user", "anonymous"];
  for (const current of readOnly) {
    it(`${current} vê visão geral e grafo, sem rotas administrativas`, () => {
      expect(targets(scopeGroups(SCOPE, current))).toEqual([
        "/s/$workspace/$project/overview",
        "/s/$workspace/$project",
        "/s/$workspace/$project/sessions",
        "/s/$workspace/$project/handoffs",
        "/graph",
      ]);
    });
  }

  it("não monta grupo de manutenção fora do admin", () => {
    expect(scopeGroups(SCOPE, "user")).toHaveLength(1);
    expect(scopeGroups(SCOPE, "root")).toHaveLength(2);
  });

  it("carrega os params do escopo em cada item do escopo", () => {
    for (const group of scopeGroups(SCOPE, "root")) {
      for (const item of group.items) {
        if (item.to.includes("$workspace")) {
          expect(item.params).toEqual(SCOPE);
        }
      }
    }
  });

  // O grafo é global (o endpoint não filtra por projeto), então não leva params.
  it("o grafo do modo usuário não leva params de escopo", () => {
    const graph = scopeGroups(SCOPE, "user")[0].items.find((item) => item.to === "/graph");
    expect(graph?.params).toBeUndefined();
  });

  it("mostra a contagem da fila só quando informada", () => {
    const find = (groups: NavGroup[]) =>
      groups[0].items.find((item) => item.to === "/s/$workspace/$project/pending");
    expect(find(scopeGroups(SCOPE, "root", 3))?.badge?.()).toBe(3);
    expect(find(scopeGroups(SCOPE, "root"))?.badge?.()).toBeUndefined();
  });
});
