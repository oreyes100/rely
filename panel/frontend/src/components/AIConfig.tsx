import { useEffect, useState } from 'react';
import { api } from '../api/client';

// ── Catálogo de proveedores y modelos ─────────────────────────────────────────

const FREE = 'free' as const;
const PAID = 'paid' as const;

interface ModelDef {
  id: string;
  name: string;
  tier: typeof FREE | typeof PAID;
  note: string;
}

interface ProviderDef {
  id: string;
  name: string;
  tagline: string;
  color: string;      // border/ring color class
  textColor: string;  // accent text color class
  bgSel: string;      // selected bg class
  apiKeyUrl: string;
  apiKeyLabel: string;
  placeholder: string;
  models: ModelDef[];
}

const PROVIDERS: ProviderDef[] = [
  {
    id: 'google',
    name: 'Google Gemini',
    tagline: 'Modelos gratuitos disponibles',
    color: 'border-blue-500',
    textColor: 'text-blue-400',
    bgSel: 'bg-blue-500/10',
    apiKeyUrl: 'https://aistudio.google.com/apikey',
    apiKeyLabel: 'Obtén tu API key gratis en aistudio.google.com',
    placeholder: 'AIzaSy...',
    models: [
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', tier: FREE, note: 'Rápido · Recomendado' },
      { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite', tier: FREE, note: 'Ultra rápido · Más ligero' },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', tier: FREE, note: '1 500 req/día gratis' },
      { id: 'gemini-1.5-flash-8b', name: 'Gemini 1.5 Flash 8B', tier: FREE, note: 'Modelo pequeño · Gratis' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', tier: PAID, note: 'Alta calidad' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', tier: PAID, note: 'Última generación · Rápido' },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', tier: PAID, note: 'Máxima calidad' },
    ],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    tagline: 'Acceso a 200+ modelos',
    color: 'border-orange-500',
    textColor: 'text-orange-400',
    bgSel: 'bg-orange-500/10',
    apiKeyUrl: 'https://openrouter.ai/keys',
    apiKeyLabel: 'Obtén tu API key en openrouter.ai/keys',
    placeholder: 'sk-or-v1-...',
    models: [
      // ── Gratuitos ──
      { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash', tier: FREE, note: 'Google · Sin costo' },
      { id: 'deepseek/deepseek-v3:free', name: 'DeepSeek V3', tier: FREE, note: 'Alta calidad · Sin costo' },
      { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1', tier: FREE, note: 'Razonamiento · Sin costo' },
      { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B', tier: FREE, note: 'Meta · Sin costo' },
      { id: 'meta-llama/llama-3.1-8b-instruct:free', name: 'Llama 3.1 8B', tier: FREE, note: 'Meta · Sin costo · Ligero' },
      { id: 'google/gemma-3-27b-it:free', name: 'Gemma 3 27B', tier: FREE, note: 'Google · Sin costo' },
      { id: 'microsoft/phi-4:free', name: 'Microsoft Phi-4', tier: FREE, note: 'Microsoft · Sin costo' },
      { id: 'mistralai/mistral-7b-instruct:free', name: 'Mistral 7B', tier: FREE, note: 'Mistral · Sin costo' },
      { id: 'qwen/qwen-2.5-7b-instruct:free', name: 'Qwen 2.5 7B', tier: FREE, note: 'Alibaba · Sin costo' },
      // ── De pago ──
      { id: 'anthropic/claude-3-5-haiku', name: 'Claude 3.5 Haiku', tier: PAID, note: 'Anthropic · Rápido' },
      { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', tier: PAID, note: 'OpenAI · Económico' },
      { id: 'meta-llama/llama-3.1-70b-instruct', name: 'Llama 3.1 70B', tier: PAID, note: 'Meta · Alta calidad' },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    tagline: 'Modelos Claude de Anthropic',
    color: 'border-violet-500',
    textColor: 'text-violet-400',
    bgSel: 'bg-violet-500/10',
    apiKeyUrl: 'https://console.anthropic.com',
    apiKeyLabel: 'Obtén tu API key en console.anthropic.com',
    placeholder: 'sk-ant-api03-...',
    models: [
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', tier: PAID, note: 'Rápido · Económico' },
      { id: 'claude-sonnet-5', name: 'Claude Sonnet 5', tier: PAID, note: 'Balance calidad/precio' },
      { id: 'claude-opus-4-8', name: 'Claude Opus 4.8', tier: PAID, note: 'Máxima capacidad' },
    ],
  },
];

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface AiSettings {
  provider: string | null;
  model: string | null;
  apiKeySet: boolean;
  apiKeyHint: string | null;
  enabled: boolean;
}

interface TestResult {
  ok: boolean;
  provider?: string;
  model?: string;
  response?: string;
  ms?: number;
  error?: string;
}

// ── Componentes auxiliares ────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: typeof FREE | typeof PAID }) {
  return tier === FREE
    ? <span className="rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide bg-emerald-500/15 text-emerald-400 uppercase">Gratis</span>
    : <span className="rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide bg-amber-500/10 text-amber-500 uppercase">Pago</span>;
}

function ProviderCard({
  prov, selected, onClick,
}: { prov: ProviderDef; selected: boolean; onClick: () => void }) {
  const hasFree = prov.models.some((m) => m.tier === FREE);
  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col gap-1 rounded-xl border-2 p-4 text-left transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
        ${selected
          ? `${prov.color} ${prov.bgSel}`
          : 'border-slate-700 hover:border-slate-600 bg-slate-800/40 hover:bg-slate-800/60'
        }`}
    >
      <div className={`text-sm font-semibold ${selected ? prov.textColor : 'text-slate-200'}`}>
        {prov.name}
      </div>
      <div className="text-xs text-slate-400">{prov.tagline}</div>
      {hasFree && (
        <span className="mt-1 self-start rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-emerald-400 uppercase">
          Modelos gratis
        </span>
      )}
      {selected && (
        <span className={`absolute right-3 top-3 text-xs font-medium ${prov.textColor}`}>✓</span>
      )}
    </button>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function AIConfig() {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string>('google');
  const [selectedModel, setSelectedModel] = useState<string>('gemini-2.0-flash');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    api<AiSettings>('/sysadmin/ai-settings')
      .then((s) => {
        setSettings(s);
        if (s.provider) setSelectedProvider(s.provider);
        if (s.model) setSelectedModel(s.model);
        setEnabled(s.enabled);
      })
      .catch(() => {});
  }, []);

  // Al cambiar de proveedor, auto-seleccionar el primer modelo gratuito (o el primero)
  function handleSelectProvider(id: string) {
    setSelectedProvider(id);
    const prov = PROVIDERS.find((p) => p.id === id)!;
    const firstFree = prov.models.find((m) => m.tier === FREE);
    setSelectedModel((firstFree ?? prov.models[0]).id);
    setTestResult(null);
  }

  async function handleSave() {
    setSaving(true);
    setSaveMsg('');
    setTestResult(null);
    try {
      await api('/sysadmin/ai-settings', {
        method: 'PUT',
        body: JSON.stringify({
          provider: selectedProvider,
          model: selectedModel,
          ...(apiKey ? { apiKey } : {}),
          enabled,
        }),
      });
      // Recargar para reflejar apiKeyHint actualizado
      const s = await api<AiSettings>('/sysadmin/ai-settings');
      setSettings(s);
      setApiKey('');
      setSaveMsg('Configuración guardada');
    } catch (e: any) {
      setSaveMsg(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    // Guardar primero si hay nueva key
    if (apiKey) await handleSave();
    try {
      const r = await api<{ ok: boolean; provider: string; model: string; response: string; ms: number }>(
        '/sysadmin/ai-settings/test',
        { method: 'POST' }
      );
      setTestResult({ ok: true, provider: r.provider, model: r.model, response: r.response, ms: r.ms });
    } catch (e: any) {
      setTestResult({ ok: false, error: e.message });
    } finally {
      setTesting(false);
    }
  }

  const prov = PROVIDERS.find((p) => p.id === selectedProvider)!;
  const freeModels = prov.models.filter((m) => m.tier === FREE);
  const paidModels = prov.models.filter((m) => m.tier === PAID);
  const hasChanges = selectedProvider !== settings?.provider
    || selectedModel !== settings?.model
    || enabled !== settings?.enabled
    || !!apiKey;

  const currentProvDef = settings?.provider ? PROVIDERS.find((p) => p.id === settings.provider) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* ── Encabezado ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Selector IA de nodo</h2>
          <p className="mt-0.5 text-sm text-slate-400">
            Cuando un cliente crea un servidor, la IA elige el nodo óptimo del cluster
            evaluando CPU, RAM, disco y carga. Si la IA no responde, el selector
            rule-based toma el relevo automáticamente.
          </p>
        </div>
        {/* Toggle activar/desactivar */}
        <button
          onClick={() => setEnabled((v) => !v)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
            ${enabled ? 'bg-indigo-600' : 'bg-slate-700'}`}
          role="switch"
          aria-checked={enabled}
          title={enabled ? 'IA activa' : 'IA inactiva (usando rule-based)'}
        >
          <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200
            ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
      </div>

      {/* ── Banner de estado ── */}
      {settings !== null && (
        <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm
          ${settings.enabled && settings.provider
            ? 'border-emerald-800/50 bg-emerald-900/20 text-emerald-300'
            : 'border-slate-700 bg-slate-800/40 text-slate-400'}`}
        >
          <span className="text-base">{settings.enabled && settings.provider ? '✓' : '○'}</span>
          {settings.enabled && settings.provider ? (
            <span>
              Activo ·{' '}
              <span className={`font-medium ${currentProvDef?.textColor ?? 'text-slate-200'}`}>
                {currentProvDef?.name ?? settings.provider}
              </span>
              {' · '}
              <span className="font-mono text-xs text-slate-300">{settings.model}</span>
              {settings.apiKeyHint && (
                <span className="ml-2 font-mono text-xs text-slate-500">key: {settings.apiKeyHint}</span>
              )}
            </span>
          ) : (
            <span>Inactivo — usando selector rule-based (RAM + disco + CPU)</span>
          )}
        </div>
      )}

      {/* ── 1. Proveedor ── */}
      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          1 · Proveedor
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {PROVIDERS.map((p) => (
            <ProviderCard
              key={p.id}
              prov={p}
              selected={selectedProvider === p.id}
              onClick={() => handleSelectProvider(p.id)}
            />
          ))}
        </div>
      </section>

      {/* ── 2. Modelo ── */}
      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          2 · Modelo
        </h3>
        <div className="rounded-xl border border-slate-700 bg-slate-800/40 overflow-hidden">
          {freeModels.length > 0 && (
            <>
              <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-emerald-500/70 bg-emerald-500/5 border-b border-slate-700/50">
                Gratuitos
              </div>
              {freeModels.map((m, i) => (
                <ModelRow
                  key={m.id}
                  model={m}
                  selected={selectedModel === m.id}
                  onClick={() => setSelectedModel(m.id)}
                  last={i === freeModels.length - 1 && paidModels.length === 0}
                  provColor={prov.textColor}
                />
              ))}
            </>
          )}
          {paidModels.length > 0 && (
            <>
              <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-amber-500/60 bg-amber-500/5 border-y border-slate-700/50">
                De pago
              </div>
              {paidModels.map((m, i) => (
                <ModelRow
                  key={m.id}
                  model={m}
                  selected={selectedModel === m.id}
                  onClick={() => setSelectedModel(m.id)}
                  last={i === paidModels.length - 1}
                  provColor={prov.textColor}
                />
              ))}
            </>
          )}
        </div>
      </section>

      {/* ── 3. API Key ── */}
      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          3 · API Key
        </h3>
        <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>{prov.apiKeyLabel}</span>
            <a
              href={prov.apiKeyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-1 font-medium transition-colors hover:underline ${prov.textColor}`}
            >
              Abrir →
            </a>
          </div>

          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={settings?.apiKeySet
                ? `Clave guardada (${settings.apiKeyHint}) — pega aquí para reemplazar`
                : prov.placeholder}
              className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 pr-10 font-mono text-sm text-slate-200 placeholder-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              spellCheck={false}
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs transition-colors"
              tabIndex={-1}
            >
              {showKey ? 'Ocultar' : 'Ver'}
            </button>
          </div>

          {!settings?.apiKeySet && !apiKey && (
            <p className="text-xs text-amber-400/80">
              Necesitas una API key para activar la selección por IA.
            </p>
          )}
        </div>
      </section>

      {/* ── Acciones ── */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleTest}
          disabled={testing || saving || (!settings?.apiKeySet && !apiKey)}
          className="flex items-center gap-2 rounded-lg bg-slate-700 px-4 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-600 disabled:opacity-40"
        >
          {testing
            ? <><Spinner />Probando…</>
            : '⚡ Probar conexión'}
        </button>

        <button
          onClick={handleSave}
          disabled={saving || (!hasChanges && !apiKey)}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-40"
        >
          {saving
            ? <><Spinner />Guardando…</>
            : 'Guardar configuración'}
        </button>

        {/* Toggle inline */}
        <label className="ml-auto flex items-center gap-2 cursor-pointer select-none text-sm text-slate-400">
          <span>{enabled ? 'IA activada' : 'IA desactivada'}</span>
          <button
            onClick={() => setEnabled((v) => !v)}
            className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors
              ${enabled ? 'bg-indigo-600' : 'bg-slate-600'}`}
            role="switch"
            aria-checked={enabled}
          >
            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform
              ${enabled ? 'translate-x-4' : 'translate-x-0'}`} />
          </button>
        </label>
      </div>

      {/* ── Resultado de prueba ── */}
      {testResult && (
        <div className={`rounded-lg border px-4 py-3 text-sm font-mono
          ${testResult.ok
            ? 'border-emerald-800/60 bg-emerald-900/20 text-emerald-300'
            : 'border-red-800/60 bg-red-900/20 text-red-300'}`}
        >
          {testResult.ok ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2 font-sans font-medium">
                <span className="text-emerald-400">✓</span>
                Conexión exitosa · {testResult.ms}ms
              </div>
              <div className="text-xs text-slate-400 break-all">{testResult.response}</div>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <span className="text-red-400 shrink-0">✗</span>
              <span className="text-xs break-all">{testResult.error}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Mensaje de guardado ── */}
      {saveMsg && (
        <p className={`text-sm ${saveMsg.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>
          {saveMsg}
        </p>
      )}

      {/* ── Nota sobre fallback ── */}
      <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3 text-xs text-slate-500 space-y-1">
        <p><span className="text-slate-400 font-medium">Fallback automático</span> — si la IA no responde en 6 s o falla, el sistema usa el selector rule-based (score = 60% disco libre + 30% RAM libre + 10% CPU baja).</p>
        <p><span className="text-slate-400 font-medium">Sin API key</span> — el selector rule-based siempre está activo y ya filtra correctamente por RAM y disco.</p>
      </div>
    </div>
  );
}

// ── ModelRow ──────────────────────────────────────────────────────────────────

function ModelRow({
  model, selected, onClick, last, provColor,
}: {
  model: ModelDef;
  selected: boolean;
  onClick: () => void;
  last: boolean;
  provColor: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 text-left text-sm transition-colors
        ${selected ? 'bg-slate-700/60' : 'hover:bg-slate-700/30'}
        ${!last ? 'border-b border-slate-700/40' : ''}`}
    >
      <span className={`h-4 w-4 shrink-0 rounded-full border-2 transition-colors flex items-center justify-center
        ${selected ? `${provColor.replace('text-', 'border-')} bg-current` : 'border-slate-600'}`}
      >
        {selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
      </span>
      <span className="flex-1 min-w-0">
        <span className={`font-medium ${selected ? 'text-slate-100' : 'text-slate-300'}`}>
          {model.name}
        </span>
        {model.note && (
          <span className="ml-2 text-xs text-slate-500">{model.note}</span>
        )}
      </span>
      <TierBadge tier={model.tier} />
    </button>
  );
}

function Spinner() {
  return (
    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
