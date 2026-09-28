/**
 * ต่อกับ Claude ผ่าน Anthropic SDK ทางการ (@anthropic-ai/sdk)
 *
 * เบราว์เซอร์ไม่เคยเห็น API key: SDK ยิงไปที่ proxy ของเซิร์ฟเวอร์ Tanva (baseURL)
 * แล้วเซิร์ฟเวอร์เติม x-api-key ที่แอดมินตั้งไว้ก่อนส่งต่อไป api.anthropic.com
 */

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.128.0/+esm';
const MAX_STEPS = 16; // กันวนเรียกเครื่องมือไม่รู้จบ
const MAX_TOKENS = 64000; // สตรีมอยู่แล้ว ให้พื้นที่คำตอบยาว ๆ ได้

// รุ่นที่คิดแบบ adaptive ได้ (Haiku 4.5 ยังใช้แบบเดิม จึงไม่ส่ง thinking/effort)
const ADAPTIVE = /^claude-(opus|sonnet|fable)-/;
// รุ่นที่เปิดให้เซิร์ฟเวอร์ลองโมเดลสำรองให้เองเมื่อโดนตัวกรองความปลอดภัยปฏิเสธ
const WITH_FALLBACK = new Set(['claude-opus-5', 'claude-fable-5-1']);

let sdk = null;
const loadSdk = () => (sdk ||= import(SDK_URL));

/** แปลงนิยามเครื่องมือกลางเป็นรูปแบบของ Claude */
export const toClaudeTools = (tools) =>
  tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));

/** พารามิเตอร์ของคำขอหนึ่งรอบ (แยกออกมาให้เทสต์ได้โดยไม่ต้องยิงจริง) */
export function claudeParams({ model, system, messages, tools, effort }) {
  const params = {
    model,
    max_tokens: MAX_TOKENS,
    system,
    messages,
    tools: toClaudeTools(tools),
    cache_control: { type: 'ephemeral' }, // วนเรียกเครื่องมือหลายรอบ = ส่วนต้นซ้ำเดิม อ่านจาก cache ถูกกว่า
  };
  if (ADAPTIVE.test(model)) {
    params.thinking = { type: 'adaptive' };
    if (effort && effort !== 'default') params.output_config = { effort };
  }
  if (WITH_FALLBACK.has(model)) {
    params.betas = ['server-side-fallback-2026-07-01'];
    params.fallbacks = 'default';
  }
  return params;
}

/** ข้อความผิดพลาดที่คนอ่านเข้าใจ — ใช้คลาส error ของ SDK ไม่เดาจากข้อความ */
export function explainClaudeError(err, Anthropic) {
  if (err?.aborted || (Anthropic && err instanceof Anthropic.APIUserAbortError)) return { aborted: true, message: 'หยุดแล้ว' };
  const body = err?.error;
  // ข้อความจาก proxy ของ Tanva เอง (เช่น แอดมินยังไม่ตั้งคีย์ / เรียกถี่เกิน)
  if (body && typeof body.error === 'string') return { message: body.error, code: body.code || null };
  const upstream = body?.error?.message;
  if (Anthropic) {
    if (err instanceof Anthropic.AuthenticationError) return { message: 'API key ของ Claude ใช้ไม่ได้ — ให้แอดมินตรวจคีย์ในหน้าตั้งค่าปลั๊กอิน' };
    if (err instanceof Anthropic.PermissionDeniedError) return { message: `บัญชี Anthropic ไม่มีสิทธิ์ใช้งานนี้${upstream ? `: ${upstream}` : ''}` };
    if (err instanceof Anthropic.NotFoundError) return { message: `ไม่พบโมเดลนี้${upstream ? `: ${upstream}` : ''}` };
    if (err instanceof Anthropic.RateLimitError) return { message: 'Claude ถูกเรียกถี่เกินโควตา รอสักครู่แล้วลองใหม่' };
    if (err instanceof Anthropic.APIConnectionError) return { message: 'เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง' };
    if (err instanceof Anthropic.APIError) return { message: upstream || err.message };
  }
  return { message: err?.message || String(err) };
}

/**
 * คุยหนึ่งรอบ (อาจเรียกเครื่องมือหลายครั้ง) — session.messages เก็บประวัติรูปแบบของ Claude
 * ctx: { model, effort, system, tools, proxyUrl, signal, onText(delta), onStep(), runTool(name, input, id) }
 */
export async function runClaudeTurn(session, userText, ctx) {
  const { default: Anthropic } = await loadSdk();
  const client = new Anthropic({
    apiKey: 'set-by-server', // เซิร์ฟเวอร์ทิ้งค่านี้แล้วใส่คีย์จริงให้
    baseURL: ctx.proxyUrl,
    dangerouslyAllowBrowser: true, // ปลอดภัยเพราะไม่มีคีย์จริงอยู่ในเบราว์เซอร์
    maxRetries: 1,
  });
  const start = session.messages.length;
  session.messages.push({ role: 'user', content: userText });
  let pending = null; // คำสั่งเครื่องมือของรอบที่กำลังทำ — ถ้าหยุดกลางคันต้องปิดให้ครบก่อนคุยต่อ

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      if (step) ctx.onStep?.();
      const params = claudeParams({ ...ctx, messages: session.messages });
      const api = params.betas ? client.beta.messages : client.messages;
      const stream = api.stream(params, { signal: ctx.signal });
      stream.on('text', (delta) => ctx.onText(delta));
      const message = await stream.finalMessage();

      if (message.stop_reason === 'refusal') {
        // ถูกปฏิเสธทั้งสาย (รวมโมเดลสำรองแล้ว) — ทิ้งคำตอบที่ค้างครึ่งทาง ไม่เก็บลงประวัติ
        return { refused: true };
      }
      session.messages.push({ role: 'assistant', content: message.content });
      if (message.stop_reason === 'pause_turn') continue;

      const calls = message.content.filter((b) => b.type === 'tool_use');
      if (!calls.length) return { stopReason: message.stop_reason };
      if (message.stop_reason === 'max_tokens') {
        throw new Error('คำตอบยาวจนถูกตัดระหว่างสั่งงาน ลองสั่งให้ทำทีละน้อยลง');
      }

      // ทำทีละคำสั่ง (อาจต้องรอคนกดอนุญาต) แล้วส่งผลทั้งหมดกลับในข้อความเดียว
      pending = { calls, results: [] };
      for (const call of calls) {
        const r = await ctx.runTool(call.name, call.input, call.id);
        pending.results.push({ type: 'tool_result', tool_use_id: call.id, content: r.content, ...(r.isError ? { is_error: true } : {}) });
      }
      session.messages.push({ role: 'user', content: pending.results });
      pending = null;
    }
    throw new Error('AI ทำหลายขั้นตอนเกินไป ลองแบ่งคำสั่งให้เล็กลง');
  } catch (err) {
    if (pending) {
      // ตัวที่ทำไปแล้วส่งผลจริง ที่เหลือบอกว่าถูกหยุด — ไม่งั้นรอบหน้าจะถูกปฏิเสธเพราะคำสั่งค้าง
      const done = new Set(pending.results.map((r) => r.tool_use_id));
      const rest = pending.calls
        .filter((c) => !done.has(c.id))
        .map((c) => ({ type: 'tool_result', tool_use_id: c.id, content: 'ผู้ใช้หยุดก่อนได้ทำ', is_error: true }));
      session.messages.push({ role: 'user', content: [...pending.results, ...rest] });
    } else if (session.messages.length === start + 1) {
      session.messages.pop(); // ยังไม่มีคำตอบเลย — ไม่ต้องจำข้อความที่ส่งไม่สำเร็จ
    }
    const info = explainClaudeError(err, Anthropic);
    throw Object.assign(new Error(info.message), { aborted: Boolean(info.aborted), code: info.code || null });
  }
}
