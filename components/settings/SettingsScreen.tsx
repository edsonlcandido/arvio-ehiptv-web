"use client";

import {
  Captions, Eye, EyeOff, KeyRound, Languages, LayoutGrid, ListVideo,
  Network, Play, Plus, RotateCcw, Server, Subtitles, Trash2, Tv
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { defaultCatalogs, mergeCatalogs } from "@/lib/catalogs";
import { useApp } from "@/lib/store";
import type { AppSettings, CatalogConfig, HomeServerConfig, StreamServiceConfig } from "@/lib/types";

const SECTIONS = [
  { id: "vod", label: "Conta Eh!IPTV", icon: KeyRound },
  { id: "playback", label: "Reprodução", icon: Play },
  { id: "language", label: "Idioma e Áudio", icon: Languages },
  { id: "subtitles", label: "Legendas", icon: Subtitles },
  { id: "ai", label: "Legendas IA", icon: Captions },
  { id: "appearance", label: "Aparência", icon: LayoutGrid },
  { id: "network", label: "Rede", icon: Network },
  { id: "tv", label: "TV (IPTV)", icon: Tv },
  { id: "homeserver", label: "Servidor Local", icon: Server },
  { id: "catalogs", label: "Catálogos", icon: ListVideo }
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export function SettingsScreen() {
  const [section, setSection] = useState<SectionId>("vod");
  return (
    <div className="settings-shell">
      <aside className="settings-sidebar">
        <h2>Configurações</h2>
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <button key={s.id} className={`settings-section-btn ${section === s.id ? "is-active" : ""}`} onClick={() => setSection(s.id)}>
              <Icon size={18} /> <span>{s.label}</span>
            </button>
          );
        })}
      </aside>
      <div className="settings-content">
        <SectionBody section={section} />
      </div>
    </div>
  );
}

/* ---------- reusable rows ---------- */

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="set-row">
      <span className="set-label">{label}{hint && <em>{hint}</em>}</span>
      <span className="set-control">{children}</span>
    </label>
  );
}

function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <input type="checkbox" checked={value} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />;
}

function Select<T extends string>({ value, options, onChange, disabled }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as T)}>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

/* ---------- section body ---------- */

function SectionBody({ section }: { section: SectionId }) {
  const app = useApp();
  const { settings } = app;
  const set = (patch: Partial<AppSettings>) => app.updateSettings(patch);

  switch (section) {
    case "playback":
      return (
        <Panel title="Reprodução">
          <Row label="Reproduzir próximo episódio automaticamente"><Toggle value={settings.autoPlayNext} onChange={(v) => set({ autoPlayNext: v })} /></Row>
          <Row label="Reproduzir quando houver uma única fonte"><Toggle value={settings.autoPlaySingleSource} onChange={(v) => set({ autoPlaySingleSource: v })} /></Row>
          <Row label="Tocar automaticamente a partir de">
            <Select value={settings.autoPlayMinQuality} onChange={(v) => set({ autoPlayMinQuality: v })}
              options={[["any", "Qualquer"], ["hd", "HD"], ["fhd", "Full HD"], ["4k", "4K"]]} />
          </Row>
          <Row label="Trailer automático"><Toggle value={settings.trailerAutoPlay} onChange={(v) => set({ trailerAutoPlay: v })} /></Row>
          <Row label="Som do trailer"><Toggle value={settings.trailerSound} onChange={(v) => set({ trailerSound: v })} /></Row>
          <Row label="Atraso do trailer (segundos)"><input type="number" min={0} max={10} value={settings.trailerDelaySeconds} onChange={(e) => set({ trailerDelaySeconds: Number(e.target.value) })} /></Row>
          <Row label="Sincronizar taxa de quadros" hint="Apenas Android"><Toggle value={false} disabled onChange={() => undefined} /></Row>
          <Row label="Reforço de volume" hint="Apenas Android"><Toggle value={false} disabled onChange={() => undefined} /></Row>
        </Panel>
      );
    case "language":
      return (
        <Panel title="Idioma e Áudio">
          <Row label="Idioma do conteúdo" hint="Código TMDB, ex.: pt-BR"><input value={settings.language} onChange={(e) => set({ language: e.target.value })} /></Row>
          <Row label="Idioma principal da legenda"><input value={settings.defaultSubtitle} onChange={(e) => set({ defaultSubtitle: e.target.value })} /></Row>
          <Row label="Idioma secundário da legenda"><input value={settings.secondarySubtitle} onChange={(e) => set({ secondarySubtitle: e.target.value })} /></Row>
          <Row label="Idioma do áudio"><input value={settings.audioLanguage} onChange={(e) => set({ audioLanguage: e.target.value })} /></Row>
        </Panel>
      );
    case "subtitles":
      return (
        <Panel title="Legendas">
          <Row label="Tamanho da legenda (%)"><input type="number" min={60} max={200} value={settings.subtitleSize} onChange={(e) => set({ subtitleSize: Number(e.target.value) })} /></Row>
          <Row label="Cor da legenda"><input type="color" value={settings.subtitleColor} onChange={(e) => set({ subtitleColor: e.target.value })} /></Row>
          <Row label="Deslocamento da legenda (ms)"><input type="number" value={settings.subtitleOffsetMs} onChange={(e) => set({ subtitleOffsetMs: Number(e.target.value) })} /></Row>
          <Row label="Estilo da legenda">
            <Select value={settings.subtitleStyle} onChange={(v) => set({ subtitleStyle: v })}
              options={[["outline", "Contorno"], ["shadow", "Sombra"], ["background", "Fundo"], ["raised", "Em relevo"]]} />
          </Row>
          <Row label="Legendas estilizadas"><Toggle value={settings.subtitleStylized} onChange={(v) => set({ subtitleStylized: v })} /></Row>
          <Row label="Filtrar legendas por idioma"><Toggle value={settings.filterSubtitlesByLanguage} onChange={(v) => set({ filterSubtitlesByLanguage: v })} /></Row>
          <Row label="Remover marcações para deficientes auditivos [SDH]"><Toggle value={settings.removeHearingImpaired} onChange={(v) => set({ removeHearingImpaired: v })} /></Row>
        </Panel>
      );
    case "ai":
      return (
        <Panel title="Legendas com IA">
          <Row label="Aprimorar legendas com IA"><Toggle value={settings.aiSubtitlesEnabled} onChange={(v) => set({ aiSubtitlesEnabled: v })} /></Row>
          <Row label="Modelo de IA">
            <Select value={settings.aiSubtitleModel} onChange={(v) => set({ aiSubtitleModel: v })}
              options={[["off", "Desligado"], ["groq", "Groq"], ["gemini", "Gemini"]]} />
          </Row>
          <Row label="Selecionar a melhor legenda automaticamente"><Toggle value={settings.aiAutoSelect} onChange={(v) => set({ aiAutoSelect: v })} /></Row>
          <Row label="Chave de API da IA"><input type="password" value={settings.aiApiKey} onChange={(e) => set({ aiApiKey: e.target.value })} placeholder="••••••••" /></Row>
        </Panel>
      );
    case "appearance":
      return (
        <Panel title="Aparência">
          <Row label="Layout dos cards">
            <Select value={settings.cardLayoutMode} onChange={(v) => set({ cardLayoutMode: v })} options={[["landscape", "Paisagem"], ["poster", "Poster"]]} />
          </Row>
          <Row label="Modo do dispositivo">
            <Select value={settings.deviceModeOverride} onChange={(v) => set({ deviceModeOverride: v })} options={[["auto", "Automático"], ["tv", "TV"], ["desktop", "Desktop"]]} />
          </Row>
          <Row label="Fundo preto OLED"><Toggle value={settings.oledBlack} onChange={(v) => set({ oledBlack: v })} /></Row>
          <Row label="Formato do relógio">
            <Select value={settings.clockFormat} onChange={(v) => set({ clockFormat: v })} options={[["24h", "24 horas"], ["12h", "12 horas"]]} />
          </Row>
          <Row label="Mostrar orçamento / receita"><Toggle value={settings.showBudget} onChange={(v) => set({ showBudget: v })} /></Row>
          <Row label="Rolagem suave"><Toggle value={settings.smoothScrolling} onChange={(v) => set({ smoothScrolling: v })} /></Row>
          <Row label="Desfoque de spoiler"><Toggle value={settings.spoilerBlur} onChange={(v) => set({ spoilerBlur: v })} /></Row>
          <Row label="Cor de destaque">
            <Select value={settings.accentColor} onChange={(v) => set({ accentColor: v })}
              options={[["arctic", "Ártico"], ["gold", "Dourado"], ["green", "Verde"], ["blue", "Azul"], ["purple", "Roxo"]]} />
          </Row>
        </Panel>
      );
    case "network":
      return (
        <Panel title="Rede">
          <Row label="Provedor de DNS">
            <Select value={settings.dnsProvider} onChange={(v) => set({ dnsProvider: v })}
              options={[["system", "Sistema"], ["cloudflare", "Cloudflare"], ["google", "Google"], ["quad9", "Quad9"]]} />
          </Row>
          <Row label="Mostrar estatísticas de carregamento"><Toggle value={settings.showLoadingStats} onChange={(v) => set({ showLoadingStats: v })} /></Row>
          <Row label="User agent personalizado" hint="Apenas Android"><input value={settings.customUserAgent} disabled placeholder="Controlado pelo navegador" /></Row>
        </Panel>
      );
    case "tv":
      return (
        <Panel title="TV (IPTV)">
          <p className="empty">{settings.iptvPlaylists.length} playlist(s) configurada(s). Adicione e gerencie listas, EPG e favoritos na página de TV.</p>
        </Panel>
      );
    case "vod":
      return <VodSection />;
    case "homeserver":
      return <HomeServerSection />;
    case "catalogs":
      return <CatalogsSection />;
    default:
      return null;
  }
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-panel-card">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

/* ---------- Home Server ---------- */

function HomeServerSection() {
  const { settings, updateSettings } = useApp();
  const [type, setType] = useState<HomeServerConfig["type"]>("jellyfin");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const servers = settings.homeServers ?? [];
  const update = (next: HomeServerConfig[]) => updateSettings({ homeServers: next });

  return (
    <Panel title="Servidor Local">
      <p className="empty">Conecte um servidor Jellyfin, Emby ou Plex usando um token de API ou usuário + senha. Os filmes tocam diretamente no navegador.</p>
      <div className="inline-form">
        <select value={type} onChange={(e) => setType(e.target.value as HomeServerConfig["type"])}>
          <option value="jellyfin">Jellyfin</option>
          <option value="emby">Emby</option>
          <option value="plex">Plex</option>
        </select>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome" />
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://servidor:8096" />
        <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Token de API (opcional)" />
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Usuário (opcional)" />
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Senha" type="password" />
        <button className="primary" onClick={() => {
          if (!url.trim()) return;
          update([{ id: crypto.randomUUID(), type, name: name || type, url: url.trim(), token: token.trim(), username: username.trim() || undefined, password: password || undefined, enabled: true }, ...servers]);
          setName(""); setUrl(""); setToken(""); setUsername(""); setPassword("");
        }}><Plus size={18} /> Adicionar</button>
      </div>
      <div className="settings-list">
        {servers.map((server) => (
          <div className="settings-list-row" key={server.id}>
            <button className="icon-button" onClick={() => update(servers.map((s) => s.id === server.id ? { ...s, enabled: !s.enabled } : s))}>
              {server.enabled ? <Eye size={18} /> : <EyeOff size={18} />}
            </button>
            <strong>{server.name}</strong>
            <span>{server.type}</span>
            <span>{server.url}</span>
            <button className="icon-button danger" onClick={() => update(servers.filter((s) => s.id !== server.id))}><Trash2 size={18} /></button>
          </div>
        ))}
        {servers.length === 0 && <p className="empty">Nenhum servidor local configurado.</p>}
      </div>
    </Panel>
  );
}

/* ---------- Conta Eh!IPTV ---------- */

const EH_IPTV_BASE_URL = "http://dnstv.top/";

function VodSection() {
  const { settings, updateSettings } = useApp();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const services = settings.streamServices ?? [];
  const update = (next: StreamServiceConfig[]) => updateSettings({ streamServices: next });

  const addService = () => {
    if (!username.trim() || !password) return;
    update([
      {
        id: crypto.randomUUID(),
        name: "Eh!IPTV",
        baseUrl: EH_IPTV_BASE_URL,
        username: username.trim(),
        password,
        contentType: "both",
        enabled: true
      },
      ...services
    ]);
    setUsername("");
    setPassword("");
  };

  return (
    <Panel title="Conta Eh!IPTV">
      <p className="empty">
        Credenciais da sua conta <strong>Eh!IPTV</strong>.
      </p>
      <div className="inline-form">
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Usuário" />
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Senha" type="password" />
        <button className="primary" onClick={addService}><Plus size={18} /> Adicionar</button>
      </div>
      <div className="settings-list">
        {services.map((service) => (
          <div className="settings-list-row" key={service.id}>
            <button className="icon-button" onClick={() => update(services.map((s) => s.id === service.id ? { ...s, enabled: !s.enabled } : s))}>
              {service.enabled ? <Eye size={18} /> : <EyeOff size={18} />}
            </button>
            <strong>{service.name}</strong>
            <span>{service.username}</span>
            <button className="icon-button danger" onClick={() => update(services.filter((s) => s.id !== service.id))}><Trash2 size={18} /></button>
          </div>
        ))}
        {services.length === 0 && <p className="empty">Nenhuma conta Eh!IPTV vinculada. Adicione suas credenciais acima.</p>}
      </div>
      <a
        className="primary"
        style={{
          marginTop: 12,
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          textDecoration: "none",
          background: "#25D366",
          color: "#fff",
          border: "none",
        }}
        href="https://wa.me/5511932055173?text=Gostaria%20de%20testar%20o%20serviço%20pelo%20web%20player"
        target="_blank"
        rel="noopener noreferrer"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.512 5.26l-.999 3.648 3.976-.607zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01a1.094 1.094 0 00-.792.372c-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z" />
        </svg>
        Falar no WhatsApp
      </a>
    </Panel>
  );
}

/* ---------- Catalogs ---------- */

function CatalogsSection() {
  const { settings, updateSettings } = useApp();
  const catalogs = mergeCatalogs(settings.catalogs, settings.hiddenCatalogIds);
  const [customCatalogUrl, setCustomCatalogUrl] = useState("");

  const updateCatalogs = (next: CatalogConfig[]) => updateSettings({
    catalogs: next,
    hiddenCatalogIds: next.filter((c) => !c.enabled).map((c) => c.id)
  });
  const moveCatalog = (id: string, offset: number) => {
    const index = catalogs.findIndex((c) => c.id === id);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= catalogs.length) return;
    const next = [...catalogs];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    updateCatalogs(next);
  };

  return (
    <Panel title="Catálogos (carrosséis da Home)">
      <div className="inline-form">
        <input value={customCatalogUrl} onChange={(e) => setCustomCatalogUrl(e.target.value)} placeholder="https://mdblist.com/lists/usuario/lista" />
        <button className="primary" onClick={() => {
          if (!customCatalogUrl.trim()) return;
          updateCatalogs([{ id: `custom_${crypto.randomUUID()}`, name: "MDBList personalizado", sourceType: "mdblist", mediaType: "all", sourceUrl: customCatalogUrl.trim(), enabled: true }, ...catalogs]);
          setCustomCatalogUrl("");
        }}><Plus size={18} /> Adicionar</button>
        <button className="secondary text-button" onClick={() => updateCatalogs(defaultCatalogs)}><RotateCcw size={18} /> Restaurar padrão</button>
      </div>
      <div className="settings-list">
        {catalogs.map((catalog) => (
          <div className="settings-list-row" key={catalog.id}>
            <button className="icon-button" onClick={() => updateCatalogs(catalogs.map((c) => c.id === catalog.id ? { ...c, enabled: !c.enabled } : c))}>
              {catalog.enabled ? <Eye size={18} /> : <EyeOff size={18} />}
            </button>
            <input value={catalog.name} onChange={(e) => updateCatalogs(catalogs.map((c) => c.id === catalog.id ? { ...c, name: e.target.value } : c))} />
            <span>{catalog.sourceType.toUpperCase()}</span>
            <button className="icon-button" onClick={() => moveCatalog(catalog.id, -1)}>↑</button>
            <button className="icon-button" onClick={() => moveCatalog(catalog.id, 1)}>↓</button>
            {!catalog.isPreinstalled && <button className="icon-button danger" onClick={() => updateCatalogs(catalogs.filter((c) => c.id !== catalog.id))}><Trash2 size={18} /></button>}
          </div>
        ))}
      </div>
    </Panel>
  );
}
