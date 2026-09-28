/**
 * ผู้ช่วย AI สำหรับ Tanva Kanban — สั่งงานบอร์ดด้วยภาษาคน
 * ใช้ได้หลายเจ้า: Claude, OpenAI, OpenRouter, Google Gemini, Groq, DeepSeek, Mistral, xAI (ดู providers.js)
 *
 * - แผงด้านขวาของจอ "ผู้ช่วย AI": เปิดค้างไว้ข้างบอร์ด/แผนที่ได้ อ่าน/สร้าง/แก้/ย้ายการ์ดผ่านเครื่องมือใน tools.js
 * - การแก้บอร์ดทุกครั้งใช้สิทธิ์ของคนที่สั่ง และ (ค่าเริ่มต้น) ต้องกดอนุญาตก่อน
 * - API key อยู่ที่เซิร์ฟเวอร์ (แอดมินตั้งในหน้าตั้งค่าปลั๊กอิน) — เบราว์เซอร์คุยผ่าน proxy เท่านั้น
 */
import { TOOL_BY_NAME, systemPrompt, toolsFor, makeExecutor, describeCall, extensionTools } from './tools.js';
import { runClaudeTurn } from './claude.js';
import { runOpenAITurn } from './openai.js';
import { resolveProvider } from './providers.js';

const SPARKLE =
  'M7.198.57c.275-.752 1.34-.752 1.615 0l.849 2.317a5.819 5.819 0 0 0 3.462 3.463l2.317.848c.753.275.753 1.34 0 1.615l-2.317.849a5.815 5.815 0 0 0-3.462 3.462l-.849 2.317c-.275.753-1.34.753-1.615 0l-.848-2.317a5.819 5.819 0 0 0-3.463-3.462L.57 8.813c-.752-.275-.752-1.34 0-1.615l2.317-.848A5.823 5.823 0 0 0 6.35 2.887L7.198.57Z';
const svg = (d, size = 14) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="${d}"></path></svg>`;

const SUGGESTIONS = [
  'สรุปภาพรวมบอร์ดนี้ให้หน่อย',
  'การ์ดไหนยังไม่มีคนรับผิดชอบบ้าง',
  'งานไหนไม่มีความคืบหน้าเกิน 7 วัน',
  'สร้างการ์ดเช็กลิสต์งานประจำสัปดาห์นี้ให้หน่อย',
];

const QUICK = {
  summary: (n) => `สรุปการ์ด #${n} ให้หน่อย: เป้าหมาย สิ่งที่เสร็จแล้ว และสิ่งที่ยังค้าง`,
  checklist: (n) => `ช่วยแตกงานในการ์ด #${n} เป็นเช็กลิสต์ขั้นตอนที่ทำได้จริง แล้วเพิ่มต่อท้ายรายละเอียดของการ์ดนั้น`,
};

/** เวลาที่ผ่านไปแบบนาฬิกา 0:07 / 1:05 */
const clock = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
/** เวลาที่ใช้แบบอ่านง่าย 12 วินาที / 1 นาที 5 วินาที */
export const duration = (ms) => {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return `${s} วินาที`;
  return `${Math.floor(s / 60)} นาที${s % 60 ? ` ${s % 60} วินาที` : ''}`;
};
/** ประโยคล่าสุดของความคิด ไว้โชว์ในแถบสถานะว่ากำลังคิดเรื่องอะไร */
export const latestThought = (text, max = 90) => {
  const lines = String(text || '')
    .split(/\n+/)
    .map((l) => l.replace(/^[#>*\-\s]+|\*+/g, '').trim())
    .filter(Boolean);
  const last = lines.at(-1) || '';
  return last.length > max ? `${last.slice(0, max - 1)}…` : last;
};

/** บทสนทนาแยกตามบอร์ด — อยู่จนกว่าจะรีเฟรชหน้าหรือกด "เริ่มใหม่" */
const conversations = new Map();
let pendingPrompt = null; // คำสั่งจากปุ่มในหน้าการ์ด รอส่งเมื่อเปิดแผง

/** ผู้ให้บริการ/โมเดลที่บอร์ดนี้เลือก และพร้อมใช้หรือยัง (แอดมินตั้งคีย์แล้วหรือยัง) */
function readiness(host) {
  const settings = host.settings();
  const p = resolveProvider(settings, host.secretsSet());
  return { ...p, provider: p.id, label: p.title, settings };
}

function freshConversation(provider, model) {
  return { provider, model, session: { messages: [] }, log: [], seq: 0 };
}

function createChatView(host) {
  let root = null;
  let busy = false;
  let controller = null;
  let approveAll = false;
  let frame = 0;
  let thinkFrame = 0;
  let status = null; // ระหว่างทำงาน: { label, started, stepStarted, tools } — แถบสถานะเหนือช่องพิมพ์
  let ticker = 0; // นับเวลาทุกวินาที
  let thinking = null; // ก้อน "ความคิด" ที่กำลังเขียนอยู่
  const waiting = new Map(); // id ของกล่องขออนุญาต -> resolve

  const q = (sel) => root?.querySelector(sel);

  function conversation() {
    const id = host.board().id;
    const r = readiness(host);
    let c = conversations.get(id);
    if (!c) {
      c = freshConversation(r.provider, r.model);
      conversations.set(id, c);
    } else if ((c.provider !== r.provider || c.model !== r.model) && !busy) {
      // เปลี่ยนผู้ให้บริการ/โมเดล — รูปแบบประวัติต่างกัน เริ่มคุยใหม่
      const had = c.log.length;
      c = freshConversation(r.provider, r.model);
      if (had) c.log.push({ id: ++c.seq, type: 'note', text: `เปลี่ยนเป็น ${r.label} แล้ว — เริ่มบทสนทนาใหม่` });
      conversations.set(id, c);
    }
    return c;
  }

  function push(item) {
    const c = conversation();
    const entry = { id: ++c.seq, ...item };
    c.log.push(entry);
    renderLog();
    return entry;
  }

  /* ---------- วาดหน้าจอ ---------- */

  function itemHtml(it) {
    const { esc, markdown } = host;
    switch (it.type) {
      case 'user':
        return `<div class="ai-msg user"><div class="ai-bubble">${esc(it.text).replace(/\n/g, '<br>')}</div></div>`;
      case 'assistant':
        return `<div class="ai-msg assistant" data-ai-item="${it.id}">
                  <span class="ai-avatar">${svg(SPARKLE)}</span>
                  <div class="ai-text markdown">${it.text ? markdown(it.text) : '<span class="ai-dots"><i></i><i></i><i></i></span>'}</div>
                </div>`;
      case 'tool': {
        const icon = { run: '<span class="ai-spin"></span>', ok: '✓', error: '!', denied: '×' }[it.status] || '';
        return `<div class="ai-tool ${it.status}"><span class="ai-tool-icon">${icon}</span><span>${esc(it.label)}</span>${
          it.detail ? `<span class="ai-tool-detail">${esc(it.detail)}</span>` : ''
        }</div>`;
      }
      case 'approval':
        return `<div class="ai-approval ${it.status}" data-ai-item="${it.id}">
                  <div class="ai-approval-head">${svg(SPARKLE, 12)} AI ขออนุญาต: <strong>${esc(it.label)}</strong></div>
                  ${it.detail ? `<div class="ai-approval-detail">${it.detail}</div>` : ''}
                  ${
                    it.status === 'wait'
                      ? `<div class="ai-approval-actions">
                           <button type="button" class="btn btn-sm" data-ai-deny="${it.id}">ไม่อนุญาต</button>
                           <button type="button" class="btn btn-sm" data-ai-allow-all="${it.id}">อนุญาตทั้งหมดในคำสั่งนี้</button>
                           <button type="button" class="btn btn-sm btn-primary" data-ai-allow="${it.id}">อนุญาต</button>
                         </div>`
                      : `<div class="ai-approval-state">${it.status === 'ok' ? 'อนุญาตแล้ว' : 'ไม่อนุญาต'}</div>`
                  }
                </div>`;
      case 'thinking':
        return thinkingHtml(it);
      case 'meta':
        return `<div class="ai-meta">${esc(it.text)}</div>`;
      case 'error':
        return `<div class="ai-error">${esc(it.text)}</div>`;
      default:
        return `<div class="ai-note">${esc(it.text)}</div>`;
    }
  }

  /** ก้อน "ความคิด": ระหว่างคิดโชว์เวลาและประโยคล่าสุด · คิดเสร็จกดดูสรุปความคิดทั้งหมดได้ */
  function thinkingHtml(it) {
    const { esc, markdown } = host;
    const live = !it.ended;
    const text = String(it.text || '').trim();
    const time = live ? clock(Date.now() - it.started) : duration(it.ended - it.started);
    const head = `
      <span class="ai-think-icon">${live ? '<span class="ai-spin"></span>' : svg(SPARKLE, 11)}</span>
      <span class="ai-think-title">${live ? 'กำลังคิด' : 'คิดอยู่'} <span data-ai-think-time>${time}</span></span>
      ${text ? `<span class="ai-think-peek" data-ai-think-peek>${esc(latestThought(text))}</span>` : ''}`;
    if (!text) return `<div class="ai-think${live ? ' live' : ''}" data-ai-item="${it.id}"><div class="ai-think-head">${head}</div></div>`;
    return `
      <details class="ai-think${live ? ' live' : ''}" data-ai-item="${it.id}" data-ai-think="${it.id}"${it.open ? ' open' : ''}>
        <summary class="ai-think-head">${head}</summary>
        <div class="ai-think-body markdown" data-ai-think-body>${markdown(text)}</div>
      </details>`;
  }

  function renderLog() {
    const log = q('[data-ai-log]');
    if (!log) return;
    const c = conversation();
    const near = log.scrollHeight - log.scrollTop - log.clientHeight < 120;
    if (!c.log.length) {
      log.innerHTML = `
        <div class="ai-empty">
          <span class="ai-empty-icon">${svg(SPARKLE, 22)}</span>
          <h3>สั่งงานบอร์ดด้วยภาษาคน</h3>
          <p>ถามเรื่องการ์ด สรุปงาน หรือให้ช่วยสร้าง/แก้/ย้ายการ์ด — ทุกการแก้จะถามคุณก่อน</p>
          <div class="ai-suggest">${SUGGESTIONS.map((s) => `<button type="button" class="btn btn-sm" data-ai-suggest>${host.esc(s)}</button>`).join('')}</div>
        </div>`;
      return;
    }
    log.innerHTML = c.log.map(itemHtml).join('');
    if (near || busy) log.scrollTop = log.scrollHeight;
  }

  /* ---------- สถานะระหว่างทำงาน: กำลังทำอะไร + เวลาที่ใช้ไป ---------- */

  function paintStatus() {
    const el = q('[data-ai-status]');
    if (!el) return;
    el.hidden = !status;
    if (!status) return (el.innerHTML = '');
    el.innerHTML = `
      <span class="ai-spin"></span>
      <span class="ai-status-label">${host.esc(status.label)}</span>
      <span class="ai-status-time" title="เวลาที่ใช้ไปตั้งแต่ส่งคำสั่ง">${clock(Date.now() - status.started)}</span>`;
    const t = thinking && q(`[data-ai-item="${thinking.id}"] [data-ai-think-time]`);
    if (t) t.textContent = clock(Date.now() - thinking.started);
  }

  function setStatus(label) {
    if (!status) return;
    status.label = label;
    paintStatus();
  }

  /** เริ่ม/ต่อก้อนความคิด (Claude ส่งสรุปมาทีละนิด · บางเจ้าส่งมาทั้งก้อนหลังตอบ) */
  function addThinking(delta = '') {
    if (!thinking) {
      thinking = push({ type: 'thinking', text: '', started: status?.stepStarted ?? Date.now(), ended: null, open: false });
    }
    thinking.text += delta;
    const thought = latestThought(thinking.text);
    setStatus(thought ? `กำลังคิด — ${thought}` : 'กำลังคิด');
    paintThinking();
  }

  function endThinking() {
    if (!thinking) return;
    thinking.ended = Date.now();
    thinking = null;
    renderLog();
  }

  /** ระหว่างคิด วาดใหม่แค่ประโยคล่าสุด (และเนื้อหาถ้ากางอยู่) ไม่เกินเฟรมละครั้ง */
  function paintThinking() {
    if (thinkFrame || !thinking) return;
    thinkFrame = requestAnimationFrame(() => {
      thinkFrame = 0;
      const it = thinking;
      if (!it) return;
      const el = q(`[data-ai-item="${it.id}"]`);
      // ก้อนที่ยังไม่มีข้อความเป็นกล่องธรรมดา พอมีข้อความต้องวาดใหม่เป็นแบบกดกางได้
      if (!el || !el.matches('details')) return renderLog();
      const peek = el.querySelector('[data-ai-think-peek]');
      if (peek) peek.textContent = latestThought(it.text);
      if (el.open) el.querySelector('[data-ai-think-body]').innerHTML = host.markdown(it.text);
      const log = q('[data-ai-log]');
      if (log) log.scrollTop = log.scrollHeight;
    });
  }

  /** ระหว่างสตรีม วาดใหม่แค่ข้อความล่าสุด ไม่เกินเฟรมละครั้ง */
  function paintAssistant(item) {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const el = q(`[data-ai-item="${item.id}"] .ai-text`);
      if (!el) return renderLog();
      el.innerHTML = item.text ? host.markdown(item.text) : '<span class="ai-dots"><i></i><i></i><i></i></span>';
      const log = q('[data-ai-log]');
      if (log) log.scrollTop = log.scrollHeight;
    });
  }

  function renderChrome() {
    if (!root) return;
    const r = readiness(host);
    const me = host.board().me;
    q('[data-ai-model]').textContent = r.label;
    const setup = q('[data-ai-setup]');
    setup.hidden = r.ready;
    if (!r.ready) {
      const name = r.kind === 'anthropic' ? 'Claude (Anthropic)' : r.label.split(' · ')[0];
      setup.innerHTML = me?.isAdmin
        ? `ยังไม่ได้ตั้ง API key ของ ${name} <button type="button" class="btn btn-sm btn-primary" data-ai-open-settings>ตั้งค่าคีย์</button>`
        : `ยังไม่ได้ตั้ง API key ของ ${name} — ขอให้แอดมินตั้งที่ เมนูบอร์ด → ปลั๊กอิน → AI Assistant`;
    }
    const input = q('[data-ai-input]');
    input.disabled = !r.ready;
    q('[data-ai-send]').hidden = busy;
    q('[data-ai-stop]').hidden = !busy;
    q('[data-ai-send]').disabled = !r.ready;
    q('[data-ai-clear]').disabled = busy;
    root.classList.toggle('busy', busy);
  }

  /* ---------- ขออนุญาตก่อนแก้บอร์ด ---------- */

  function approvalDetail(name, input) {
    const { esc } = host;
    const row = (k, v) => (v === undefined || v === null || v === '' ? '' : `<div class="ai-kv"><span>${k}</span><span>${esc(v)}</span></div>`);
    const list = (v) => (Array.isArray(v) ? (v.length ? v.join(', ') : '(ไม่มี)') : undefined);
    const body = (v) =>
      v === undefined ? '' : `<pre class="ai-pre">${esc(String(v).length > 600 ? `${String(v).slice(0, 600)}…` : String(v)) || '(ว่าง)'}</pre>`;
    switch (name) {
      case 'create_card':
        return row('คอลัมน์', input.column) + row('labels', list(input.labels)) + row('ผู้รับผิดชอบ', list(input.assignees)) + body(input.body);
      case 'update_card':
        return row('ชื่อใหม่', input.title) + row('labels', list(input.labels)) + row('ผู้รับผิดชอบ', list(input.assignees)) + body(input.body);
      case 'move_card':
        return row('ตำแหน่ง', input.position === 'top' ? 'บนสุด' : 'ล่างสุด');
      case 'create_label':
        return row('สี', input.color);
      default:
        // เครื่องมือของปลั๊กอินอื่น: โชว์ค่าที่ส่งไปทุกช่อง
        return name.includes('__')
          ? Object.entries(input || {})
              .slice(0, 12)
              .map(([k, v]) => row(k, typeof v === 'object' ? JSON.stringify(v) : String(v)))
              .join('')
          : '';
    }
  }

  function askApproval(name, input, signal, label = describeCall(name, input, host.board())) {
    const item = push({ type: 'approval', label, detail: approvalDetail(name, input), status: 'wait' });
    return new Promise((resolve, reject) => {
      waiting.set(item.id, (decision) => {
        item.status = decision === 'deny' ? 'denied' : 'ok';
        renderLog();
        resolve(decision);
      });
      signal.addEventListener('abort', () => {
        if (!waiting.delete(item.id)) return;
        item.status = 'denied';
        renderLog();
        reject(Object.assign(new Error('หยุดแล้ว'), { aborted: true }));
      });
    });
  }

  /* ---------- ส่งคำสั่ง ---------- */

  async function send(text) {
    const prompt = String(text || '').trim();
    if (!prompt || busy || !root) return;
    const r = readiness(host);
    if (!r.ready) return renderChrome();
    const c = conversation();
    const { allowEdits = true, confirmEdits = true, instructions = '', effort = 'default' } = r.settings;

    busy = true;
    approveAll = false;
    controller = new AbortController();
    const signal = controller.signal;
    push({ type: 'user', text: prompt });
    let current = null; // ก้อนคำตอบที่กำลังพิมพ์ (สร้างเมื่อตัวอักษรแรกมาถึง ความคิดจะได้ขึ้นก่อน)
    status = { label: 'กำลังเริ่ม', started: Date.now(), stepStarted: Date.now(), tools: 0 };
    ticker = setInterval(paintStatus, 1000);
    renderChrome();
    paintStatus();

    // ปลั๊กอินอื่นในบอร์ดที่ให้ AI ใช้ได้ (เช่นแผนที่ RedM) — Tanva รุ่นเก่าไม่มี pluginExports ก็ข้ามไป
    let ext = extensionTools([]);
    try {
      ext = extensionTools((await host.pluginExports?.('ai')) || []);
    } catch (err) {
      console.error('[ai_assistant] Could not load tools from other plugins:', err);
    }

    const execute = makeExecutor(host, { allowEdits, extra: ext.byName });
    const describe = (name, input) => describeCall(name, input, host.board(), ext.byName);
    const closeEmptyAnswer = () => {
      // ข้อความที่ AI พิมพ์ก่อนเรียกเครื่องมือจบตรงนี้ — ถ้ายังว่างอยู่ก็เอาออก
      if (current && !current.text) conversation().log.splice(conversation().log.indexOf(current), 1);
      current = null;
    };
    const ctx = {
      model: r.model,
      effort,
      system: systemPrompt(host.board(), { allowEdits, instructions, guides: ext.guides }),
      tools: toolsFor({ allowEdits, extra: ext.tools }),
      // Claude: SDK ต่อ /v1/messages เอง · เจ้าอื่น: SDK ของ OpenAI ต่อ /chat/completions ต่อจาก basePath
      proxyUrl: host.proxyUrl(r.proxy),
      baseURL: `${host.proxyUrl(r.proxy)}${r.basePath || ''}`,
      label: r.label.split(' · ')[0],
      headers: r.headers || {},
      signal,
      onRequest() {
        endThinking();
        if (status) status.stepStarted = Date.now();
        setStatus('กำลังคิด');
      },
      onThinkingStart() {
        addThinking('');
      },
      onThinking(delta) {
        addThinking(delta);
      },
      onText(delta) {
        endThinking();
        if (!current) current = push({ type: 'assistant', text: '' });
        current.text += delta;
        setStatus('กำลังพิมพ์คำตอบ');
        paintAssistant(current);
      },
      onToolStart() {
        endThinking();
        setStatus('กำลังเตรียมใช้เครื่องมือ');
      },
      onStep() {
        endThinking();
        current = null; // ข้อความของรอบถัดไปขึ้นเป็นก้อนใหม่ ต่อจากรายการเครื่องมือ
      },
      async runTool(name, input) {
        endThinking();
        closeEmptyAnswer();
        const tool = TOOL_BY_NAME.get(name) || ext.byName.get(name);
        const label = describe(name, input);
        if (tool?.write && confirmEdits && !approveAll) {
          setStatus(`รอคุณอนุญาต — ${label}`);
          const decision = await askApproval(name, input, signal, label);
          if (decision === 'deny') {
            return { content: 'ผู้ใช้ไม่อนุญาตให้ทำรายการนี้ ถามผู้ใช้ก่อนว่าต้องการแบบไหน', isError: true };
          }
          if (decision === 'all') approveAll = true;
        }
        setStatus(label);
        if (status) status.tools++;
        const chip = push({ type: 'tool', label, status: 'run' });
        const result = await execute(name, input);
        chip.status = result.isError ? 'error' : 'ok';
        if (result.isError) chip.detail = result.content;
        renderLog();
        return result;
      },
    };

    try {
      const run = r.kind === 'anthropic' ? runClaudeTurn : runOpenAITurn;
      const outcome = await run(c.session, prompt, ctx);
      if (outcome?.refused) push({ type: 'error', text: 'AI ปฏิเสธคำขอนี้ ลองเรียบเรียงคำสั่งใหม่' });
    } catch (err) {
      push(err.aborted ? { type: 'note', text: 'หยุดแล้ว' } : { type: 'error', text: err.message });
    } finally {
      endThinking();
      // ก้อนข้อความที่ยังว่าง (เช่นหยุดก่อน AI พิมพ์) ไม่ต้องแสดง
      const log = conversation().log;
      for (let i = log.length - 1; i >= 0; i--) if (log[i].type === 'assistant' && !log[i].text) log.splice(i, 1);
      // สรุปท้ายคำตอบ: ใช้เวลาไปเท่าไร เรียกเครื่องมือกี่ครั้ง
      if (status) {
        const took = `ใช้เวลา ${duration(Date.now() - status.started)}`;
        log.push({ id: ++conversation().seq, type: 'meta', text: status.tools ? `${took} · ใช้เครื่องมือ ${status.tools} ครั้ง` : took });
      }
      clearInterval(ticker);
      ticker = 0;
      status = null;
      busy = false;
      controller = null;
      waiting.clear();
      renderLog();
      renderChrome();
      paintStatus();
      if (root) q('[data-ai-input]').focus();
    }
  }

  function autosize(input) {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
  }

  return {
    mount(el) {
      // วาดลงกล่องของตัวเองข้างใน ไม่แตะ class ของกล่องที่หน้าเว็บส่งมา (ปลั๊กอินอื่นใช้กล่องเดียวกัน)
      el.innerHTML = '<div class="ai-root"></div>';
      root = el.firstElementChild;
      root.innerHTML = `
        <div class="ai-wrap">
          <header class="ai-head">
            <span class="ai-model" data-ai-model></span>
            <button type="button" class="btn btn-sm btn-invisible" data-ai-clear title="ล้างบทสนทนาแล้วเริ่มใหม่">เริ่มใหม่</button>
          </header>
          <div class="ai-log" data-ai-log></div>
          <div class="ai-status" data-ai-status role="status" aria-live="polite" hidden></div>
          <div class="ai-setup" data-ai-setup hidden></div>
          <form class="ai-form" data-ai-form>
            <textarea class="input" data-ai-input rows="1" maxlength="4000" title="Enter ส่ง · Shift+Enter ขึ้นบรรทัดใหม่"
              placeholder="สั่งงานได้เลย เช่น “ย้ายการ์ดที่เสร็จแล้วไป Done”"></textarea>
            <button type="submit" class="btn btn-primary" data-ai-send>ส่ง</button>
            <button type="button" class="btn" data-ai-stop hidden>หยุด</button>
          </form>
          <p class="ai-foot">AI อาจผิดพลาดได้ · ทุกการแก้บอร์ดบันทึกในประวัติด้วยชื่อคุณ</p>
        </div>`;

      const input = q('[data-ai-input]');
      q('[data-ai-form]').addEventListener('submit', (e) => {
        e.preventDefault();
        const text = input.value;
        input.value = '';
        autosize(input);
        send(text);
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
          e.preventDefault();
          q('[data-ai-form]').requestSubmit();
        }
      });
      input.addEventListener('input', () => autosize(input));
      // จำว่าก้อนความคิดไหนกางไว้ วาดใหม่แล้วจะได้ไม่หุบเอง
      root.addEventListener(
        'toggle',
        (e) => {
          const id = Number(e.target.dataset?.aiThink);
          const it = id && conversation().log.find((x) => x.id === id);
          if (!it) return;
          it.open = e.target.open;
          if (it.open) e.target.querySelector('[data-ai-think-body]').innerHTML = host.markdown(it.text);
        },
        true
      );
      q('[data-ai-stop]').addEventListener('click', () => controller?.abort());
      q('[data-ai-clear]').addEventListener('click', () => {
        const r = readiness(host);
        conversations.set(host.board().id, freshConversation(r.provider, r.model));
        renderLog();
        input.focus();
      });
      root.addEventListener('click', (e) => {
        const suggest = e.target.closest('[data-ai-suggest]');
        if (suggest) return send(suggest.textContent);
        if (e.target.closest('[data-ai-open-settings]')) return host.openSettings();
        for (const [attr, decision] of [
          ['data-ai-allow', 'ok'],
          ['data-ai-allow-all', 'all'],
          ['data-ai-deny', 'deny'],
        ]) {
          const btn = e.target.closest(`[${attr}]`);
          if (!btn) continue;
          const id = Number(btn.getAttribute(attr));
          const resolve = waiting.get(id);
          waiting.delete(id);
          resolve?.(decision);
          return;
        }
      });

      renderLog();
      renderChrome();
      if (pendingPrompt) {
        const text = pendingPrompt;
        pendingPrompt = null;
        send(text);
      } else if (matchMedia('(hover: hover)').matches) input.focus();
    },

    update() {
      if (!root) return;
      if (!busy) conversation(); // เปลี่ยนโมเดลในหน้าตั้งค่า = เริ่มใหม่
      renderLog();
      renderChrome();
      if (pendingPrompt && !busy) {
        const text = pendingPrompt;
        pendingPrompt = null;
        send(text);
      }
    },

    unmount() {
      controller?.abort();
      cancelAnimationFrame(frame);
      frame = 0;
      root = null;
    },
  };
}

export default function setup(host) {
  return {
    // แผงด้านขวาของจอ — เปิด/ปิดจากปุ่มรูปดาวบนหัวเว็บ ใช้คู่กับบอร์ด/แผนที่/ประวัติได้
    panels: { assistant: createChatView(host) },

    /** ปุ่มลัดในหน้าการ์ด: ส่งคำสั่งเกี่ยวกับการ์ดใบนี้ไปที่แท็บผู้ช่วย */
    cardPanel(section, card) {
      section.innerHTML = `
        <div class="sidebar-title"><span>${svg(SPARKLE)} ผู้ช่วย AI</span></div>
        <div class="ai-quick">
          <button type="button" class="btn btn-sm" data-ai-quick="summary">สรุปการ์ดนี้</button>
          <button type="button" class="btn btn-sm" data-ai-quick="checklist">แตกเป็นเช็กลิสต์</button>
        </div>`;
      section.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-ai-quick]');
        if (!btn) return;
        pendingPrompt = QUICK[btn.dataset.aiQuick](card.number);
        host.closeCard();
        host.openPanel('assistant'); // เปิดแล้วส่งคำสั่งให้เอง (ถ้าเปิดอยู่แล้ว update() จะหยิบไปส่ง)
        host.refresh?.();
      });
    },
  };
}
