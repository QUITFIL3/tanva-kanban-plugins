/**
 * ผู้ช่วย AI สำหรับ Tanva Kanban — สั่งงานบอร์ดด้วยภาษาคน
 * ใช้ได้หลายเจ้า: Claude, OpenAI, OpenRouter, Google Gemini, Groq, DeepSeek, Mistral, xAI (ดู providers.js)
 *
 * - แผงด้านขวาของจอ "ผู้ช่วย AI": เปิดค้างไว้ข้างบอร์ด/แผนที่ได้ อ่าน/สร้าง/แก้/ย้ายการ์ดผ่านเครื่องมือใน tools.js
 * - การแก้บอร์ดทุกครั้งใช้สิทธิ์ของคนที่สั่ง และ (ค่าเริ่มต้น) ต้องกดอนุญาตก่อน
 * - API key อยู่ที่เซิร์ฟเวอร์ (แอดมินตั้งในหน้าตั้งค่าปลั๊กอิน) — เบราว์เซอร์คุยผ่าน proxy เท่านั้น
 */
import { TOOL_BY_NAME, systemPrompt, toolsFor, makeExecutor, describeCall } from './tools.js';
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
      case 'error':
        return `<div class="ai-error">${esc(it.text)}</div>`;
      default:
        return `<div class="ai-note">${esc(it.text)}</div>`;
    }
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
        return '';
    }
  }

  function askApproval(name, input, signal) {
    const item = push({ type: 'approval', label: describeCall(name, input, host.board()), detail: approvalDetail(name, input), status: 'wait' });
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
    let current = push({ type: 'assistant', text: '' });
    renderChrome();

    const execute = makeExecutor(host, { allowEdits });
    const ctx = {
      model: r.model,
      effort,
      system: systemPrompt(host.board(), { allowEdits, instructions }),
      tools: toolsFor({ allowEdits }),
      // Claude: SDK ต่อ /v1/messages เอง · เจ้าอื่น: SDK ของ OpenAI ต่อ /chat/completions ต่อจาก basePath
      proxyUrl: host.proxyUrl(r.proxy),
      baseURL: `${host.proxyUrl(r.proxy)}${r.basePath || ''}`,
      label: r.label.split(' · ')[0],
      headers: r.headers || {},
      signal,
      onText(delta) {
        if (!current) current = push({ type: 'assistant', text: '' });
        current.text += delta;
        paintAssistant(current);
      },
      onStep() {
        current = null; // ข้อความของรอบถัดไปขึ้นเป็นก้อนใหม่ ต่อจากรายการเครื่องมือ
      },
      async runTool(name, input) {
        // ข้อความที่ AI พิมพ์ก่อนเรียกเครื่องมือจบตรงนี้ — ถ้ายังว่างอยู่ก็เอาออก
        if (current && !current.text) conversation().log.splice(conversation().log.indexOf(current), 1);
        current = null;
        const tool = TOOL_BY_NAME.get(name);
        if (tool?.write && confirmEdits && !approveAll) {
          const decision = await askApproval(name, input, signal);
          if (decision === 'deny') {
            return { content: 'ผู้ใช้ไม่อนุญาตให้ทำรายการนี้ ถามผู้ใช้ก่อนว่าต้องการแบบไหน', isError: true };
          }
          if (decision === 'all') approveAll = true;
        }
        const chip = push({ type: 'tool', label: describeCall(name, input, host.board()), status: 'run' });
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
      // ก้อนข้อความที่ยังว่าง (เช่นหยุดก่อน AI พิมพ์) ไม่ต้องแสดง
      const log = conversation().log;
      for (let i = log.length - 1; i >= 0; i--) if (log[i].type === 'assistant' && !log[i].text) log.splice(i, 1);
      busy = false;
      controller = null;
      waiting.clear();
      renderLog();
      renderChrome();
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
