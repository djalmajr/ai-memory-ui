import { useLocale } from "~/lib/i18n";
import * as m from "~/paraglide/messages";

// O engine usa três unidades de tempo, dependendo da rota:
//
// - `/api/v1/*`                              → string RFC3339 ("2026-08-29T12:00:00Z")
// - `/admin/users`, propostas (`staged_at`)  → i64 microssegundos
// - `/admin/checkpoints` (`time`)            → i64 segundos Unix
//
// Um número cru é ambíguo entre µs, s e ms por ordens de grandeza, então cada
// origem tem seu construtor explícito. Converta na borda da API e passe `Date`
// adiante; nunca entregue o número do engine direto a um formatador.

export function fromRfc3339(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date;
}

export function fromMicros(value: number | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const date = new Date(value / 1000);
  return Number.isNaN(date.valueOf()) ? null : date;
}

export function fromUnixSeconds(value: number | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const date = new Date(value * 1000);
  return Number.isNaN(date.valueOf()) ? null : date;
}

// Data + hora curtas, no locale ativo. `null` vira travessão.
export function formatDateTime(date: Date | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat(useLocale(), {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

// Dia/hora curtos usados nas listas de páginas recentes. Mantém o fallback
// "sem atualizações" das mensagens.
export function formatDateShort(value: string | null | undefined): string {
  if (!value) {
    useLocale();
    return m.recent_no_updates();
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat(useLocale(), {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  }).format(date);
}

// Tempo relativo localizado ("há 2 minutos"), rastreando o locale ativo.
// `number` é interpretado como epoch em MILISSEGUNDOS — valores do engine em
// µs/s precisam passar por `fromMicros`/`fromUnixSeconds` antes.
export function formatRelative(value: Date | string | number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const ms =
    value instanceof Date
      ? value.valueOf()
      : typeof value === "number"
        ? value
        : new Date(value).valueOf();
  if (Number.isNaN(ms)) return String(value);

  const diff = ms - Date.now();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(useLocale(), { numeric: "auto" });
  const MIN = 60_000;
  const HOUR = 3_600_000;
  const DAY = 86_400_000;
  if (abs < MIN) return rtf.format(0, "minute");
  if (abs < HOUR) return rtf.format(Math.round(diff / MIN), "minute");
  if (abs < DAY) return rtf.format(Math.round(diff / HOUR), "hour");
  return rtf.format(Math.round(diff / DAY), "day");
}
