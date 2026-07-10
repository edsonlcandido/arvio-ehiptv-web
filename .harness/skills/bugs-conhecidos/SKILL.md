---
name: bugs-conhecidos
description: Registro de bugs já corrigidos no arvio-ehiptv-web que o Mavis NÃO pode refazer. Carregue antes de mexer em TMDB, Xtream, PocketBase, proxy, ou qualquer fluxo de Play. Cada bug tem causa raiz, sintoma, arquivo/linha original e a correção aplicada.
triggers:
  - "language=en-US"
  - "idioma errado"
  - "episódio indisponível"
  - "todos indisponíveis"
  - "mixed content"
  - "stream não toca"
  - "URL não monta"
  - "botão não aparece"
  - "classe CSS não existe"
  - "primary-button"
language: pt-BR
---

# Bugs conhecidos — arvio-ehiptv-web

> Lista de bugs que a gente já pegou e corrigiu. Antes de criar uma
> função nova que mexe com TMDB, Xtream, PocketBase ou o PlayerOverlay,
> conferir se você não tá refazendo algum deles.

---

## 1. TMDB retornando `language=en-US` mesmo com config `pt-BR`

**Sintoma**: Títulos, logos e descrições aparecem em inglês no Drawer, no Hero e nos cards, mesmo com "Idioma do conteúdo = pt-BR" nas Configurações.

**Causa raiz**: `lib/tmdb.ts` tinha 5 funções com `language = "en-US"` no **default** da assinatura (ou hard-coded). `settings.language` do store nunca chegava nelas.

**Arquivos/linhas originais**:
- `lib/tmdb.ts:67` `loadHomeCategories(language = "en-US", ...)`
- `lib/tmdb.ts:94` `loadCatalog(catalog, language = "en-US")`
- `lib/tmdb.ts:245` `searchMedia(query, language = "en-US")`
- `lib/tmdb.ts:255` `getSeasonEpisodes(tvId, season, language = "en-US")`
- `lib/tmdb.ts:306` `getBasicItem(mediaType, id, language = "en-US")`
- `lib/tmdb.ts:323` `getDetails(item)` — `language: "en-US"` **hard-coded** (não era default)
- `lib/tmdb.ts:229` `getLogoUrl(item)` — `include_image_language: "en,null"` hard-coded
- `lib/tmdb.ts:281` `getReviews(item)` — chamada sem language

**Correção**:
1. `getDetails`, `getLogoUrl`, `getReviews`, `getSeasonEpisodes` recebem `language` como parâmetro (mantendo `"en-US"` como default pra não quebrar quem chamar sem).
2. `getLogoUrl` usa `include_image_language: ${language},en,null` e prioriza o idioma configurado no filtro.
3. `DetailsDrawer.tsx:34, 218` passam `settings.language`.
4. `store.tsx:283, 332` passam `settings.language` pro `getDetails`.
5. `MediaCard.tsx`, `HomeScreen.tsx` pegam `settings` via `useApp()` e passam pro `getLogoUrl`.
6. O sub-componente `SeasonEpisodes` dentro de `DetailsDrawer.tsx` precisou ganhar `useApp()` próprio pra acessar `settings`.

**Como detectar**: o usuário reclamar que tá tudo em inglês com config PT. DevTools → Network → `/api/tmdb/...` → checar se a query string tem `?language=en-US` quando config tá `pt-BR`.

**Não esquecer**: se criar uma função nova em `lib/tmdb.ts` que bate na API, **sempre** aceitar `language` por parâmetro e usar como default `"en-US"` (não o idioma do user — o caller passa o idioma).

---

## 2. Todos os episódios de série marcados "Indisponível"

**Sintoma**: Usuário abre uma série (ex: "A Casa do Dragão"), mas o Drawer mostra todos os episódios com label "Indisponível" e botão Play desabilitado. Mesmo episódios que existem na Xtream.

**Causa raiz**: `lib/ehiptv.ts:fetchAvailableEpisodeNumbers` filtrava `if (typeof num === "number" && Number.isFinite(num))` mas a Xtream retorna `episode_num: "1"` (string). O Set ficava vazio e o filtro no Drawer desabilitava tudo.

**Arquivos/linhas originais**:
- `lib/ehiptv.ts:332-352` `fetchAvailableEpisodeNumbers` — filtro `typeof number`
- `lib/ehiptv.ts:359-373` `fetchEpisodeExtension` — match `ep.episode_num === episodeNumber` (string vs number)
- `lib/ehiptv.ts:375-399` `resolveSeriesEpisodeId` — match `ep.episode_num === episode` (sem coerção)
- `lib/ehiptv.ts:303-320` `fetchSeriesInfo` (pre-populate do cache) — chave com tipo inconsistente

**Correção**:
1. Novo helper `toEpisodeNumber(value: unknown): number | null` em `lib/ehiptv.ts:259` que normaliza string/number.
2. `EpisodeRow.episode_num` e `.season` tipados como `number | string`.
3. `fetchAvailableEpisodeNumbers`, `fetchEpisodeExtension`, `resolveSeriesEpisodeId` e `fetchSeriesInfo` todos usam `toEpisodeNumber`.
4. Removido o fallback duplicado em `resolveSeriesEpisodeId` que comparava `season` também — o objeto `episodes` da Xtream já vem chaveado por temporada, então comparar `season` ali só causava match errado.

**Como detectar**: usuário reclama que a série inteira tá indisponível. DevTools → Network → `/api/xtream?url=...` → checar se o `get_series_info` retorna `episode_num` como string.

**Não esquecer**: o `episode_num` da Xtream é **string**, não number. Sempre que for comparar com `episodeNumber` (number), usar `toEpisodeNumber` ou coerção explícita.

---

## 3. URL de série montada com `series_id/season/episode` (não funciona)

**Sintoma**: Player chama a URL `.../series/.../series_id/1/1.mp4` e dá 404 / "stream não encontrado" no Xtream.

**Causa raiz**: O `buildPlaybackUrl` antigo montava `${base}/series/${user}/${pass}/${series_id}/${season}/${episode}.${ext}`. Esse formato é um atalho antigo que **não funciona** em vários provedores Xtream.

**Arquivos/linhas originais**:
- `lib/ehiptv.ts:417-449` `buildPlaybackUrl` (antes da correção)
- `lib/ehiptv.ts:375-399` `resolveSeriesEpisodeId` (que precisa existir pra resolver o episode_id real)

**Correção**:
- `buildPlaybackUrl` para `kind === "tv"` chama `resolveSeriesEpisodeId` e monta `${base}/series/${user}/${pass}/${episodeId}.${extension}` — **só** o `episode_id` (Xtream) e a extensão, sem season/episode na URL.
- `resolveSeriesEpisodeId` consulta o cache `seriesEpisodeCache` (pré-populado por `fetchSeriesInfo` na primeira chamada) ou faz `get_series_info` se cache miss.
- `fetchAvailableEpisodeNumbers` filtra a UI com base no mesmo `get_series_info`.

**Como detectar**: DevTools → Network → chamada de stream pra série → ver se a URL termina em `.../series_id/1/1.mp4` (errado) ou `.../<episodeId>.mp4` (certo).

**Não esquecer**: pra série, a URL usa **episode_id** (Xtream), nunca `(series_id, season, episode)`. A temporada/episódio só servem pra achar o episode_id certo no `get_series_info`.

---

## 4. Mixed content bloqueando stream HTTP em página HTTPS

**Sintoma**: Player abre, mostra 0:00, mas vídeo não carrega. Console: `Mixed Content: The page at 'https://...' was loaded over HTTPS, but requested an insecure resource 'http://dnstv.top/...'`.

**Causa raiz**: Site roda em HTTPS (`https://seu-site.com`) mas a URL montada é HTTP (`http://dnstv.top/movie/.../stream.mp4`). Browser bloqueia.

**Correção**:
- `app/api/proxy/route.ts` — relay server-side: recebe `?url=<HTTP_URL_ENCODED>`, faz `fetch` server-side, stream-a pro `<video>`.
- `lib/store.tsx:playEhIptv` e `playChannel` envelopam a URL em `/api/proxy?url=...` antes de injetar em `activeStream` / `activeChannel`.

**Como detectar**: Console do navegador com a mensagem acima. Verificar que a URL no `<video src=...>` começa com `https://seu-site/api/proxy?url=...` e não com `http://`.

**Não esquecer**: qualquer URL de stream final que o PlayerOverlay consome **deve** passar pelo proxy. Não tentar tocar HTTP direto do `<video>`.

---

## 5. Botão não aparece porque classe CSS inexistente

**Sintoma**: Componente novo renderiza, mas botão não aparece na tela (sem erro no console).

**Causa raiz**: Eu chutei `className="primary-button"` achando que era o padrão. Não existe — a classe real é `.primary` (vide `app/globals.css:267, 283`).

**Arquivos afetados**:
- `components/settings/SettingsScreen.tsx` (botão WhatsApp) — corrigido pra `.primary` + style inline pro verde.

**Como detectar**: inspecionar elemento no navegador → a `<a>` ou `<button>` tem `class="primary-button"` mas o estilo não aplica (sem `background`, sem cor). Conferir `app/globals.css` que tem só `.primary`, `.secondary`, `.icon-button`, `.pill`, `.danger`, `.empty`.

**Não esquecer**: a lista completa de classes válidas está na skill `padroes-de-codigo`. **Sempre** conferir antes de usar uma classe nova.

---

## 6. Variável `settings` não definida em sub-componente

**Sintoma**: TypeScript reclama `Cannot find name 'settings'` (erro TS2304) depois de tentar usar `settings.language` num sub-componente.

**Causa raiz**: O sub-componente não tem `useApp()` próprio. Eu assumi que `settings` "descia" por props, mas o sub-componente (`SeasonEpisodes` em `DetailsDrawer.tsx`) é um componente separado que precisa do próprio `useApp()`.

**Correção**:
```tsx
function SeasonEpisodes({ item, ... }: Props) {
  const { settings } = useApp();  // <-- precisa disso aqui dentro
  // ...
}
```

**Como detectar**: erro TS2304 `Cannot find name 'settings'` no build. Rodar `node ./node_modules/typescript/bin/tsc --noEmit`.

**Não esquecer**: `useApp()` é por componente, não por arquivo. Cada componente que usa store precisa do próprio hook.

---

## 7. `loadHomeCategories` parece estar morto

**Sintoma**: função exportada em `lib/tmdb.ts:67` mas não é chamada em lugar nenhum do projeto.

**Ação recomendada**: não usar — `searchMedia` e `loadCatalog` (em `lib/store.tsx:261, 410`) já cobrem os casos de carregamento por linguagem. Se precisar da home com várias categorias, prefira encadear `loadCatalog` por catalog config.

**Não esquecer**: antes de chamar `loadHomeCategories`, conferir se faz sentido ou se já existe um caminho mais direto via `loadCatalogRow` (exposto pelo `useApp()`).

---

## 8. `app/api/tmdb/[...path]/route.ts` ainda tem branch legado do Supabase

**Sintoma**: arquivo importa nada de Supabase mas tem um `if (supabaseUrl.startsWith("https://") && anonKey.length > 40)` (linha 11) que delega pra `${supabaseUrl}/functions/v1/tmdb-proxy`.

**Contexto do projeto**: Supabase foi **removido do stack**. Esse branch é legado e nunca vai ser exercitado. Manter o código aumenta a superfície de bug e a leitura.

**Ação recomendada**: limpar o arquivo pra ter só o branch `else if (tmdbKey)` direto pro `https://api.themoviedb.org/3/...`. Não fazer isso **automaticamente** sem o usuário pedir — mas sinalizar quando aparecer a primeira vez.

---

## 9. PowerShell bloqueia `npx tsc` por ExecutionPolicy

**Sintoma**: `npx tsc --noEmit` falha com `UnauthorizedAccess` / `PSSecurityException`.

**Causa raiz**: PowerShell 5.1 não roda scripts `.ps1` não assinados por padrão (a `npx.ps1` da Microsoft Store cai nisso).

**Correção (padrão)**: usar `node ./node_modules/typescript/bin/tsc --noEmit` que **não** passa por PowerShell.

**Não esquecer**: pra rodar qualquer ferramenta do projeto no Windows, usar `node ./node_modules/<pkg>/bin/...` direto, ou `npm run <script>` (que o Next.js configurou pra não usar ps1).

---

## 10. .ts de canal ao vivo reescrito com `localhost:3000` em produção

**Sintoma**: Ao reproduzir canal de TV no servidor de produção, o `m3u8` carrega via proxy, mas os segmentos `.ts` (e qualquer outra URL reescrita dentro do manifesto) saem apontando pra `http://localhost:3000/api/proxy?url=...ts`. O browser (no PC do usuário) tenta buscar no **próprio** localhost e o stream não toca.

**Causa raiz**: `app/api/proxy/route.ts` calculava `proxyOrigin = new URL(request.url).origin` (ou tentava adivinhar via headers `Host` / `X-Forwarded-*` / env var `PUBLIC_BASE_URL`) pra montar URLs **absolutas** dos segmentos no manifesto HLS reescrito. Em qualquer deploy atrás de reverse proxy que não repassa `Host` / `X-Forwarded-Host` corretamente, a origem "adivinhada" fica errada (vira `http://localhost:3000` ou `https://localhost:3000` se `X-Forwarded-Proto` chegou). Em dev funciona porque `window.location.origin` e `request.url` coincidem em `localhost:3000`.

**Arquivo original**:
- `app/api/proxy/route.ts:makeProxyUrl(target, proxyOrigin)` — montava `new URL("/api/proxy", proxyOrigin)` com a origem adivinhada.

**Correção** (a abordagem robusta, **não** depende de header/env):
- `makeProxyUrl(target)` agora devolve um **caminho absoluto**: `/api/proxy?url=<ENCODED>`. Sem host, sem origem.
- Quando o browser / hls.js resolve esse caminho contra a URL do manifesto (= a origem da página que o usuário carregou), o resultado é automaticamente correto em qualquer cenário: dev (`http://localhost:3000`), produção direta, atrás de nginx/caddy/Cloudflare Tunnel, etc.
- `rewriteHlsManifest` e `rewriteHlsAttributeLine` perderam o parâmetro `proxyOrigin` (não precisam mais dele).
- `getPublicOrigin(request)` continua existindo (pra detecção de loop de redirect), mas não influencia mais a reescrita de manifesto.

**Limitações conhecidas**: se o app for servido sob `basePath` no Next.js (ex.: `https://site.com/myapp`), o caminho `/api/proxy` não vai incluir `/myapp` — os segmentos seriam pedidos em `https://site.com/api/proxy?...` em vez de `https://site.com/myapp/api/proxy?...`. O projeto atual não usa `basePath`; se um dia usar, voltar pra abordagem com origem absoluta ou expor `basePath` como env var.

**Como detectar**: DevTools → Network → filtrar `.ts` ou `.m3u8` → ver se a URL do segmento aponta pra `localhost:3000` em vez do domínio público (ou se não aponta pra lugar nenhum — `<base>` resolve errado).

**Não esquecer**: NÃO voltar pra `new URL("/api/proxy", adivinharOrigem(...))` na reescrita de manifesto HLS. Caminho absoluto é o caminho. Qualquer tentativa de "adivinhar" a origem pública no servidor é frágil.

---

## Resumo: checklist antes de mexer em código

- [ ] Se tocar `lib/tmdb.ts`: passar `settings.language` em **toda** função nova.
- [ ] Se tocar `lib/ehiptv.ts`: usar `toEpisodeNumber` pra qualquer comparação de `episode_num`/`season`.
- [ ] Se criar URL de série: usar `episode_id.ext`, não `series_id/season/episode`.
- [ ] Se injetar URL no player: envelopar em `/api/proxy?url=...`.
- [ ] Se usar classe CSS: conferir `app/globals.css` antes. Não inventar.
- [ ] Se usar `settings` em sub-componente: declarar `useApp()` dentro.
- [ ] Rodar `node ./node_modules/typescript/bin/tsc --noEmit` antes de commitar.
