# TV ao vivo — `live`

## Fórmula

```
${PROVIDER_BASE}/live/${user}/${pass}/${stream_id}.m3u8
```

## Variáveis

- **PROVIDER_BASE**: base do Xtream. Ex.: `http://dnstv.top`.
- **user** e **pass**: credenciais (URL-encoded).
- **stream_id**: id do canal (vem do `get_live_streams` ou do M3U importado).
- **`.m3u8`**: extensão fixa do projeto. HLS (HTTP Live Streaming).

## Endpoint Xtream pra listar canais

```
GET /player_api.php
  ?username=${user}
  &password=${pass}
  &action=get_live_streams
```

Ou categorias:
```
GET /player_api.php
  ?username=${user}
  &password=${pass}
  &action=get_live_categories
```

## Fluxo no app

1. Usuário abre a seção "TV ao vivo" (categoria `live`).
2. App mostra canais carregados de um M3U importado ou da Xtream.
3. Click num canal → `playChannel(channel)` em `lib/store.tsx` (separado de `playEhIptv`).
4. URL do canal já vem pronta do M3U, OU é montada com a fórmula acima.
5. `activeChannel` é setado → `PlayerOverlay` toca.
6. Se site HTTPS e URL HTTP, envelopa em `/api/proxy?url=…`.

## Diferença do filme/série

- `activeStream` (filme + série) e `activeChannel` (live) são **dois
  estados separados** no store.
- `PlayerOverlay` decide qual renderizar baseado em qual está populado.
- Live **não passa** por `buildPlaybackUrl` — a URL vem do M3U ou é
  montada inline no `playChannel` (sem helper compartilhado por enquanto).

## Exemplo real

```
http://dnstv.top/live/52514cxb/tmt83747/1234.m3u8
```

> O `stream_id` varia por canal. Pra encontrar o id de um canal específico,
> o jeito mais fácil é abrir o M3U importado (linha com `#EXTINF` + url).

## Casos especiais

- **Sem credencial** → toast pedindo credenciais.
- **Stream 404 / timeout** → toast genérico `"Stream indisponível"`. Verificar se o `stream_id` existe na Xtream (`get_live_streams`).
- **M3U mal formatado** → app ignora entradas inválidas e segue com as válidas.
