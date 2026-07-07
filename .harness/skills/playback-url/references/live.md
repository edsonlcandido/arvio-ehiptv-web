# TV ao vivo — `live`

> A partir da v3 do schema, a TV ao vivo não usa mais playlist M3U: os
> canais e o EPG vêm direto da API Xtream Codes do provedor configurado
> em **Configurações → Conta Eh!IPTV** (`streamServices[0]`).

## Fórmula

```
${PROVIDER_BASE}/live/${user}/${pass}/${stream_id}.m3u8
```

- **PROVIDER_BASE**: base do Xtream. Ex.: `http://dnstv.top`.
- **user** e **pass**: credenciais (URL-encoded).
- **stream_id**: id do canal retornado por `get_live_streams`.
- **`.m3u8`**: extensão fixa do projeto. HLS (HTTP Live Streaming).

## Endpoints Xtream usados

**Canais** (lista plana de streams com `category_id`):

```
GET /player_api.php
  ?username=${user}
  &password=${pass}
  &action=get_live_streams
```

**Categorias** (vira a coluna da esquerda na tela de TV):

```
GET /player_api.php
  ?username=${user}
  &password=${pass}
  &action=get_live_categories
```

**EPG** (XMLTV — alimenta o now/next de cada canal):

```
GET /epg.php
  ?username=${user}
  &password=${pass}
```

> O `epg.php` é convenção Xtream Codes, mas **a base do EPG é
> separada da base dos canais** — o canal list vem do provedor
> configurado em `streamServices[0]` (ex.: `dnstv.top`), e o EPG
> vem de um agregador dedicado (`p1fast.com`) que espelha o `tvg-id`
> de cada canal usando as mesmas credenciais.
>
> A base do EPG tá hard-coded em `lib/iptv.ts` como `EPG_BASE_URL` —
> não é configurável hoje, porque operadores raramente trocam de
> backend de EPG e expor outro campo em Settings só aumenta a
> superfície de erro.

## Fluxo no app

1. App faz `loadIptvSnapshot(service)` em `lib/iptv.ts`, onde `service`
   é o `streamServices[0]` ativo (com `username`, `password`, `baseUrl`).
2. `loadIptvSnapshot` busca `get_live_streams` + `get_live_categories`
   em paralelo via `/api/xtream`, mapeia `category_id` → nome de grupo,
   e envelopa a URL de cada canal em `/api/proxy?url=…` (mixed-content
   safe).
3. Em paralelo busca o EPG em `http://p1fast.com/epg.php?username=…&password=…`
   (mesmas credenciais do `service`, base hard-coded em `EPG_BASE_URL`),
   parseia o XMLTV e cruza `tvg-id` com os canais.
4. `LiveTvScreen` renderiza a coluna da esquerda (categorias + "Todas"
   + "Favoritos") e o browser da direita (cards `.channel-row` com EPG
   now/next + barra de progresso).
5. Click num canal → `playChannel(channel)` em `lib/store.tsx`. O
   `streamUrl` já vem pronto do snapshot (envelopado em proxy), então
   `playChannel` só seta `activeChannel` + `activeStream`.
6. `PlayerOverlay` toca.

## Diferença do filme/série

- `activeStream` (filme + série) e `activeChannel` (live) são **dois
  estados separados** no store.
- `PlayerOverlay` decide qual renderizar baseado em qual está populado.
- Live **não passa** por `buildPlaybackUrl` — a URL já vem envelopada
  em `/api/proxy` direto do `loadIptvSnapshot`.

## Onde o código vive

- `lib/iptv.ts` — `loadIptvSnapshot(service)`, `loadXtreamLiveChannels`,
  `loadNowNext`, parser XMLTV. EPG vem de `buildEpgUrl(service)`.
- `lib/store.tsx` — `playChannel` (envelopa em `activeStream`).
- `components/livetv/LiveTvScreen.tsx` — UI (categorias à esquerda,
  canais filtrados à direita).
- `app/api/xtream/route.ts` — proxy genérico do `player_api.php`
  (cache de 2min pra `get_live_streams`, 1h pra `get_live_categories`).
- `app/api/proxy/route.ts` — relay HTTPS→HTTP dos streams `.m3u8`.

## Exemplo real (operador padrão)

```
http://dnstv.top/live/52514cxb/tmt83747/1234.m3u8
```

> O `stream_id` varia por canal. Pra achar o id de um canal específico,
> abrir `get_live_streams` direto na URL do provedor — o JSON lista
> todos os canais com `stream_id` + `category_id` + `epg_channel_id`.

## Casos especiais

- **Sem credencial em `streamServices[0]`** → tela mostra "Configure sua
  conta Eh!IPTV" com link pra Configurações. Sem toast — o usuário já
  tá na tela certa pra resolver.
- **Credencial existe, canais não carregam** → tela mostra "Carregando
  canais…" indefinidamente (sem spinner; o `console.warn` do
  `loadXtreamLiveChannels` registra o erro pra debug).
- **Stream 404 / timeout** → toast genérico `"Stream indisponível"`. Verificar
  se o `stream_id` existe na Xtream (`get_live_streams`) e se o provider
  tá online.
- **EPG vazio / `epg.php` offline** → canais aparecem sem now/next
  (o card mostra só o nome). Sem toast — falha de EPG não bloqueia
  navegação.
