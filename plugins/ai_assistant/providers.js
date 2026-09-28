/**
 * ผู้ให้บริการ AI ที่รองรับ — เพิ่มเจ้าใหม่ได้ที่ตารางนี้ (+ ค่าลับ/proxy ใน manifest.json)
 *
 * kind: 'anthropic' = ใช้ Anthropic SDK · 'openai' = ใช้ OpenAI SDK กับ API แบบ OpenAI (Chat Completions)
 * basePath: ต่อท้าย proxy ของผู้ให้บริการนั้น ให้ SDK เรียก <basePath>/chat/completions ได้ตรงกับ paths ใน manifest
 */
export const PROVIDERS = {
  claude: { label: 'Claude', kind: 'anthropic', secret: 'anthropic_api_key', proxy: 'anthropic' },
  openai: { label: 'OpenAI', kind: 'openai', secret: 'openai_api_key', proxy: 'openai', basePath: '/v1', model: 'gpt-5-mini' },
  openrouter: {
    label: 'OpenRouter',
    kind: 'openai',
    secret: 'openrouter_api_key',
    proxy: 'openrouter',
    basePath: '/api/v1',
    model: 'openrouter/auto',
    headers: { 'X-Title': 'Tanva Kanban' }, // ชื่อแอปในหน้ารายงานการใช้งานของ OpenRouter
  },
  gemini: {
    label: 'Google Gemini',
    kind: 'openai',
    secret: 'gemini_api_key',
    proxy: 'gemini',
    basePath: '/v1beta/openai',
    model: 'gemini-2.5-flash',
  },
  groq: { label: 'Groq', kind: 'openai', secret: 'groq_api_key', proxy: 'groq', basePath: '/openai/v1', model: 'llama-3.3-70b-versatile' },
  deepseek: { label: 'DeepSeek', kind: 'openai', secret: 'deepseek_api_key', proxy: 'deepseek', basePath: '/v1', model: 'deepseek-chat' },
  mistral: { label: 'Mistral', kind: 'openai', secret: 'mistral_api_key', proxy: 'mistral', basePath: '/v1', model: 'mistral-large-latest' },
  xai: { label: 'xAI (Grok)', kind: 'openai', secret: 'xai_api_key', proxy: 'xai', basePath: '/v1', model: 'grok-4' },
};

export const CLAUDE_LABELS = {
  'claude-opus-5': 'Claude Opus 5',
  'claude-sonnet-5': 'Claude Sonnet 5',
  'claude-haiku-4-5': 'Claude Haiku 4.5',
};

/**
 * ผู้ให้บริการ/โมเดลที่บอร์ดเลือก และพร้อมใช้หรือยัง
 * settings = ค่าตั้งของปลั๊กอินในบอร์ด · secretsSet = { key: true/false } จาก host.secretsSet()
 */
export function resolveProvider(settings = {}, secretsSet = {}) {
  const id = PROVIDERS[settings.provider] ? settings.provider : 'claude';
  const p = PROVIDERS[id];
  const model =
    p.kind === 'anthropic'
      ? settings.claudeModel || 'claude-opus-5'
      : String(settings.model || settings.openaiModel || '').trim() || p.model;
  return {
    id,
    ...p,
    model,
    title: p.kind === 'anthropic' ? CLAUDE_LABELS[model] || model : `${p.label} · ${model}`,
    ready: Boolean(secretsSet[p.secret]),
  };
}
