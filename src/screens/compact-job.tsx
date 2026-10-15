import { Show, createSignal, onCleanup } from "solid-js";

import { Button } from "~/components/button";
import { ConfirmDialog } from "~/components/confirm-dialog";
import {
  adminCompact,
  adminCompactStatus,
  adminStatus,
  createCompactPoll,
  elapsedSince,
  formatApproxDuration,
  formatElapsed,
  pollDisposed,
  pollFailed,
  pollJobDecided,
  pollRequested,
  pollStarted,
  pollSucceeded,
  shouldKeepPolling,
  type CompactJobStatus,
  type CompactReport,
} from "~/lib/admin-api";
import type { StorageStatus } from "~/lib/admin-types";
import { canMutate, tier } from "~/lib/auth";
import { t } from "~/lib/i18n";
import { formatBytes } from "~/lib/utils";
import * as m from "~/paraglide/messages";

// Compactação em segundo plano (S21). O proxy corta a request em 120 s (524)
// enquanto o VACUUM segue no servidor; por isso o dialog só dispara o job e a
// tela acompanha o estado por `GET /admin/compact`.

const COMPACT_POLL_MS = 3_000;
/** Bloqueio do botão após 504/524 de um engine sem job em segundo plano:
 *  nesse caso a tela não tem como saber quando o VACUUM termina. */
const COMPACT_BLOCK_MS = 10 * 60 * 1_000;

// Módulo, não componente: o bloqueio sobrevive a sair e voltar da tela dentro
// da mesma aba, sem `localStorage` (um reload zera de propósito).
const [blockedUntil, setBlockedUntil] = createSignal(0);
let blockTimer: ReturnType<typeof setTimeout> | undefined;

function blockCompact(): void {
  clearTimeout(blockTimer);
  setBlockedUntil(Date.now() + COMPACT_BLOCK_MS);
  blockTimer = setTimeout(() => setBlockedUntil(0), COMPACT_BLOCK_MS);
}

function failMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function ResultLine(props: { report: CompactReport }) {
  return (
    <p class="font-mono text-sm text-muted-foreground">
      {t(() =>
        m.ops_compact_result({
          after: formatBytes(props.report.bytes_after),
          before: formatBytes(props.report.bytes_before),
          reclaimed: formatBytes(props.report.bytes_reclaimed),
        }),
      )}
    </p>
  );
}

export function CompactCard() {
  const [dialogOpen, setDialogOpen] = createSignal(false);
  const [pending, setPending] = createSignal(false);
  const [startError, setStartError] = createSignal<string | null>(null);
  const [storage, setStorage] = createSignal<StorageStatus | null>(null);
  const [job, setJob] = createSignal<CompactJobStatus | null>(null);
  // Resultado de um engine antigo que rodou síncrono (sem job para consultar).
  const [syncReport, setSyncReport] = createSignal<CompactReport | null>(null);
  const [alreadyRunning, setAlreadyRunning] = createSignal(false);
  const [pollError, setPollError] = createSignal<string | null>(null);
  const [now, setNow] = createSignal(Date.now());

  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let tickTimer: ReturnType<typeof setInterval> | undefined;
  let disposed = false;
  // Estado do agendador (puro, em admin-api.ts); aqui só ligamos timers e fetch.
  let machine = createCompactPoll();

  const stopTick = () => {
    clearInterval(tickTimer);
    tickTimer = undefined;
  };

  onCleanup(() => {
    disposed = true;
    machine = pollDisposed(machine);
    clearTimeout(pollTimer);
    stopTick();
  });

  // A contagem de 1 s só existe enquanto `running`; entre polls ela evita o
  // relógio parado por até 3 s.
  const applyJob = (next: CompactJobStatus) => {
    setJob(next);
    setNow(Date.now());
    if (shouldKeepPolling(next)) {
      tickTimer ??= setInterval(() => setNow(Date.now()), 1_000);
    } else {
      stopTick();
    }
  };

  const schedulePoll = () => {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(() => void poll(), COMPACT_POLL_MS);
  };

  // Um poll por vez. Pedido com outro em voo fica na fila do agendador e roda
  // quando o ciclo atual termina. A decisão de continuar usa o job recebido,
  // não o sinal: no Solid 2 `job()` só reflete a escrita depois do flush.
  const poll = async () => {
    const request = pollRequested(machine);
    machine = request.state;
    if (!request.run) return;
    clearTimeout(pollTimer);
    const started = pollStarted(machine);
    machine = started.state;
    let next = false;
    try {
      const received = await adminCompactStatus();
      const settled = pollSucceeded(machine, started.token, received);
      machine = settled.state;
      next = settled.next;
      if (settled.apply) {
        setPollError(null);
        // `null`: engine sem a rota. Mantém o fluxo síncrono de antes.
        if (received) applyJob(received);
      }
    } catch (error) {
      const settled = pollFailed(machine, started.token);
      machine = settled.state;
      next = settled.next;
      // Falha transitória (rede, proxy, teto do GET) não encerra o
      // acompanhamento de um job que continua no servidor.
      if (settled.apply) setPollError(failMessage(error));
    }
    if (next) schedulePoll();
  };

  // No mount: o job pode já estar correndo (outra aba, outro operador).
  void poll();

  const openDialog = () => {
    setStartError(null);
    setStorage(null);
    setDialogOpen(true);
    // Contexto opcional: sem `storage` (ou com falha) o dialog segue sem ele.
    void adminStatus()
      .then((status) => {
        if (!disposed) setStorage(status.storage ?? null);
      })
      .catch(() => undefined);
  };

  const confirm = async () => {
    setPending(true);
    setStartError(null);
    try {
      const result = await adminCompact();
      if (disposed) return;
      machine = pollJobDecided(
        machine,
        result.kind === "started" || result.kind === "running" ? result.job : null,
      );
      setSyncReport(null);
      setAlreadyRunning(false);
      switch (result.kind) {
        case "started":
          applyJob(result.job);
          break;
        case "running":
          setAlreadyRunning(true);
          if (result.job) applyJob(result.job);
          break;
        case "report":
          setJob(null);
          stopTick();
          setSyncReport(result.report);
          break;
        case "timeout":
          setJob(null);
          stopTick();
          blockCompact();
          break;
      }
      setDialogOpen(false);
      // 202 e 409 já trazem o job; o poll seguinte o acompanha. No 524/504 de
      // um engine antigo o GET responde 405 e o poll vira no-op.
      if (result.kind !== "report") schedulePoll();
    } catch (error) {
      setStartError(failMessage(error));
    } finally {
      setPending(false);
    }
  };

  const running = () => shouldKeepPolling(job());

  return (
    <section class="flex flex-col gap-4 rounded-lg border border-hairline p-4">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0 flex-1">
          <h2 class="text-sm font-medium">{t(() => m.ops_compact_title())}</h2>
          <p class="text-xs text-muted-foreground">{t(() => m.ops_compact_desc())}</p>
        </div>
        <Button
          class="shrink-0"
          disabled={!canMutate(tier()) || running() || blockedUntil() > 0}
          type="button"
          variant="outline"
          onClick={openDialog}
        >
          {running() ? t(() => m.ops_running()) : t(() => m.ops_execute())}
        </Button>
        <Show when={dialogOpen()}>
          <ConfirmDialog
            body={
              storage()
                ? `${t(() => m.ops_compact_desc())} ${t(() =>
                    m.ops_compact_storage({
                      database: formatBytes(storage()?.database_bytes),
                      reclaimable: formatBytes(storage()?.reclaimable_bytes),
                    }),
                  )}`
                : t(() => m.ops_compact_desc())
            }
            confirmLabel={t(() => m.ops_compact_confirm())}
            error={startError()}
            pending={pending()}
            title={t(() => m.ops_compact_title())}
            onClose={() => setDialogOpen(false)}
            onConfirm={() => void confirm()}
          />
        </Show>
      </div>

      <Show when={blockedUntil() > 0}>
        <p
          class="rounded-md bg-warning px-3 py-2 text-xs text-warning-foreground"
          data-testid="compact-timeout-notice"
          role="status"
        >
          {t(() => m.ops_compact_timeout())}
        </p>
      </Show>

      <Show when={alreadyRunning() && running()}>
        <p class="text-xs text-muted-foreground" role="status">
          {t(() => m.ops_compact_already_running())}
        </p>
      </Show>

      <Show when={job()}>
        {(current) => (
          <div class="flex flex-col gap-2" data-testid="compact-job">
            <Show when={current().state === "running"}>
              <div class="flex items-center gap-2 text-sm">
                {/* Indeterminado de propósito: o SQLite não reporta progresso. */}
                <span
                  aria-hidden="true"
                  class="size-2 shrink-0 animate-pulse rounded-full bg-warning-foreground motion-reduce:animate-none"
                />
                <span role="status">{t(() => m.ops_compact_state_running())}</span>
                <span class="tabular-nums text-muted-foreground" data-testid="compact-elapsed">
                  {formatElapsed(elapsedSince(current(), now()))}
                </span>
              </div>
              <Show when={current().database_bytes_at_start !== null}>
                <p class="text-xs text-muted-foreground">
                  {t(() =>
                    m.ops_compact_database_at_start({
                      size: formatBytes(current().database_bytes_at_start),
                    }),
                  )}
                </p>
              </Show>
              <Show when={current().reclaimable_bytes_at_start !== null}>
                <p class="text-xs text-muted-foreground">
                  {t(() =>
                    m.ops_compact_reclaimable_at_start({
                      size: formatBytes(current().reclaimable_bytes_at_start),
                    }),
                  )}
                </p>
              </Show>
              <Show when={current().previous_duration_ms !== null}>
                <p class="text-xs text-muted-foreground">
                  {t(() =>
                    m.ops_compact_previous({
                      duration: formatApproxDuration(current().previous_duration_ms ?? 0),
                    }),
                  )}
                </p>
              </Show>
            </Show>
            <Show when={current().state === "succeeded"}>
              <p class="text-sm" role="status">
                {t(() => m.ops_compact_state_succeeded())}
              </p>
              <Show when={current().report}>{(report) => <ResultLine report={report()} />}</Show>
            </Show>
            <Show when={current().state === "failed"}>
              <p class="text-sm text-destructive" role="alert">
                {current().error ?? t(() => m.ops_compact_state_failed())}
              </p>
            </Show>
          </div>
        )}
      </Show>

      <Show when={pollError() && running()}>
        <p class="text-xs text-destructive" role="alert">
          {pollError()}
        </p>
      </Show>

      <Show when={syncReport()}>{(report) => <ResultLine report={report()} />}</Show>
    </section>
  );
}
