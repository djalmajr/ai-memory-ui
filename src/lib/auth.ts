import { createSignal } from "solid-js";
import { API_ROOT, BASE_PATH } from "~/lib/base-path";

// Sessão da área administrativa.
//
// O engine só lê o cookie de sessão em GET (`auth.rs:314-321`); toda mutação
// exige `Authorization: Bearer`. Por isso a chave fica no browser e viaja como
// Bearer em todo request — é o que a tela de login promete ("fica só neste
// navegador").
const TOKEN_KEY = "ai-memory-ui.token";

export function getToken(): string | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(TOKEN_KEY);
  return raw && raw.trim() ? raw : null;
}

export function setToken(token: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(TOKEN_KEY, token.trim());
}

export function clearToken(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
}

export function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Sufixo da chave, pro rodapé da sidebar dizer *qual* credencial está em uso sem
// revelá-la. O engine não expõe identidade do chamador (não há whoami), então
// isto é o mais honesto disponível junto ao papel derivado do tier.
export function maskedToken(): string | null {
  const token = getToken();
  if (!token) return null;
  return token.length <= 4 ? "••••" : `••••${token.slice(-4)}`;
}
// Degraus observáveis, derivados só de status HTTP:
//
// - `admin`            bearer raiz aceito em `/admin/status` (chave no browser)
// - `cookie-admin`     engine COM auth, sessão autenticada apenas pelo cookie
//                      (Basic/oauth2-proxy). Enxerga tudo, mas o engine só lê o
//                      cookie em GET: qualquer mutação exige `Authorization`.
// - `anonymous-admin`  engine SEM auth configurada: `/admin/*` responde a
//                      qualquer um, mas `UserManagement` segue root-only
// - `anonymous`        leitura pública, `/admin/*` fechado
// - `user`             token/cookie de usuário do banco: `/api/v1` sim, `/admin` não
// - `unauthenticated`  credencial ausente ou recusada com 401
// - `unreachable`      não foi possível concluir (engine fora, 5xx, 403
//                      inesperado). **A chave é preservada**: só um 401
//                      autoriza descartá-la.
export type Tier =
  | "admin"
  | "cookie-admin"
  | "anonymous-admin"
  | "anonymous"
  | "user"
  | "unauthenticated"
  | "unreachable";

/** Enxerga as telas administrativas (tudo ali é GET). */
export function isAdminTier(tier: Tier): boolean {
  return tier === "admin" || tier === "cookie-admin" || tier === "anonymous-admin";
}

/** Pode EXECUTAR operação que muda estado.
 *
 *  O cookie de sessão do engine autentica somente GET; toda mutação exige o
 *  header `Authorization`. Sem chave no browser, oferecer purge/rename/commit
 *  seria oferecer um botão que só sabe responder 401. */
export function canMutate(tier: Tier): boolean {
  return tier === "admin" || tier === "anonymous-admin";
}

// `Capability::UserManagement` é sempre root-only: nem modo anônimo nem sessão
// só-cookie chegam lá.
export function canManageUsers(tier: Tier): boolean {
  return tier === "admin";
}

// Só o status importa aqui. Um 401 do host vem como `text/plain`
// ("auth required\n"), não como `{error}` — nunca tentar JSON nesta sonda.
async function probeStatus(url: string, headers: Record<string, string>): Promise<number> {
  try {
    const response = await fetch(url, { headers: { Accept: "application/json", ...headers } });
    return response.status;
  } catch {
    // Rede fora / engine parado: 0 significa "indeterminado" e o chamador cai
    // no degrau mais baixo em vez de afirmar um papel que não observou.
    return 0;
  }
}

// Preview offline (`VITE_FIXTURES=1 npm run dev`): `api.ts` serve dados de
// exemplo sem engine, então a sonda também precisa concluir — senão nenhuma
// chave é aceita e o walkthrough para no login. Sem chave o preview equivale a
// um engine sem auth configurada (`anonymous-admin`): as telas administrativas
// existem e a leitura é pública. Inerte em produção.
const USE_FIXTURES = import.meta.env.DEV && import.meta.env.VITE_FIXTURES === "1";

export async function probeTier(): Promise<Tier> {
  if (USE_FIXTURES) {
    return getToken() ? "admin" : "anonymous-admin";
  }
  if (getToken()) {
    const admin = await probeStatus(`${BASE_PATH}/admin/status`, authHeaders());
    if (admin === 200) return "admin";

    const read = await probeStatus(`${API_ROOT}/workspaces`, authHeaders());
    if (read === 200) return "user";

    // Só o 401 é veredito sobre a credencial (o engine responde 401 a bearer
    // desconhecido). Rede fora, 5xx ou 403 inesperado são indeterminados.
    if (read === 401) {
      clearToken();
      return "unauthenticated";
    }
    return "unreachable";
  }

  // Sem chave no browser, um 200 pode significar duas coisas OPOSTAS:
  //
  //   a) o engine não tem auth configurada (modo sem operador), ou
  //   b) o engine tem auth e esta navegação já está autenticada pelo cookie de
  //      sessão que ele emite após um Basic/oauth2-proxy — o `/web` é servido
  //      atrás de auth, então chegar aqui já implica ter passado por ela.
  //
  // Chamar (b) de "anônimo · sem operador" seria mentira: a sessão É
  // autenticada. O discriminador é mandar um bearer inválido — o engine avalia
  // o header ANTES do cookie e responde 401 sempre que auth existe, enquanto um
  // engine sem auth ignora o header e responde 200.
  const junk = await probeStatus(`${API_ROOT}/workspaces`, {
    Authorization: "Bearer ai-memory-ui-probe-invalid",
  });
  if (junk === 0) return "unreachable";

  const read = await probeStatus(`${API_ROOT}/workspaces`, {});
  if (read === 401) return "unauthenticated";
  if (read !== 200) return "unreachable";

  const admin = await probeStatus(`${BASE_PATH}/admin/status`, {});

  if (junk === 401) {
    // Auth configurada: os 200 acima vêm do cookie de sessão. É um operador
    // autenticado, mas o cookie só vale para GET — daí `cookie-admin`, que vê
    // tudo e não oferece mutação até a chave ser colada.
    return admin === 200 ? "cookie-admin" : "user";
  }

  // Sem auth configurada. O degrau admin só é afirmado se observado.
  return admin === 200 ? "anonymous-admin" : "anonymous";
}

// Decisão do guard global. Só `unauthenticated` manda para o login: o degrau
// `unreachable` preserva a chave e deixa cada tela mostrar o próprio erro —
// expulsar o operador por causa de um 5xx do engine seria destrutivo.
export function shouldRedirectToLogin(current: Tier, pathname: string): boolean {
  if (current !== "unauthenticated") return false;
  return !pathname.replace(/\/+$/, "").endsWith("/login");
}

const [tier, setTier] = createSignal<Tier>("unauthenticated");
const [tierResolved, setTierResolved] = createSignal(false);

export { tier, tierResolved };

export async function refreshTier(): Promise<Tier> {
  const next = await probeTier();
  setTier(next);
  setTierResolved(true);
  return next;
}

// Entrar: guarda a chave e reavalia. Chave recusada volta `unauthenticated`
// (o próprio probe já limpou o storage).
export async function signIn(token: string): Promise<Tier> {
  setToken(token);
  return refreshTier();
}

// Resolução única por carga, compartilhada por quem precisar do tier antes de
// renderizar (o guard de rota roda no `beforeLoad`). Sem isto, cada chamada
// dispararia sondas concorrentes e o guard poderia decidir com tier obsoleto.
let inflight: Promise<Tier> | null = null;

export function ensureTier(): Promise<Tier> {
  if (tierResolved()) return Promise.resolve(tier());
  inflight ??= refreshTier().finally(() => {
    inflight = null;
  });
  return inflight;
}

export function signOut(): void {
  clearToken();
  setTier("unauthenticated");
  setTierResolved(true);
}
