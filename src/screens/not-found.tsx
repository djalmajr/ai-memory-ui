import { Shell } from "~/components/shell";
import { EmptyState } from "~/components/ui-bits";
import { t } from "~/lib/i18n";
import * as m from "~/paraglide/messages";

// 404 dentro do shell: quem digitou um caminho errado continua com a navegação
// à mão em vez de cair numa página nua.
export function NotFoundScreen() {
  return (
    <Shell level="server" heading={<span>{t(() => m.notfound_title())}</span>}>
      <EmptyState title={t(() => m.notfound_title())} body={t(() => m.notfound_body())} />
    </Shell>
  );
}
