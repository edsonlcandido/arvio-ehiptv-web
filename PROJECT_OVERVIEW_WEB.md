# PROJECT_OVERVIEW.md

## Escopo deste documento
Este guia é **focado exclusivamente na versão web** do ARVIO, localizada em `/web`.
Objetivo: facilitar onboarding técnico e explicar fluxos principais, funções e camadas da aplicação web.

---

## 1) Visão geral da versão web
A pasta `/web` contém o **ARVIO Web**, uma aplicação Next.js (App Router) que espelha a superfície principal do produto ARVIO no navegador (iPad, desktop e TV browser), sem depender de código Android.

A versão web reaproveita conceitos de domínio do app Android:
- autenticação/conta/perfis;
- catálogos e descoberta de mídia;
- integração com TMDB/Trakt;
- IPTV (playlist, grupos, favoritos, playback HLS);
- addons e resolução de streams;
- watchlist/estado de reprodução.

Referências:
- `web/README.md`
- `web/package.json`

---

## 2) Stack tecnológica (web)

### Runtime / Framework
- **Next.js 15** (App Router) — `web/package.json`
- **React 19** — `web/package.json`
- **TypeScript** — `web/tsconfig.json`

### UI / Player
- UI React componentizada em `web/components/*`
- Ícones: `lucide-react`
- Playback HLS/browser: `hls.js`

### Camada de dados e integração
- Módulos de domínio/integração em `web/lib/*`
- Rotas API server-side em `web/app/api/*` para proxy e normalização de chamadas externas

### Build e execução
Scripts oficiais (`web/package.json`):
```bash
npm run dev
npm run build
npm run start
npm run lint
```

---

## 3) Arquitetura de pastas da web (árvore comentada)

```text
web/
├── app/
│   ├── api/
│   │   ├── proxy/        # Proxy genérico para chamadas externas
│   │   ├── subtitle/     # Endpoints auxiliares para legenda
│   │   ├── tmdb/         # Proxy/rotas para TMDB
│   │   └── trakt/        # Proxy/rotas para Trakt
│   ├── globals.css       # Estilos globais da aplicação
│   ├── layout.tsx        # Layout raiz (App Router)
│   └── page.tsx          # Entry page raiz
│
├── components/
│   ├── addons/           # UI e fluxo de addons
│   ├── details/          # Detalhes de mídia e ações contextuais
│   ├── home/             # Home/rails/hero
│   ├── livetv/           # UI de Live TV/IPTV
│   ├── login/            # Telas e controles de autenticação
│   ├── media/            # Cartões/listas/elementos de mídia
│   ├── player/           # Player shell/overlay/controles
│   ├── profile/          # Seleção/gestão de perfil
│   ├── search/           # Busca
│   ├── settings/         # Configurações
│   ├── shell/            # Estrutura de navegação (container principal)
│   └── watchlist/        # Lista de acompanhamento
│
├── lib/
│   ├── auth.ts           # Login/sessão/contexto de autenticação
│   ├── profiles.ts       # Perfil ativo, leitura/sincronização de perfis
│   ├── store.tsx         # Estado global e orquestração dos fluxos
│   ├── storage.ts        # Persistência local (browser storage)
│   ├── config.ts         # Configuração e leitura de ambiente
│   ├── http.ts           # Cliente HTTP utilitário
│   ├── tmdb.ts           # Operações e mapeamentos TMDB
│   ├── trakt.ts          # Operações Trakt
│   ├── catalogs.ts       # Catálogos/fontes/listagens
│   ├── addons.ts         # Catálogo de addons e resolução
│   ├── homeserver.ts     # Integrações com servidores domésticos
│   ├── iptv.ts           # Playlist/canais/grupos/favoritos/EPG
│   ├── player.ts         # Helpers de player/playback
│   ├── cloud.ts          # Sincronização/estado de nuvem
│   ├── mappers.ts        # Adaptação/normalização de payloads
│   ├── types.ts          # Tipos centrais de domínio
│   └── device.ts         # Detecção/capacidades de dispositivo
│
├── public/               # Assets estáticos
├── .env.example          # Contrato de variáveis de ambiente
├── next.config.mjs       # Configuração Next.js
├── package.json          # Scripts e dependências
├── tsconfig.json         # Configuração TS
└── README.md             # Documento específico da versão web
```

---

## 4) Camadas e responsabilidades (como a web funciona)

## 4.1 Camada de apresentação (UI)
- Local: `web/components/*`
- Função: renderizar telas, capturar interação do usuário (navegação, clique, busca, seleção de stream, troca de perfil etc.).
- Não deveria concentrar regra complexa de integração externa.

## 4.2 Camada de orquestração/estado
- Local principal: `web/lib/store.tsx`
- Função: centralizar estado da aplicação e coordenar chamadas de domínio (auth, catálogo, player, IPTV, watchlist).
- Ponto-chave para entender “o que dispara o quê” nos fluxos principais.

## 4.3 Camada de domínio/integração
- Local: `web/lib/*.ts`
- Função: implementar regras por domínio:
  - autenticação (`auth.ts`),
  - perfis (`profiles.ts`),
  - catálogo/metadados (`catalogs.ts`, `tmdb.ts`, `mappers.ts`),
  - addons (`addons.ts`),
  - IPTV (`iptv.ts`),
  - player helpers (`player.ts`),
  - cloud sync (`cloud.ts`),
  - integrações home server (`homeserver.ts`).

## 4.4 Camada server-side de API
- Local: `web/app/api/*`
- Função: encapsular/proxiar chamadas externas (TMDB/Trakt/subtitle/proxy) no backend do Next.
- Benefícios: reduzir exposição de segredos e padronizar payload/erros.

---

## 5) Fluxos principais (visão prática)

## Fluxo A — Inicialização da aplicação
1. Next carrega `app/layout.tsx` + `app/page.tsx`.
2. Estado global é inicializado (store).
3. Configurações de ambiente (`lib/config.ts`) e estado persistido (`lib/storage.ts`) são lidos.
4. Se houver sessão/perfil salvo, app tenta restaurar contexto.

## Fluxo B — Autenticação e perfil
1. UI de login em `components/login/*` coleta credenciais/ação.
2. `lib/auth.ts` executa autenticação/sessão.
3. `lib/profiles.ts` resolve perfis disponíveis e define perfil ativo.
4. Estado global (`store.tsx`) propaga perfil para home, catálogo, watchlist e player.

## Fluxo C — Home e catálogo de mídia
1. `components/home/*` solicita trilhos/listagens.
2. `lib/catalogs.ts` coordena fontes de catálogo.
3. Metadados e enriquecimento passam por `lib/tmdb.ts` + `lib/mappers.ts`.
4. UI renderiza rails/cards via `components/media/*`.

## Fluxo D — Detalhes e reprodução
1. Usuário abre detalhes em `components/details/*`.
2. App consolida fontes possíveis (catálogo, addon, IPTV, home server).
3. Seleção de stream vai para `components/player/*`.
4. Playback utiliza browser/HLS com suporte de `lib/player.ts` e `hls.js`.

## Fluxo E — IPTV (Live TV)
1. `components/livetv/*` aciona leitura de playlists/config.
2. `lib/iptv.ts` parseia e organiza canais/grupos/favoritos/EPG.
3. Canal selecionado é enviado ao fluxo de player para reprodução.

## Fluxo F — Addons
1. Configuração/listagem em `components/addons/*`.
2. `lib/addons.ts` trata manifest/contratos e resolução de streams.
3. Resultado integra com detalhes/player.

## Fluxo G — Trakt/Watchlist/Sync
1. Eventos de watchlist/progresso são disparados da UI.
2. `lib/trakt.ts` e `lib/cloud.ts` tratam sync quando habilitado.
3. Estado local atualizado no `store.tsx` para refletir rapidamente na UI.

---

## 6) Principais funções e módulos (por camada)

> A lista abaixo identifica os módulos-chave para estudo. O arquivo `store.tsx` é o principal ponto de entrada de comportamento de aplicação.

### Núcleo
- `web/lib/store.tsx` — estado global, ações, coordenação de fluxos (auth, catálogo, player, IPTV, watchlist).
- `web/lib/types.ts` — contratos de dados compartilhados.
- `web/lib/mappers.ts` — adaptadores entre payloads externos e modelo interno.

### Auth e perfil
- `web/lib/auth.ts`
- `web/lib/profiles.ts`

### Conteúdo e descoberta
- `web/lib/catalogs.ts`
- `web/lib/tmdb.ts`
- `web/lib/trakt.ts`

### Reprodução e TV ao vivo
- `web/lib/player.ts`
- `web/lib/iptv.ts`
- `web/components/player/*`
- `web/components/livetv/*`

### Extensibilidade e fontes externas
- `web/lib/addons.ts`
- `web/lib/homeserver.ts`

### Infra de app
- `web/lib/config.ts`
- `web/lib/http.ts`
- `web/lib/storage.ts`
- `web/lib/device.ts`

### Rotas API Next
- `web/app/api/tmdb/*`
- `web/app/api/trakt/*`
- `web/app/api/subtitle/*`
- `web/app/api/proxy/*`

---

## 7) Como rodar em desenvolvimento (web)

No diretório `web/`:
```bash
cp .env.example .env.local
npm install
npm run dev
```

Acesse em `http://localhost:3000`.

Variáveis mínimas (`web/.env.example` + `web/README.md`):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_TRAKT_CLIENT_ID`
- `TMDB_API_KEY`
- `TRAKT_CLIENT_SECRET`

Notas:
- Com Supabase configurado, as rotas `/api/tmdb/*` e `/api/trakt/*` seguem padrão proxy/edge.
- Sem Supabase, há fallback local para TMDB/Trakt conforme `web/README.md`.

---

## 8) Build e execução em produção (web)

```bash
npm run build
npm run start
```

Checklist rápido:
1. Variáveis de ambiente válidas no ambiente de deploy;
2. Testar login e seleção de perfil;
3. Testar home, detalhes e início de playback;
4. Testar fluxos de IPTV e addons (quando habilitados);
5. Validar endpoints `/api/*` em runtime de produção.

---

## 9) Fluxo operacional recomendado (web)

1. **Dev local** (`npm run dev`) com `.env.local` configurado.
2. **Validação funcional** dos fluxos críticos:
   - login/perfil,
   - home/catalog,
   - detalhes/play,
   - IPTV,
   - watchlist.
3. **Build** (`npm run build`).
4. **Smoke de produção local** (`npm run start`).
5. **Deploy** no ambiente alvo com env vars seguras.

---

## 10) Decisões e limitações atuais (web)

### Decisões
- Separação clara entre UI (`components`) e domínio (`lib`).
- App Router (`app/`) com rotas API internas para proxy de integrações externas.
- Estado global centralizado para manter consistência entre telas.

### Limitações práticas
- Alguns tipos de stream de addons (torrent/info-hash/formato Android-only) não reproduzem nativamente no browser sem resolver/transcode.
- Dependência de configuração correta de Supabase/TMDB/Trakt para experiência completa.
- Forte concentração de comportamento em `store.tsx` pode aumentar acoplamento se crescer sem modularização.

---

## Pontos em aberto (para documentação futura)

1. Mapear funções exatas exportadas de cada arquivo em `web/lib/*` com assinatura e chamada cruzada.
2. Diagramar fluxo de dados completo (UI -> store -> lib -> api -> retorno).
3. Documentar contratos JSON de cada rota em `web/app/api/*` (input/output/erros).
4. Registrar estratégia de observabilidade web (logs, tracing, monitoramento de falhas).
5. Definir guideline de evolução do `store.tsx` (fatias/módulos para reduzir acoplamento).
