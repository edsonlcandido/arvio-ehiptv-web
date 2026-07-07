# Episódio de série — `kind = "tv"`

## Fórmula

```
${PROVIDER_BASE}/series/${user}/${pass}/${episode_id}.${ext}
```

> **NÃO** use `…/series/.../<series_id>/<season>/<episode>.<ext>`. Esse formato
> é um atalho antigo que não funciona em vários provedores Xtream. **Sempre**
> resolva o `episode_id` real via `get_series_info`.

## Variáveis

- **PROVIDER_BASE**: idem filme.
- **user** e **pass**: idem filme.
- **episode_id**: id do EPISÓDIO (string tipo `"122867"`), NÃO o `episode_num`.
  - Retornado por `get_series_info` em `episodes[season][i].id`.
- **ext**: `container_extension` da Xtream (quase sempre `mp4`).

## Fluxo no app

1. Usuário clica num card de série.
2. Drawer abre. `fetchStreamOptions(item)` busca no PocketBase rows com aquele `tmdb_id` (coleção `imdb_stream_series`, campo `series_id`).
3. Cada row vira um botão "Tocar {serie_title}".
4. Usuário escolhe temporada + episódio no Drawer.
5. **Antes de tocar**, o app chama `fetchSeriesInfo(service, series_id)` que faz `get_series_info` via `/api/xtream` e popula a cache `seriesInfoCache` + `seriesEpisodeCache`.
6. `fetchAvailableEpisodeNumbers` cruza com a lista de episódios do TMDB e desabilita os que a Xtream não tem (filtro no Drawer).
7. Click em episódio disponível → `playSeriesEpisode(season, episode)` → `playEhIptv(item, { season, episode }, option)`.
8. `buildPlaybackUrl` chama `resolveSeriesEpisodeId` (cache hit graças ao passo 5) e devolve `{ episodeId, extension }`.
9. URL final: `${base}/series/${user}/${pass}/${episodeId}.${ext}`.
10. Se site HTTPS e URL HTTP, envelopa em `/api/proxy?url=…`.

## Endpoint Xtream

```
GET /player_api.php
  ?username=${user}
  &password=${pass}
  &action=get_series_info
  &series_id=${series_id}
```

Retorno (resumido):
```json
{
  "seasons": [...],
  "info": { "name": "A Casa do Dragão [L]", "plot": "...", "cover": "..." },
  "episodes": {
    "1": [
      { "id": "122867", "episode_num": "1", "container_extension": "mp4", "title": "S01E01", "season": 1, "info": { "duration_secs": 3936, ... } },
      { "id": "123741", "episode_num": "2", "container_extension": "mp4", "title": "S01E02", "season": 1, ... },
      ...
    ],
    "2": [ ... ],
    "3": [ ... ]
  }
}
```

**Pegadinhas**:
- `episode_num` vem como **string** (`"1"`, `"2"`), não number. Comparação `===` com number falha — usar `toEpisodeNumber` (helper em `lib/ehiptv.ts:259`).
- `season` também pode vir como string ou number — `toEpisodeNumber` normaliza.
- `container_extension` pode estar ausente em alguns provedores — fallback `mp4` (`FILE_EXTENSION`).

## Cache

- `seriesInfoCache` (5 min): payload completo do `get_series_info`.
- `seriesEpisodeCache` (5 min): `episodeId` + `extension` por `(service, seriesId, season, episode)`.
- `clearSeriesEpisodeCache()` em `lib/ehiptv.ts:404` — chamar em logout / troca de credencial.

## Exemplo real

`A Casa do Dragão` (TMDB 94997, `series_id=2752` na Xtream), S01E01:

```
http://dnstv.top/series/52514cxb/tmt83747/122867.mp4
```

S03E01 (episode_id `406214`):
```
http://dnstv.top/series/52514cxb/tmt83747/406214.mp4
```

## Casos especiais

- **Sem credencial** → toast `"Adicione suas credenciais em Configurações → Conta Eh!IPTV"`.
- **Sem temporada/episódio escolhido** → toast `"Selecione um episódio para reproduzir"`.
- **`get_series_info` falha** → `fetchAvailableEpisodeNumbers` devolve `null` (fail-open: todos os episódios TMDB ficam clicáveis) e o erro aparece na hora do Play.
- **`episode_num` não bate com nada na Xtream** → `resolveSeriesEpisodeId` joga `Eh!IPTV: episódio S{s}E{e} não encontrado para series_id=…`.
