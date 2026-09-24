import { Portal } from "@solidjs/web";
import { Show, onSettled } from "solid-js";

import { Button } from "~/components/button";
import { t } from "~/lib/i18n";
import * as m from "~/paraglide/messages";

// Confirmação de ação irreversível. O portal fica acima dos outros diálogos.
export function ConfirmDialog(props: {
  body: string;
  confirmLabel: string;
  destructive?: boolean;
  error?: string | null;
  pending?: boolean;
  title: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  let dialog: HTMLDivElement | undefined;

  onSettled(() => {
    dialog?.focus();
  });

  return (
    <Portal>
      <div
        class="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
        role="presentation"
        onClick={() => {
          if (!props.pending) props.onClose();
        }}
      >
        <div
          ref={dialog}
          aria-modal="true"
          class="flex w-[420px] max-w-full flex-col gap-4 rounded-lg border border-hairline bg-content-bg p-4 shadow-card outline-none focus-visible:ring-2 focus-visible:ring-ring"
          role="dialog"
          tabindex="-1"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "Escape" && !props.pending) props.onClose();
          }}
        >
          <h2 class="text-sm font-medium">{props.title}</h2>
          <p class="text-sm text-muted-foreground">{props.body}</p>
          <Show when={props.error}>
            {(message) => (
              <p class="text-sm text-destructive" role="alert">
                {message()}
              </p>
            )}
          </Show>
          <div class="flex justify-end gap-2">
            <Button
              class="font-normal"
              disabled={props.pending}
              type="button"
              variant="outline"
              onClick={props.onClose}
            >
              {t(() => m.confirm_cancel())}
            </Button>
            <Button
              disabled={props.pending}
              type="button"
              variant={props.destructive ? "destructive" : "default"}
              onClick={() => props.onConfirm()}
            >
              {props.confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
