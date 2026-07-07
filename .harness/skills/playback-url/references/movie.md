# Filme — `kind = "movie"`

## Fórmula

```
${PROVIDER_BASE}/movie/${user}/${pass}/${stream_id}.${ext}
```

## Variáveis

- **PROVIDER_BASE**: base do Xtream Codes. Ex.: `http://dnstv.top`.
  - Sem barra no final.
  - O app remove com `service.baseUrl.replace(/\/+$/, "")` em `lib/ehiptv.ts:423`.
- **user** e **pass**: credenciais do operador, **URL-encoded**.
  - O app usa `encodeURIComponent(service.username)` e `encodeURIComponent(service.password)` em `lib/ehiptv.ts:428-429`.
- **stream_id**: id Xtream do filme (vem do PocketBase, coleção `imdb_stream_vod`, campo `stream_id`).
  - É um número (string ou number — ambos funcionam).
- **ext**: extensão do arquivo. Padrão `mp4` (`FILE_EXTENSION` em `lib/ehiptv.ts:49`).
  - Pode ser `mkv`, `ts`, `avi` dependendo do upload original.

## Fluxo no app

1. Usuário clica num card de filme.
2. Drawer abre. `fetchStreamOptions(item)` busca no PocketBase todos os rows com aquele `tmdb_id`.
3. Cada row vira um botão "Tocar {vod_title}" (1 botão por row).
4. Click → `playEhIptv(item, undefined, option)` em `lib/store.tsx:355`.
5. `buildPlaybackUrl(service, option, "movie", undefined)` em `lib/ehiptv.ts:417` monta a URL.
6. Se o site está em HTTPS e a URL é HTTP, o app envelopa em `/api/proxy?url=…` para evitar mixed content.
7. Player toca.

## Exemplo real

Filme "Michael" no PocketBase devolve 2 rows:
```json
[
  { "stream_id": 408996, "vod_title": "Michael" },
  { "stream_id": 412221, "vod_title": "Michael [L]" }
]
```

URLs geradas:
```
http://dnstv.top/movie/52514cxb/tmt83747/408996.mp4
http://dnstv.top/movie/52514cxb/tmt83747/412221.mp4
```

## Casos especiais

- **Sem credencial** → toast `"Adicione suas credenciais em Configurações → Conta Eh!IPTV"`.
- **PocketBase sem row** → `fetchStreamOptions` devolve `[]` → botão "Indisponível" no Drawer → sem Play.
- **`stream_id` faltando no row** → `buildPlaybackUrl` joga `Eh!IPTV: sem stream_id para este título`.
