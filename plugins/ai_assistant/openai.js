/**
 * ต่อกับผู้ให้บริการที่ใช้ API แบบ OpenAI (Chat Completions + function calling) ผ่าน SDK ทางการของ OpenAI
 * — OpenAI เอง, OpenRouter, Google Gemini, Groq, DeepSeek, Mistral, xAI ใช้โค้ดชุดเดียวกัน ต่างกันแค่ baseURL
 *
 * เบราว์เซอร์ไม่มีคีย์: SDK ยิงไปที่ proxy ของเซิร์ฟเวอร์ Tanva แล้วเซิร์ฟเวอร์เติม Authorization ให้
 */

const SDK_URL = 'https://cdn.jsdelivr.net/npm/openai@7.23.0/+esm';
const MAX_STEPS = 16;

let sdk = null;
const loadSdk = () => (sdk ||= import(SDK_URL));

export const toOpenAITools = (tools) =>
  tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));

export function explainOpenAIError(err, OpenAI, label = 'OpenAI') {
  if (err?.aborted || (OpenAI && err instanceof OpenAI.APIUserAbortError)) return { aborted: true, message: 'หยุดแล้ว' };
  const raw = err?.error;
  if (typeof raw === 'string') return { message: raw }; // ข้อความจาก proxy ของ Tanva เอง
  if (raw && typeof raw.error === 'string') return { message: raw.error };
  const upstream = raw?.message;
  if (OpenAI) {
    if (err instanceof OpenAI.AuthenticationError) return { message: `API key ของ ${label} ใช้ไม่ได้ — ให้แอดมินตรวจคีย์ในหน้าตั้งค่าปลั๊กอิน` };
    if (err instanceof OpenAI.PermissionDeniedError) return { message: `บัญชี ${label} ไม่มีสิทธิ์ใช้งานนี้${upstream ? `: ${upstream}` : ''}` };
    if (err instanceof OpenAI.NotFoundError) return { message: `${label} ไม่พบโมเดลนี้${upstream ? `: ${upstream}` : ''}` };
    if (err instanceof OpenAI.RateLimitError) return { message: `${label} ถูกเรียกถี่เกินโควตา (หรือเครดิตหมด) รอสักครู่แล้วลองใหม่` };
    if (err instanceof OpenAI.APIConnectionError) return { message: 'เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง' };
    if (err instanceof OpenAI.APIError) return { message: upstream || err.message };
  }
  return { message: err?.message || String(err) };
}

/**
 * คุยหนึ่งรอบ — session.messages เก็บประวัติรูปแบบ OpenAI (ไม่รวม system ซึ่งสร้างใหม่ทุกครั้งจากสถานะบอร์ด)
 * ctx: { model, system, tools, baseURL, label, headers, signal, onText(delta), onStep(), runTool(name, input, id) }
 */
export async function runOpenAITurn(session, userText, ctx) {
  const { default: OpenAI } = await loadSdk();
  const client = new OpenAI({
    apiKey: 'set-by-server', // เซิร์ฟเวอร์ทิ้งค่านี้แล้วใส่คีย์จริงให้
    baseURL: ctx.baseURL,
    defaultHeaders: ctx.headers || {},
    dangerouslyAllowBrowser: true, // ปลอดภัยเพราะไม่มีคีย์จริงอยู่ในเบราว์เซอร์
    maxRetries: 1,
  });
  const start = session.messages.length;
  session.messages.push({ role: 'user', content: userText });
  let pending = null;

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      if (step) ctx.onStep?.();
      const completion = await client.chat.completions.create(
        {
          model: ctx.model,
          messages: [{ role: 'system', content: ctx.system }, ...session.messages],
          tools: toOpenAITools(ctx.tools),
        },
        { signal: ctx.signal }
      );
      const choice = completion.choices?.[0];
      const msg = choice?.message;
      if (!msg) throw new Error(`ไม่ได้รับคำตอบจาก ${ctx.label || 'ผู้ให้บริการ'}`);
      if (msg.refusal) {
        ctx.onText(msg.refusal);
        session.messages.push({ role: 'assistant', content: msg.refusal });
        return { refused: true };
      }
      if (msg.content) ctx.onText(msg.content);
      const calls = (msg.tool_calls || []).filter((c) => c.type === 'function');
      session.messages.push({ role: 'assistant', content: msg.content ?? null, ...(calls.length ? { tool_calls: calls } : {}) });
      if (!calls.length) return { stopReason: choice.finish_reason };

      pending = { calls, results: [] };
      for (const call of calls) {
        let input = null;
        try {
          input = JSON.parse(call.function.arguments || '{}');
        } catch {
          /* ตอบกลับว่า arguments เสีย ให้ AI ส่งใหม่ */
        }
        const r =
          input && typeof input === 'object'
            ? await ctx.runTool(call.function.name, input, call.id)
            : { content: 'arguments ไม่ใช่ JSON ที่ถูกต้อง ลองส่งใหม่', isError: true };
        pending.results.push({ role: 'tool', tool_call_id: call.id, content: r.content });
      }
      session.messages.push(...pending.results);
      pending = null;
    }
    throw new Error('AI ทำหลายขั้นตอนเกินไป ลองแบ่งคำสั่งให้เล็กลง');
  } catch (err) {
    if (pending) {
      const done = new Set(pending.results.map((r) => r.tool_call_id));
      const rest = pending.calls
        .filter((c) => !done.has(c.id))
        .map((c) => ({ role: 'tool', tool_call_id: c.id, content: 'ผู้ใช้หยุดก่อนได้ทำ' }));
      session.messages.push(...pending.results, ...rest);
    } else if (session.messages.length === start + 1) {
      session.messages.pop();
    }
    const info = explainOpenAIError(err, OpenAI, ctx.label);
    throw Object.assign(new Error(info.message), { aborted: Boolean(info.aborted) });
  }
}
