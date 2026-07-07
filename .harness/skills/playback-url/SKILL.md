---
name: playback-url
description: Gera URLs de playback Eh!IPTV/Xtream Codes para filmes, episódios de série e TV ao vivo no projeto arvio-ehiptv-web. Carregue quando o usuário pedir pra montar, depurar ou explicar a URL que o player consome — em particular nas chamadas a `buildPlaybackUrl`, `playEhIptv`, `playChannel`, ou quando aparecer `/api/proxy` / `/api/xtream` no path de uma stream.
triggers:
  - "gerar url do player"
  - "montar url de reprodução"
  - "url do xtream"
  - "url de filme"
  - "url de série"
  - "url de episódio"
  - "url de tv ao vivo"
  - "url de canal"
  - "playback url"
  - "buildPlaybackUrl"
  - "playEhIptv"
  - "playChannel"
language: pt-BR
---

# Playback URL — arvio-ehiptv-web

> **Aviso de segurança**: esta skill contém credenciais reais do operador
> (dnstv.top / 52514cxb / tmt83747) porque o usuário pediu exemplos reais.
> Se for expor o repositório publicamente, **substitua por placeholders**
> (`<USER>`, `<PASS>`, `<SENHA>`) antes do commit final.

Gera a URL que o `PlayerOverlay` consome para os três tipos de conteúdo
suportados pelo web player. O player aceita HTTP e HTTPS — quando o site
roda em HTTPS e o servidor Xtream é HTTP (caso comum: dnstv.top), a URL
final passa por `/api/proxy` (relay server-side) para evitar erro de
mixed content.

## Quando usar

- O usuário pede pra "tocar", "reproduzir", "abrir no player" um filme,
  episódio de série ou canal ao vivo.
- Aparece referência a `buildPlaybackUrl`, `playEhIptv`, `playChannel`,
  `activeStream` ou `activeChannel` no código.
- O log do navegador mostra a URL montada e o usuário quer entender/depurar.
- A chamada `fetch` no DevTools aponta pra `/api/xtream?url=…` ou
  `/api/proxy?url=…`.

## Onde o código vive

- `lib/ehiptv.ts` — `buildPlaybackUrl`, `fetchSeriesInfo`,
  `resolveSeriesEpisodeId`, `PlaybackService`, `StreamOption`.
- `lib/store.tsx` — `playEhIptv` (filme + episódio), `playChannel` (live).
- `components/player/PlayerOverlay.tsx` — consumidor final (toca `activeStream.url` ou `activeChannel.url`).
- `app/api/proxy/route.ts` — relay HTTPS→HTTP.
- `app/api/xtream/route.ts` — relay genérico pra chamadas JSON (ex.: `get_series_info`).

## As três fórmulas

### 1. Filme (`kind = "movie"`)

```
${PROVIDER_BASE}/movie/${user}/${pass}/${stream_id}.${ext}
```

- `PROVIDER_BASE` = base do Xtream (ex.: `http://dnstv.top`).
- `user` e `pass` = credenciais (URL-encoded).
- `stream_id` = id Xtream do filme (vem do PocketBase, campo `stream_id`).
- `ext` = `mp4` por padrão (alguns provedores usam `mkv`, `ts`, `avi` — o PocketBase pode informar).

**Exemplo real** (com o operador padrão):
```
http://dnstv.top/movie/52514cxb/tmt83747/408996.mp4
```

### 2. Episódio de série (`kind = "tv"`)

A URL **NÃO** usa `(series_id, season, episode)`. Ela usa o **episode_id
Xtream** retornado por `get_series_info`:

```
${PROVIDER_BASE}/series/${user}/${pass}/${episode_id}.${ext}
```

- `episode_id` = id do EPISÓDIO (string tipo `"122867"`, NÃO o `episode_num`).
- `ext` = `container_extension` retornado pela Xtream (quase sempre `mp4`).

**Fluxo obrigatório** antes de montar a URL de série:

1. O PocketBase (`imdb_stream_series`) tem o `series_id` da Xtream para aquele TMDB.
2. Chamar `get_series_info?series_id=…` (via `/api/xtream`) pra listar episódios.
3. Localizar o `episode_id` correto pelo par `(season, episode_num)`.
4. Montar a URL com `episode_id` e `container_extension`.

**Exemplo real** — `A Casa do Dragão` S01E01 (episode_id `122867`):
```
http://dnstv.top/series/52514cxb/tmt83747/122867.mp4
```

> **Pegadinha histórica**: já tentamos montar com
> `…/series/.../<series_id>/<season>/<episode>.mp4` (atalho antigo) e
> quebrou em vários provedores. **Sempre** resolva o `episode_id` real
> via `get_series_info`.

### 3. TV ao vivo (`live`)

```
${PROVIDER_BASE}/live/${user}/${pass}/${stream_id}.m3u8
```

- `stream_id` = id do canal no Xtream (vem do `get_live_streams` ou do M3U).
- `.m3u8` é a extensão padrão do projeto (HLS).
- A chamada `get_live_streams` retorna o `stream_id` por canal.

**Exemplo real**:
```
http://dnstv.top/live/52514cxb/tmt83747/1234.m3u8
```

## Como a URL chega no player

1. **Geração**: `playEhIptv` (filme/série) ou `playChannel` (live) monta a URL com `buildPlaybackUrl` ou similar.
2. **Proxy** (se HTTPS→HTTP): a URL é envelopada:
   ```
   https://<seu-site>/api/proxy?url=<URL_xtream_ENCODED>
   ```
   O `app/api/proxy/route.ts` faz `fetch(URL_xtream)` server-side e stream-a pro `<video>`.
3. **Player**: `PlayerOverlay` recebe `activeStream.url` ou `activeChannel.url` e toca direto.

## Credenciais e fallback

- `service.baseUrl`, `service.username`, `service.password` vêm de
  `settings.streamServices` (Settings → Conta Eh!IPTV).
- Se o usuário não tem credencial configurada, o app **toasta**
  `"Adicione suas credenciais em Configurações → Conta Eh!IPTV"` e aborta.
- Se o PocketBase não devolve `stream_id` / `series_id`, o app **toasta**
  `"Conteúdo indisponível no momento"`.

## Verificações comuns

- Log mostrando `?language=en-US` quando o usuário configurou `pt-BR`? → bug em `lib/tmdb.ts` (defaults fixos). Veja `references/troubleshooting.md`.
- Episódios de série todos marcados "Indisponível"? → bug de coerção `episode_num` string vs number em `lib/ehiptv.ts` (`toEpisodeNumber`).
- URL chega no player mas vídeo não carrega? → provavelmente mixed content. Confirme que a URL está passando por `/api/proxy` (HTTPS site + HTTP xtream).

## Referências

- `references/movie.md` — fórmula detalhada de filme.
- `references/series.md` — fluxo completo `get_series_info` + resolução de `episode_id`.
- `references/live.md` — fórmula detalhada de live + `get_live_streams`.
- `references/troubleshooting.md` — bugs comuns e como diagnosticar.

## Constantes pra ajustar

Em `lib/ehiptv.ts` (topo do arquivo):

| Constante | Padrão | Quando mudar |
|---|---|---|
| `MOVIE_ID_FIELD` | `"stream_id"` | Se o PocketBase usa outro nome pro id do filme. |
| `SERIES_ID_FIELD` | `"series_id"` | Se o PocketBase usa outro nome pro id da série. |
| `VOD_TITLE_FIELD` | `"vod_title"` | Se o label do filme no PocketBase tiver outro nome. |
| `SERIES_TITLE_FIELD` | `"serie_title"` | Se o label da série tiver outro nome. |
| `FILE_EXTENSION` | `"mp4"` | Se o provedor Xtream servir tudo em `mkv`/`ts` por padrão. |
| `REQUEST_TIMEOUT_MS` | `3000` | Se a latência do PocketBase for alta. |
| `SERIES_EPISODE_CACHE_MS` | `5 * 60 * 1000` | Se o provedor Xtream rotacionar episode_ids rápido. |
