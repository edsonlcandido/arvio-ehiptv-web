---
name: padroes-de-codigo
description: Convenções do projeto arvio-ehiptv-web que o Mavis precisa respeitar ao editar/criar código. Carregue antes de qualquer edit em componentes, store, lib, app ou CSS. Ajuda a não chutar classe CSS inexistente, importar do lugar certo, seguir o estilo de toast/store/actions, e manter TS limpo.
triggers:
  - "criar componente"
  - "criar skill"
  - "adicionar botão"
  - "criar painel"
  - "configurar toast"
  - "usar useApp"
  - "importar lucide"
  - "estilizar botão"
  - "criar action no store"
  - "configurar action"
  - "adicionar action"
  - "adicionar campo em settings"
  - "criar aba no settings"
language: pt-BR
---

# Padrões de código — arvio-ehiptv-web

> Referência rápida pra não chutar coisa errada. Antes de criar/editar
> componente, lib, store, action ou CSS, leia a seção relevante.

## TypeScript

- `tsconfig.json` é `strict: true`. Não usar `any`, `as any` ou `// @ts-ignore` salvo motivo muito forte (e mesmo assim pedir).
- Antes de commitar, rodar `node ./node_modules/typescript/bin/tsc --noEmit` (PowerShell não roda `npx tsc` por causa da ExecutionPolicy).
- Path alias único: `@/*` → raiz do projeto. **Sempre** importar de `@/lib/...`, `@/components/...`, `@/app/...`. Nunca `../../...`.
- Sem default exports. Sempre `export function Foo() {}` ou `export const Foo = () => {}`.

## Server vs Client

- `"use client"` **só** quando o arquivo usa hooks (`useState`, `useEffect`, `useCallback`), eventos ou acessa `window`/`localStorage`.
- Server components por padrão (sem `"use client"`) — fetch direto, sem hooks.
- `"use client"` no topo, linha 1, antes de qualquer import.

## Estrutura de pastas

```
app/                  # Next App Router (rotas, API routes, layout, globals.css)
  api/
    tmdb/[...path]/   # proxy TMDB
    xtream/           # proxy Xtream (get_series_info etc.)
    proxy/            # relay HTTPS→HTTP pra streams
components/           # client components
  home/
  media/              # MediaCard, MediaRail, LazyRail
  details/            # DetailsDrawer
  player/             # PlayerOverlay
  settings/           # SettingsScreen
  ui/                 # primitivos compartilhados (se houver)
lib/                  # lógica de domínio (server + client safe)
  store.tsx           # AppContext (useApp), state global
  ehiptv.ts           # Xtream + PocketBase
  tmdb.ts             # cliente TMDB
  types.ts            # MediaItem, EpisodeInfo, AppSettings, ...
  http.ts             # jsonRequest, proxiedUrl
  config.ts           # imageBase, backdropBase
  addons.ts
  ...
```

## Estilo de componente

```tsx
"use client";

import { Play } from "lucide-react";
import { useState } from "react";
import { useApp } from "@/lib/store";
import type { MediaItem } from "@/lib/types";

export function MyThing({ item }: { item: MediaItem }) {
  const { settings } = useApp();
  const [busy, setBusy] = useState(false);
  // ...
}
```

- **Function declarations** com `export function NomeDoComponente`.
- **Props inline** com `type Props = {...}` ou inline direto. Não criar `interface` se a prop é simples.
- Desestruturar `useApp()` em uma linha quando há muitas props.
- Não usar arrow function pra componente (function declaration exportada).

## Classes CSS (NÃO inventar!)

Sempre conferir em `app/globals.css` antes de usar uma classe. As que existem de verdade:

| Classe | Onde usar |
|---|---|
| `.primary` | Botão principal (branco, fundo escuro). **NÃO** `primary-button` — não existe. |
| `.secondary` | Botão secundário (transparente, circular). |
| `.icon-button` | Botão só com ícone (circular, 38×38). |
| `.danger` | Variante destrutiva (ex: Trash2). |
| `.pill` | Pílula usada em tabs/filtros. |
| `.pill.active` | Estado ativo da pílula. |
| `.empty` | Texto auxiliar cinza (estado vazio). |
| `.is-active` | Linha/item ativo (lista de episódios, season-tab). |
| `.is-unavailable` | Linha indisponível (cinza, desabilitada). |
| `.player-overlay` | Overlay do player fullscreen. |
| `.settings-list` / `.settings-list-row` | Listagem no Settings. |

Pra cor, espaçamento, hover, focus-visible: **não duplicar estilo inline**. Usar a classe existente e sobrescrever só quando inevitável (ex: botão WhatsApp verde que precisei colocar no Settings).

## Ícones

- `lucide-react`. Importar **nomeado**: `import { Play, Trash2, Plus, Eye, EyeOff, Star, X, UserCircle, Captions, Languages, LayoutGrid, ListVideo, Network, RotateCcw, Server, Subtitles, Tv, KeyRound, Info, Clapperboard, Check, MessageCircle, MessageSquare } from "lucide-react";`
- Tamanho padrão: `size={18}` pra ícone em botão, `size={24}` em destaque, `size={32}` em hero.
- Pra botão **só com ícone**: `<button className="icon-button"><Trash2 size={18} /></button>`.
- **Não** existe ícone do WhatsApp no lucide. Pra esse caso, SVG inline (ver `SettingsScreen.tsx` botão WhatsApp).

## Store (`lib/store.tsx`)

- Acesso via `const { foo, bar } = useApp();`. Não chamar `useApp()` duas vezes.
- **Action nova** segue o padrão:
  ```tsx
  const myAction = useCallback(async (args) => {
    // 1. valida
    if (!condition) { setToast("mensagem em PT-BR"); return; }
    // 2. loading
    setBusy("Carregando…");
    // 3. trabalho
    try {
      const result = await someAsyncWork();
      setState(result);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Falhou");
    } finally {
      setBusy("");
    }
  }, [deps]);
  ```
- Toast **sempre em PT-BR**.
- `setBusy("")` no `finally` pra liberar o overlay.
- Adicionar a action no `useMemo` que monta o `value` do `AppContext.Provider` (perto do final do `AppProvider`).

## Settings

- Schema de `AppSettings` em `lib/types.ts` (ou `lib/store.tsx` perto de `defaultSettings`).
- Campo novo → adicionar em `defaultSettings` + no `Row` correspondente em `components/settings/SettingsScreen.tsx`.
- Migração de schema: incrementar `CURRENT_SETTINGS_VERSION` em `lib/store.tsx` e adicionar bloco `if (version < N)` no `useState` inicial de `settings`.

## Erros / toasts

Mensagens comuns (manter consistência):

| Situação | Mensagem |
|---|---|
| Sem credencial Eh!IPTV | `"Adicione suas credenciais em Configurações → Conta Eh!IPTV"` |
| Série sem episódio | `"Selecione um episódio para reproduzir"` |
| Conteúdo sem `stream_id`/`series_id` | `"Conteúdo indisponível no momento"` |
| Erro genérico de reprodução | `"Não foi possível preparar a reprodução"` |
| Sem trailer | `"No trailer available for this title."` (deixar EN pq o original é EN) |

## Proxy / mixed content

- Site roda em HTTPS, Xtream/PocketBase em HTTP.
- Stream final **sempre** envelopada em `/api/proxy?url=<ENCODED_URL>` antes de ir pro `<video>`. Não tentar tocar HTTP direto — browser bloqueia.
- Chamadas JSON (ex: `get_series_info`) vão por `/api/xtream?url=…`.

## Cache

- `lib/ehiptv.ts` tem dois caches em memória: `seriesInfoCache` (5 min) e `seriesEpisodeCache` (5 min). Limpar com `clearSeriesEpisodeCache()` em logout/troca de credencial.
- `lib/tmdb.ts` tem `basicItemCache`, `seasonCache`, `logoCache` — todos em memória, sem TTL explícito (vivem até reload).

## Logs / debug

- Não usar `console.log` em produção. Se for debug temporário, deixar `// TODO: remover` e voltar pra remover.
- Erro visível pro usuário → `setToast(message)`.
- Erro só pra dev → `console.error` ou swallow em `try/catch`.

## Pra criar uma skill nova do projeto

Estrutura:

```
.harness/skills/<nome-da-skill>/
  SKILL.md                    # entrada principal (frontmatter + corpo)
  references/                 # docs de apoio (opcional)
    <topico>.md
```

SKILL.md começa com frontmatter YAML:

```yaml
---
name: <slug>
description: <1-2 frases explicando quando carregar>
triggers:
  - "frase que dispara a skill"
  - "outra frase"
language: pt-BR
---
```

## Resumo das mancadas que eu já dei e que essa skill tenta evitar

1. Usei `className="primary-button"` que **não existe** — classe certa é `.primary`.
2. Chutei `settings` no escopo errado (sub-componente) — `useApp()` precisa estar **dentro** do componente que usa.
3. Hard-codei `en-US` em chamadas TMDB — sempre receber `settings.language`.
4. Confundi `series_id/season/episode` com `episode_id` no Xtream — ver `playback-url` skill.
