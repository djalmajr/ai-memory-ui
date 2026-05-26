import { createSignal } from "solid-js";

import { getLocale, isLocale, locales, setLocale as paraglideSetLocale } from "~/paraglide/runtime";
import type { Locale } from "~/paraglide/runtime";

// Adapter que eleva o locale do Paraglide a um signal do Solid, para que JSX
// que dependa de `useLocale()` re-renderize ao trocar de idioma. Espelha o
// padrão usado no asciimark (packages/i18n/src/solid.ts). Persistência fica a
// cargo da estratégia `localStorage` configurada no plugin Vite do Paraglide.
const [localeSignal, setLocaleSignal] = createSignal<Locale>(getLocale());

export const useLocale = localeSignal;
export { locales };
export type { Locale };

export const localeLabels: Record<Locale, string> = { "en": "EN", "es": "ES", "pt-BR": "PT" };

export function switchLocale(next: Locale): void {
  if (!isLocale(next) || next === localeSignal()) {
    return;
  }
  paraglideSetLocale(next, { reload: false });
  setLocaleSignal(next);
}

/**
 * Lê uma mensagem do Paraglide rastreando o locale ativo, para reatividade.
 * Uso: `t(() => m.tree_pages())` ou `t(() => m.briefing_results({ count }))`.
 */
export function t(message: () => string): string {
  useLocale();
  return message();
}
