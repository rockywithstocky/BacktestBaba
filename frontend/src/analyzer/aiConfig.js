const PRESETS = [
  {
    id: 'openai',
    name: 'OpenAI',
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    provider: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1/messages',
    model: 'claude-sonnet-4-20250514',
  },
  {
    id: 'google',
    name: 'Google',
    provider: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    model: 'gemini-2.0-flash',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    provider: 'openai',
    baseUrl: 'https://api.deepseek.com/v1/chat/completions',
    model: 'deepseek-chat',
  },
  {
    id: 'groq',
    name: 'Groq',
    provider: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.3-70b-versatile',
  },
  {
    id: 'custom',
    name: 'Custom',
    provider: 'openai',
    baseUrl: '',
    model: '',
  },
];

const STORAGE_KEY = 'ai_model_config';
const API_KEY_STORAGE = 'ai_api_key';

export function getSavedConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { presetId: 'openai', model: 'gpt-4o', baseUrl: 'https://api.openai.com/v1/chat/completions' };
}

export function saveConfig(config) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function getApiKey() {
  let key = sessionStorage.getItem(API_KEY_STORAGE);
  if (key) return key;
  key = localStorage.getItem(API_KEY_STORAGE);
  if (key) {
    sessionStorage.setItem(API_KEY_STORAGE, key);
    localStorage.removeItem(API_KEY_STORAGE);
    return key;
  }
  return '';
}

export function saveApiKey(key) {
  sessionStorage.setItem(API_KEY_STORAGE, key);
}

export function getPresets() {
  return PRESETS;
}

export function resolveConfig(presetId, overrides) {
  const preset = PRESETS.find(p => p.id === presetId) || PRESETS[0];
  return {
    provider: preset.provider,
    baseUrl: overrides?.baseUrl || preset.baseUrl,
    model: overrides?.model || preset.model,
  };
}
