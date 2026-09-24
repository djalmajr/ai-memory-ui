---
version: alpha
name: ai-memory console
description: "Operational console for the ai-memory appliance. Tokens name the values already in src/index.css (shadcn base-nova, olive). Do not invent a second palette."
colors:
  background: "oklch(1 0 0)"
  foreground: "oklch(0.153 0.006 107.1)"
  card: "oklch(1 0 0)"
  card-foreground: "oklch(0.153 0.006 107.1)"
  primary: "oklch(0.555 0.163 48.998)"
  primary-foreground: "oklch(0.987 0.022 95.277)"
  secondary: "oklch(0.967 0.001 286.375)"
  secondary-foreground: "oklch(0.21 0.006 285.885)"
  muted: "oklch(0.966 0.005 106.5)"
  muted-foreground: "oklch(0.58 0.031 107.3)"
  accent: "oklch(0.966 0.005 106.5)"
  accent-foreground: "oklch(0.228 0.013 107.4)"
  destructive: "oklch(0.577 0.245 27.325)"
  destructive-foreground: "oklch(0.985 0 0)"
  border: "oklch(0.93 0.007 106.5)"
  input: "oklch(0.93 0.007 106.5)"
  ring: "oklch(0.737 0.021 106.9)"
  sidebar: "oklch(0.988 0.003 106.5)"
  sidebar-foreground: "oklch(0.153 0.006 107.1)"
  sidebar-accent: "oklch(0.966 0.005 106.5)"
  success: "oklch(0.723 0.219 149.579 / 10%)"
  success-foreground: "oklch(0.627 0.194 149.214)"
  warning: "oklch(0.769 0.188 70.08 / 10%)"
  warning-foreground: "oklch(0.666 0.179 58.318)"
typography:
  page-title:
    fontFamily: Noto Sans Variable
    fontSize: 0.875rem
    fontWeight: 500
    lineHeight: 1.25rem
  body-md:
    fontFamily: Noto Sans Variable
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.25rem
  help:
    fontFamily: Noto Sans Variable
    fontSize: 0.75rem
    fontWeight: 400
    lineHeight: 1rem
  stat-value:
    fontFamily: Noto Sans Variable
    fontSize: 1.0625rem
    fontWeight: 600
    lineHeight: 1.375rem
rounded:
  sm: 0.27rem
  md: 0.45rem
  lg: 0.45rem
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  content: 16px
  sidebar: 220px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    height: 32px
    padding: 10px
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    height: 32px
    padding: 10px
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    height: 32px
    padding: 10px
  button-ghost:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.foreground}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    height: 28px
    padding: 0px
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.destructive-foreground}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    height: 32px
    padding: 10px
  shell-title:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.page-title}"
    height: 32px
  help-text:
    textColor: "{colors.muted-foreground}"
    typography: "{typography.help}"
  breadcrumb-bar:
    backgroundColor: "{colors.background}"
    textColor: "{colors.muted-foreground}"
    typography: "{typography.help}"
    padding: 8px
  stat-cell:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    typography: "{typography.stat-value}"
    padding: 16px
  op-card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: 16px
  input:
    backgroundColor: "{colors.input}"
    textColor: "{colors.foreground}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    height: 32px
    padding: 8px
  sidebar:
    backgroundColor: "{colors.sidebar}"
    textColor: "{colors.sidebar-foreground}"
    width: 220px
  nav-active:
    backgroundColor: "{colors.sidebar-accent}"
    textColor: "{colors.accent-foreground}"
  quiet-fill:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-foreground}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: 8px
  focus-ring:
    backgroundColor: "{colors.ring}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
  divider:
    backgroundColor: "{colors.border}"
    height: 1px
    width: 100%
  badge-success:
    backgroundColor: "{colors.success}"
    textColor: "{colors.success-foreground}"
    typography: "{typography.help}"
    rounded: "{rounded.sm}"
  badge-warning:
    backgroundColor: "{colors.warning}"
    textColor: "{colors.warning-foreground}"
    typography: "{typography.help}"
    rounded: "{rounded.sm}"
---

## Overview

Console operacional do ai-memory. A tela é densa, calma e subordinada ao dado: wiki, sessão, handoff e operação. A hierarquia vem de alinhamento, fio de 1px e um acento âmbar. Não é superfície de marketing.

Os tokens executáveis estão em `src/index.css` (shadcn base-nova, olive, Noto Sans Variable). Este arquivo **nomeia** esses valores. Uma tela nova não inventa hex, fonte ou tamanho.

Quando as regras competem, nesta ordem:

1. Não mudar o contrato da API nem o texto que o engine devolve.
2. Manter Solid 2 e os primitivos já existentes (`Button`, `DataGrid`, `StatStrip`, `ConfirmDialog`).
3. Deixar óbvio o que a tela mostra e qual é a ação.
4. Usar só token semântico deste arquivo e de `src/index.css`.
5. Reusar a receita de uma tela que já existe antes de desenhar outra.

Leia este arquivo antes de layout novo ou de refatorar uma tela.

## Colors

A paleta clara abaixo é o bloco `:root` de `src/index.css`. O tema escuro é o bloco `.dark` do mesmo arquivo, com os mesmos nomes. Não existe segunda paleta, e este YAML não duplica o escuro.

Use classe semântica (`bg-primary`, `text-muted-foreground`, `border-hairline`). `hairline`, `content-bg` e `sidebar-bg` são aliases de `--border`, `--card` e `--sidebar`.

| Papel | Token | Uso |
| --- | --- | --- |
| Fundo da página | `background` | Header e faixa de breadcrumb |
| Texto | `foreground` | Título, célula, parágrafo |
| Ação | `primary` | Um botão primário por superfície |
| Texto da ação | `primary-foreground` | Sobre `primary` |
| Superfície | `card` | Miolo, `StatCell`, cartão de operação |
| Silêncio | `muted` / `muted-foreground` | Hover, ajuda, descrição, breadcrumb |
| Seleção de menu | `sidebar-accent` | Item ativo, sem bloco `primary` |
| Perigo | `destructive` | Confirmação irreversível |
| Fio | `border` | `border-hairline`, divisória de faixa |
| Foco | `ring` | Anel do controle |

Cor marca estado, ação ou dado. Não pinte um número de “saudável” só porque é bom. O badge de aviso usa `warning` com o texto `warning-foreground`.

`muted-foreground` no claro (`oklch(0.58 0.031 107.3)` sobre branco) mede cerca de 4.25:1 em `breadcrumb-bar` e `help-text`, abaixo de WCAG AA (4.5:1) no texto de 12px. É o cinza do appliance. Não se altera o token para calar o lint.

`badge-success` e `badge-warning` também avisam. O fundo desses tokens já é um wash a 10% e o texto é a cor forte. O lint compara os dois canais sem o papel por baixo, então o par parece falhar. Na tela o texto forte senta no wash sobre `card`. O par não muda.

O escuro usa o valor do bloco `.dark`, que é mais claro.

## Typography

Uma família: **Noto Sans Variable** (`--font-sans`). O tamanho de trabalho é o `text-sm` da plataforma.

| Papel | Token | Uso |
| --- | --- | --- |
| Título de página | `page-title` 14px / 20px, weight 500 | Uma linha no header |
| Corpo | `body-md` 14px / 20px | Parágrafo, célula, botão, `pre` e `code` do prose |
| Ajuda | `help` 12px / 16px, `muted-foreground` | Descrição do header, hint, legenda, breadcrumb |
| Valor de stat | `stat-value` 17px / 22px, weight 600 | Número do `StatCell`. O rótulo em cima é `help` |

`pre` e `code` dentro de `.prose` usam o corpo (14px / 20px), sans. Não encolhem para 12px e não sobem de entrelinha.

Mono só no CodeMirror da fonte markdown (`.cm-scroller`). Tabela, caminho, badge e `code` no chrome ficam na sans.

Não usar `text-[…]` fora desta escala. 12px existe porque a informação é secundária, não porque a tela é densa.

## Layout

O header é uma faixa compacta (`px-4 py-2`), título e controles na mesma linha, verticalmente centrados.

- Título: uma linha, `page-title`. Não é breadcrumb.
- Descrição: a linha de baixo, `help` + `muted-foreground`. Não é caminho de página.
- Idioma, tema e usuário ficam à direita, centrados no bloco.

O breadcrumb fica **abaixo** do header, numa faixa própria (`breadcrumb-bar`): encostada no header, largura do miolo, `border-b` de 1px (`divider`). Ancestrais são links. O último segmento é a página atual e não é link. Workspace abre a lista de projetos. Projeto abre a listagem da wiki. Pasta intermediária abre a wiki filtrada por aquele prefixo.

O miolo usa padding `content` (16px). Cada `gap` tem um dono, o pai (`flex` ou `grid`). O filho não soma margem própria.

- Dentro de um grupo de controles: 8px
- Entre blocos da página: 16px
- Sidebar: 220px

Tela com mais de um bloco de trabalho usa aba (`Tabs`). No workspace, Projects é a primeira aba. Métricas é a segunda e reúne os números e a saúde da memória. Danger zone é a seguinte e só existe para quem pode mutar.

Não colocar breadcrumb, subtítulo de caminho ou hero no header.

## Elevation & Depth

Plano. Cartão de dashboard e faixa de stat não têm sombra. A separação é o fio `border`.

Overlay (`ConfirmDialog`, popover, menu) usa a superfície do primitivo. Não se redesenha a elevação na página. Ação irreversível abre `ConfirmDialog`. Não usar `window.alert`, `confirm` ou `prompt`.

## Shapes

`--radius` é `0.45rem` (`rounded.md` / `rounded.lg`). `rounded.sm` é 0.6 desse valor. Pílula não é o chip padrão. Radio e switch continuam redondos porque a forma é o controle.

## Components

Primitivos em `src/components`. Não recriar Button, checkbox, select, dialog.

### Header

Título à esquerda, descrição embaixo, cluster de idioma/tema/usuário à direita. Altura do controle do cluster: 32px. Ícone de chrome: 16px.

### Breadcrumb

Faixa `breadcrumb-bar` com borda inferior. Link ancestral: cor `muted-foreground`, hover no `foreground`. Último item: `foreground`, weight 500, sem link.

### StatStrip e StatCell

Números de overview, briefing e resultado de operação usam `StatStrip`: uma borda, células divididas por fio. `StatCell` tem o rótulo (`help`) em cima e o valor (`stat-value`) embaixo. Não recriar o `Metric` antigo (valor em cima, rótulo embaixo).

### Cartão de operação

`op-card`: título `body-md` medium, descrição `help`, botão `button-outline` à direita com o rótulo Executar / Run. Enquanto corre, o rótulo é o estado pendente. Checkbox é o primitivo `Checkbox`, não o input nativo com `accent`.

### Botão

`button-primary` uma vez por superfície, para a ação principal. O resto é `button-outline` ou `button-ghost`. Ação de linha (renomear, mover, apagar) é `button-ghost` de 28px, só ícone, com tooltip no nome da ação. Ícone 16px.

### Campo

`input` a 32px. Label em `body-md`. A ajuda do campo é `help-text`, não corpo.

## Do's and Don'ts

- Do ler este arquivo antes de layout novo ou de refatorar uma tela.
- Do usar classe semântica (`bg-primary`, `text-muted-foreground`, `border-hairline`).
- Do manter o header com título de uma linha e descrição `text-xs`.
- Do colocar o breadcrumb na faixa com `border-b`, com o último segmento sem link.
- Do usar `StatStrip` / `StatCell` para número de overview.
- Do usar botão outline no cartão de operação e icon button com tooltip na linha.
- Do abrir `ConfirmDialog` antes de ação irreversível.
- Don't inventar hex, segunda fonte, ou `text-[…]` fora da escala.
- Don't colocar caminho de página no título do header.
- Don't usar mono fora do CodeMirror da fonte markdown.
- Don't usar `window.alert` / `confirm` / `prompt`.
- Don't tratar este arquivo como licença para redesenhar tela que não é a tarefa.
