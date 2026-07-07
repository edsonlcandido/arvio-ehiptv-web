# Troubleshooting — playback URL

Bugs comuns ao gerar / tocar URLs do player Eh!IPTV/Xtream.

## Log mostra `?language=en-US` mas config tá `pt-BR`

**Sintoma**: TMDB retorna títulos/logos em inglês mesmo com `Idioma do conteúdo = pt-BR` nas Configurações.

**Causa**: `lib/tmdb.ts` tem funções com `language = "en-US"` hard-coded (não default). Settings não é lido.

**Solução**: passar `settings.language` em **toda** chamada de função TMDB:
- `getDetails(item, settings.language)`
- `getSeasonEpisodes(tvId, season, settings.language)`
- `getLogoUrl({...}, settings.language)`
- `getReviews(item, settings.language)`

`searchMedia` e `loadCatalog` já recebem language corretamente. `loadHomeCategories` parece estar morto (não é chamado).

## Episódios de série todos marcados "Indisponível"

**Sintoma**: usuário clica na série, mas o Drawer mostra todos os episódios com label "Indisponível" e botão Play desabilitado.

**Causa**: `fetchAvailableEpisodeNumbers` filtrava `if (typeof num === "number")` mas a Xtream retorna `episode_num: "1"` (string). Set ficava vazio.

**Solução**: usar helper `toEpisodeNumber(value)` (em `lib/ehiptv.ts:259`) que normaliza string/number. Aplicar em:
- `fetchAvailableEpisodeNumbers`
- `fetchEpisodeExtension`
- `resolveSeriesEpisodeId`
- `fetchSeriesInfo` (cache pre-populate)

## URL chega no player mas vídeo não carrega (mixed content)

**Sintoma**: console do navegador mostra "Mixed Content: blocked".

**Causa**: site está em HTTPS (`https://seu-site.com`) mas a URL Xtream é HTTP (`http://dnstv.top/...`). Browser bloqueia por segurança.

**Solução**: a URL deve passar por `/api/proxy?url=<ENCODED_URL>`. O `app/api/proxy/route.ts` faz fetch server-side e stream-a pro `<video>`.

Verificar que o store envelopa antes de passar pro player (já está implementado para `playEhIptv` e `playChannel`).

## `buildPlaybackUrl` joga "sem stream_id para este título"

**Sintoma**: toast `"Não foi possível preparar a reprodução"` com mensagem do buildPlaybackUrl.

**Causa**: row do PocketBase sem o campo `stream_id` (filme) ou `series_id` (série).

**Solução**: abrir o admin do PocketBase (`https://iptv.ehtudo.app/_/`) e corrigir o row. Se o campo tiver outro nome, ajustar as constantes no topo de `lib/ehiptv.ts`:
- `MOVIE_ID_FIELD` (padrão `"stream_id"`)
- `SERIES_ID_FIELD` (padrão `"series_id"`)

## `resolveSeriesEpisodeId` joga "episódio S{s}E{e} não encontrado"

**Sintoma**: toast ao clicar Play num episódio de série.

**Causa**: a Xtream não tem aquele `episode_num` no `get_series_info`. Pode ser:
- Provedor Xtream não tem o episódio (filtro falhou e deixou clicável).
- `episode_num` no TMDB e na Xtream não batem (provider adicionou/removeu episódios).

**Solução**: confirmar com `curl` no `get_series_info`:
```bash
curl "http://dnstv.top/player_api.php?username=52514cxb&password=tmt83747&action=get_series_info&series_id=2752"
```

Se a Xtream realmente não tem o episódio, o filtro deveria ter desabilitado — investigar `fetchAvailableEpisodeNumbers`.

## Vários botões "Tocar" pra um mesmo filme

**Sintoma**: filme "Michael" mostra dois botões: "Tocar Michael" e "Tocar Michael [L]".

**Causa**: o PocketBase tem dois rows pro mesmo TMDB (edição legendada `[L]` e sem legenda). É **funcionalidade**, não bug — cada botão toca a versão certa.

**Pra desabilitar**: filtrar os rows no PocketBase ou esconder no app (config a fazer).

## Pra debugar via DevTools

- Network tab → filtrar por `tmdb` ou `xtream` ou `proxy`.
- Checar URL final montada antes de ir pro player (no payload do `activeStream` / `activeChannel`).
- Console do Next: ver erros de timeout / 5xx do PocketBase ou da Xtream.
