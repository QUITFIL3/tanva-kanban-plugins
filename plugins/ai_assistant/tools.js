/**
 * เครื่องมือที่ผู้ช่วย AI ใช้อ่าน/แก้บอร์ด — ใช้ร่วมกันทั้ง Claude และ OpenAI
 *
 * ทุกการแก้วิ่งผ่าน host.request() ด้วยสิทธิ์ของคนที่สั่ง AI อยู่ (เซิร์ฟเวอร์ตรวจสิทธิ์/ล็อกการ์ดให้เหมือนคนกดเอง)
 * และถูกบันทึกในแท็บประวัติด้วยชื่อคนนั้น
 */

const LIST_LIMIT = 60;
const BODY_LIMIT = 20000;
const LABEL_COLORS = ['#3e63dd', '#30a46c', '#f76b15', '#e5484d', '#8e4ec6', '#d6409f', '#12a594', '#ffc53d'];

/** นิยามเครื่องมือ (JSON Schema) — write = แก้บอร์ด (ต้องเปิดสิทธิ์และอาจต้องขออนุญาตก่อน) */
export const TOOLS = [
  {
    name: 'list_cards',
    write: false,
    description:
      'List cards on the current board with their number, title, column, labels, assignees and checklist progress. ' +
      'Use the filters to narrow the list. Archived cards are hidden unless include_archived is true.',
    parameters: {
      type: 'object',
      properties: {
        column: { type: 'string', description: 'Only cards in this column (name as shown on the board)' },
        query: { type: 'string', description: 'Only cards whose title or description contains this text' },
        label: { type: 'string', description: 'Only cards that have this label' },
        assignee: { type: 'string', description: 'Only cards assigned to this person (display name, or "me")' },
        unassigned: { type: 'boolean', description: 'Only cards with no assignee' },
        include_archived: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_card',
    write: false,
    description: 'Read one card in full, including its markdown description, attachments and dates.',
    parameters: {
      type: 'object',
      properties: { number: { type: 'integer', description: 'Card number, e.g. 12 for #12' } },
      required: ['number'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_card',
    write: true,
    description:
      'Create a new card. The description is GitHub-flavored markdown; write checklists as "- [ ] item". ' +
      'Labels must already exist (use create_label first if needed).',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        body: { type: 'string', description: 'Markdown description' },
        column: { type: 'string', description: 'Column name; defaults to the first column' },
        labels: { type: 'array', items: { type: 'string' }, description: 'Label names' },
        assignees: { type: 'array', items: { type: 'string' }, description: 'Display names, or "me"' },
      },
      required: ['title'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_card',
    write: true,
    description:
      'Change a card. Only the fields you pass are changed. labels and assignees replace the whole list. ' +
      'To tick a checklist item, send the full updated body.',
    parameters: {
      type: 'object',
      properties: {
        number: { type: 'integer' },
        title: { type: 'string' },
        body: { type: 'string', description: 'The complete new markdown description' },
        labels: { type: 'array', items: { type: 'string' } },
        assignees: { type: 'array', items: { type: 'string' } },
      },
      required: ['number'],
      additionalProperties: false,
    },
  },
  {
    name: 'move_card',
    write: true,
    description: 'Move a card to another column (to the top or the bottom of that column).',
    parameters: {
      type: 'object',
      properties: {
        number: { type: 'integer' },
        column: { type: 'string' },
        position: { type: 'string', enum: ['top', 'bottom'], description: 'Defaults to bottom' },
      },
      required: ['number', 'column'],
      additionalProperties: false,
    },
  },
  {
    name: 'archive_card',
    write: true,
    description: 'Archive a card (hide it from the board without deleting it), or restore it with archived: false.',
    parameters: {
      type: 'object',
      properties: { number: { type: 'integer' }, archived: { type: 'boolean', description: 'Defaults to true' } },
      required: ['number'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_label',
    write: true,
    description: 'Create a new label on the board.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        color: { type: 'string', description: 'Hex color like #3e63dd (optional)' },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
];

export const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

/* ---------------- ค้นชื่อ → id ---------------- */

const norm = (s) => String(s ?? '').trim().toLowerCase();
const ME = new Set(['me', 'myself', 'ฉัน', 'ผม', 'หนู', 'เรา', 'ตัวเอง', 'ตัวฉัน']);

class ToolError extends Error {}

/** หาจากชื่อตรงตัวก่อน แล้วค่อยขึ้นต้นด้วย/มีคำนั้น (ต้องไม่กำกวม) */
function pick(items, name, labelOf, kind) {
  const q = norm(name);
  if (!q) throw new ToolError(`ต้องระบุ${kind}`);
  const all = items.map((item) => [item, norm(labelOf(item))]);
  const hit =
    all.filter(([, n]) => n === q).map(([i]) => i)[0] ??
    (() => {
      for (const test of [(n) => n.startsWith(q), (n) => n.includes(q)]) {
        const found = all.filter(([, n]) => test(n)).map(([i]) => i);
        if (found.length === 1) return found[0];
        if (found.length > 1) throw new ToolError(`${kind} "${name}" กำกวม ตรงกับ: ${found.map(labelOf).join(', ')}`);
      }
      return null;
    })();
  if (!hit) throw new ToolError(`ไม่พบ${kind} "${name}" (มี: ${items.map(labelOf).join(', ') || 'ไม่มี'})`);
  return hit;
}

const columnByName = (board, name) => pick(board.columns, name, (c) => c.name, 'คอลัมน์');
const labelIds = (board, names) => (names || []).map((n) => pick(board.labels, n, (l) => l.name, 'label').id);

function memberIds(board, names) {
  return (names || []).map((n) => {
    if (ME.has(norm(n)) && board.me) return board.me.id;
    const byId = board.members.find((m) => m.id === String(n));
    if (byId) return byId.id;
    return pick(board.members, n, (m) => m.displayName || m.username || m.id, 'สมาชิก').id;
  });
}

function cardByNumber(board, number) {
  const n = Number(number);
  const card = Number.isInteger(n) ? board.cards.find((c) => c.number === n) : null;
  if (!card) throw new ToolError(`ไม่พบการ์ด #${number}`);
  return card;
}

/* ---------------- สรุปข้อมูลให้ AI อ่าน ---------------- */

const day = (iso) => (iso ? String(iso).slice(0, 10) : null);

/** นับ checkbox แบบเดียวกับแถบความคืบหน้าในหน้าเว็บ (ข้ามบล็อกโค้ด) */
export function checklist(body) {
  let done = 0;
  let total = 0;
  let fenced = false;
  for (const line of String(body || '').split('\n')) {
    if (/^\s*```/.test(line)) fenced = !fenced;
    if (fenced) continue;
    const m = line.match(/^\s*(?:>\s*)*(?:[-*+]|\d{1,9}[.)])\s+\[([ xX]?)\]/);
    if (!m) continue;
    total += 1;
    if (m[1] && m[1] !== ' ') done += 1;
  }
  return total ? `${done}/${total}` : null;
}

function cardSummary(board, card) {
  const col = board.columns.find((c) => c.id === card.columnId);
  const out = {
    number: card.number,
    title: card.title,
    column: col?.name || null,
    labels: card.labels.map((id) => board.labels.find((l) => l.id === id)?.name).filter(Boolean),
    assignees: card.assignees.map((id) => board.members.find((m) => m.id === id)?.displayName || id),
    updated: day(card.updatedAt),
  };
  const progress = checklist(card.body);
  if (progress) out.checklist = progress;
  if (card.archived) out.archived = true;
  return out;
}

/** ข้อความระบบ: บทบาท + โครงบอร์ด (ไม่ใส่การ์ดทั้งหมด — ให้เรียก list_cards เอา) */
export function systemPrompt(board, { allowEdits = true, instructions = '', now = new Date() } = {}) {
  const cards = board.cards.filter((c) => !c.archived);
  const columns = [...board.columns]
    .sort((a, b) => a.order - b.order)
    .map((c) => {
      const n = cards.filter((x) => x.columnId === c.id).length;
      return `- ${c.name} (${n} card${n === 1 ? '' : 's'}${c.limit ? `, WIP limit ${c.limit}` : ''})`;
    })
    .join('\n');
  const lines = [
    'You are the AI assistant built into Tanva Kanban, a GitHub Projects-style kanban board.',
    'You help the team manage the board below by calling the provided tools.',
    '',
    `Board: ${board.meta?.title || 'Untitled'}${board.meta?.description ? ` — ${board.meta.description}` : ''}`,
    `Today: ${now.toISOString().slice(0, 10)} (${now.toLocaleDateString('en-US', { weekday: 'long' })})`,
    `You are talking to: ${board.me?.displayName || 'a team member'}`,
    '',
    'Columns, in order:',
    columns || '- (none)',
    `Labels: ${board.labels.map((l) => l.name).join(', ') || '(none)'}`,
    `Members: ${board.members.map((m) => m.displayName || m.username).join(', ') || '(none)'}`,
    '',
    'How to work:',
    '- Look things up with list_cards / get_card before answering questions about cards. Never invent cards or numbers.',
    '- Refer to cards as #number. Card descriptions are GitHub-flavored markdown; write checklists as "- [ ] item".',
    '- Change only what the user asked for. Before changing more than 5 cards at once, describe the plan and ask first.',
    '- If a tool returns an error, explain it plainly and suggest what to do.',
    '- Reply in the same language as the user (usually Thai). Be concise; use short markdown lists where they help.',
  ];
  if (!allowEdits) {
    lines.push(
      '- Editing is turned off for this board: you can read cards but cannot change anything. If asked to change something, say so.'
    );
  }
  if (String(instructions || '').trim()) {
    lines.push('', 'Additional instructions from the board owner:', String(instructions).trim());
  }
  return lines.join('\n');
}

/** เครื่องมือที่เปิดให้ใช้ตามสิทธิ์ของบอร์ด */
export const toolsFor = ({ allowEdits = true } = {}) => TOOLS.filter((t) => allowEdits || !t.write);

/* ---------------- คำอธิบายสั้น ๆ สำหรับแสดงในแชท / กล่องขออนุญาต ---------------- */

export function describeCall(name, input = {}, board = null) {
  const num = input.number !== undefined ? `#${input.number}` : '';
  const title = board && input.number !== undefined ? board.cards.find((c) => c.number === Number(input.number))?.title : null;
  const card = title ? `${num} “${title}”` : num;
  switch (name) {
    case 'list_cards': {
      const parts = [
        input.column && `คอลัมน์ ${input.column}`,
        input.label && `label ${input.label}`,
        input.assignee && `ของ ${input.assignee}`,
        input.unassigned && 'ที่ยังไม่มีคนรับ',
        input.query && `ที่มีคำว่า “${input.query}”`,
      ].filter(Boolean);
      return `ดูรายการการ์ด${parts.length ? ` (${parts.join(', ')})` : ''}`;
    }
    case 'get_card':
      return `อ่านการ์ด ${card}`;
    case 'create_card':
      return `สร้างการ์ด “${input.title || ''}”${input.column ? ` ในคอลัมน์ ${input.column}` : ''}`;
    case 'update_card': {
      const what = [
        input.title !== undefined && 'ชื่อ',
        input.body !== undefined && 'รายละเอียด',
        input.labels !== undefined && 'labels',
        input.assignees !== undefined && 'ผู้รับผิดชอบ',
      ].filter(Boolean);
      return `แก้การ์ด ${card}${what.length ? ` (${what.join(', ')})` : ''}`;
    }
    case 'move_card':
      return `ย้ายการ์ด ${card} ไปคอลัมน์ ${input.column || ''}`;
    case 'archive_card':
      return input.archived === false ? `นำการ์ด ${card} ออกจากคลัง` : `เก็บการ์ด ${card} เข้าคลัง`;
    case 'create_label':
      return `สร้าง label “${input.name || ''}”`;
    default:
      return name;
  }
}

/* ---------------- ลงมือทำ ---------------- */

const json = (value) => JSON.stringify(value);

/**
 * สร้างตัวรันเครื่องมือ — คืน { content: string, isError: boolean }
 * host = host ของปลั๊กอิน (ใช้ board() อ่านสถานะล่าสุด และ request() แก้ข้อมูล)
 */
export function makeExecutor(host, { allowEdits = true } = {}) {
  return async function run(name, input) {
    const tool = TOOL_BY_NAME.get(name);
    if (!tool) return { content: `ไม่มีเครื่องมือชื่อ ${name}`, isError: true };
    if (tool.write && !allowEdits) return { content: 'บอร์ดนี้ปิดสิทธิ์ให้ AI แก้ไขไว้', isError: true };
    const args = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    try {
      return { content: await RUN[name](host, args), isError: false };
    } catch (err) {
      const message = err instanceof ToolError ? err.message : err?.message || String(err);
      const busy = err?.status === 423 ? ' (มีคนกำลังแก้การ์ดใบนี้อยู่ ลองใหม่ภายหลัง)' : '';
      return { content: `ทำไม่สำเร็จ: ${message}${busy}`, isError: true };
    }
  };
}

const RUN = {
  async list_cards(host, a) {
    const board = host.board();
    const column = a.column ? columnByName(board, a.column) : null;
    const label = a.label ? pick(board.labels, a.label, (l) => l.name, 'label') : null;
    const person = a.assignee ? memberIds(board, [a.assignee])[0] : null;
    const q = norm(a.query);
    const order = new Map([...board.columns].sort((x, y) => x.order - y.order).map((c, i) => [c.id, i]));
    const cards = board.cards
      .filter((c) => a.include_archived || !c.archived)
      .filter((c) => !column || c.columnId === column.id)
      .filter((c) => !label || c.labels.includes(label.id))
      .filter((c) => !person || c.assignees.includes(person))
      .filter((c) => !a.unassigned || !c.assignees.length)
      .filter((c) => !q || norm(`${c.title}\n${c.body}`).includes(q))
      .sort((x, y) => (order.get(x.columnId) ?? 99) - (order.get(y.columnId) ?? 99) || x.order - y.order);
    return json({
      total: cards.length,
      shown: Math.min(cards.length, LIST_LIMIT),
      cards: cards.slice(0, LIST_LIMIT).map((c) => cardSummary(board, c)),
    });
  },

  async get_card(host, a) {
    const board = host.board();
    const card = cardByNumber(board, a.number);
    const body = String(card.body || '');
    return json({
      ...cardSummary(board, card),
      body: body.length > BODY_LIMIT ? `${body.slice(0, BODY_LIMIT)}\n…(ตัดเหลือ ${BODY_LIMIT} ตัวอักษรแรก)` : body,
      attachments: (card.attachments || []).map((f) => f.name),
      created: day(card.createdAt),
      createdBy: card.createdByName || null,
    });
  },

  async create_card(host, a) {
    const board = host.board();
    const title = String(a.title || '').trim();
    if (!title) throw new ToolError('ต้องมีชื่อการ์ด');
    const column = a.column ? columnByName(board, a.column) : [...board.columns].sort((x, y) => x.order - y.order)[0];
    const card = await host.request('POST', '/cards', {
      title,
      body: a.body ? String(a.body) : '',
      columnId: column?.id,
      labels: labelIds(board, a.labels),
      assignees: memberIds(board, a.assignees),
    });
    return json({ ok: true, number: card.number, column: column?.name });
  },

  async update_card(host, a) {
    const board = host.board();
    const card = cardByNumber(board, a.number);
    const patch = {};
    if (a.title !== undefined) patch.title = String(a.title);
    if (a.body !== undefined) patch.body = String(a.body);
    if (a.labels !== undefined) patch.labels = labelIds(board, a.labels);
    if (a.assignees !== undefined) patch.assignees = memberIds(board, a.assignees);
    if (!Object.keys(patch).length) throw new ToolError('ไม่ได้บอกว่าจะแก้อะไร');
    await host.request('PATCH', `/cards/${encodeURIComponent(card.id)}`, patch);
    return json({ ok: true, number: card.number, changed: Object.keys(patch) });
  },

  async move_card(host, a) {
    const board = host.board();
    const card = cardByNumber(board, a.number);
    const column = columnByName(board, a.column);
    // ไม่ส่ง index = ต่อท้ายคอลัมน์ (เซิร์ฟเวอร์จัดให้)
    const body = a.position === 'top' ? { columnId: column.id, index: 0 } : { columnId: column.id };
    await host.request('POST', `/cards/${encodeURIComponent(card.id)}/move`, body);
    return json({ ok: true, number: card.number, column: column.name });
  },

  async archive_card(host, a) {
    const card = cardByNumber(host.board(), a.number);
    const archived = a.archived !== false;
    await host.request('PATCH', `/cards/${encodeURIComponent(card.id)}`, { archived });
    return json({ ok: true, number: card.number, archived });
  },

  async create_label(host, a) {
    const board = host.board();
    const name = String(a.name || '').trim();
    if (!name) throw new ToolError('ต้องมีชื่อ label');
    if (board.labels.some((l) => norm(l.name) === norm(name))) throw new ToolError(`มี label "${name}" อยู่แล้ว`);
    const color = /^#[0-9a-f]{6}$/i.test(String(a.color || '')) ? a.color : LABEL_COLORS[board.labels.length % LABEL_COLORS.length];
    const label = await host.request('POST', '/labels', { name, color });
    return json({ ok: true, name: label.name, color: label.color });
  },
};
