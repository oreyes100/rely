import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { config } from '../config.js';

const settingsFile = path.join(config.dataDir, 'ai-settings.json');

export function readAiSettings() {
  if (!existsSync(settingsFile)) return { provider: null, model: null, apiKey: '', enabled: false };
  try { return JSON.parse(readFileSync(settingsFile, 'utf8')); }
  catch { return { provider: null, model: null, apiKey: '', enabled: false }; }
}

export function saveAiSettings(settings) {
  writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
}

// Extrae texto de la respuesta según el proveedor
async function parseResponse(provider, res) {
  const data = await res.json();
  if (provider === 'anthropic') return data.content?.[0]?.text ?? '';
  if (provider === 'google') return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (provider === 'openrouter') return data.choices?.[0]?.message?.content ?? '';
  return '';
}

export async function callAI(provider, model, apiKey, prompt) {
  let response;

  if (provider === 'anthropic') {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model, max_tokens: 256, messages: [{ role: 'user', content: prompt }] }),
    });

  } else if (provider === 'google') {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 256, temperature: 0.1 },
        }),
      }
    );

  } else if (provider === 'openrouter') {
    response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://capuvps.duckdns.org',
        'X-Title': 'VPS Panel',
      },
      body: JSON.stringify({ model, max_tokens: 256, messages: [{ role: 'user', content: prompt }] }),
    });

  } else {
    throw new Error(`Proveedor desconocido: ${provider}`);
  }

  if (!response.ok) {
    let detail = response.statusText;
    try { const err = await response.json(); detail = err.error?.message ?? err.message ?? detail; } catch { /* */ }
    throw new Error(`${provider} HTTP ${response.status}: ${detail}`);
  }

  const text = (await parseResponse(provider, response)).trim();
  if (!text) throw new Error(`${provider} devolvió respuesta vacía`);
  return text;
}

// Llama a la IA configurada en data/ai-settings.json
export async function callConfiguredAI(prompt) {
  const s = readAiSettings();
  if (!s.enabled || !s.provider || !s.model || !s.apiKey) {
    throw new Error('IA no configurada o deshabilitada');
  }
  return callAI(s.provider, s.model, s.apiKey, prompt);
}
