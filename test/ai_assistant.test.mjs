/**
 * เทสต์ปลั๊กอิน ai_assistant — ส่วนที่เป็นตรรกะล้วน (ไม่ยิง API จริง ไม่ต้องมีเบราว์เซอร์)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS, systemPrompt, toolsFor, makeExecutor, describeCall, checklist } from '../plugins/ai_assistant/tools.js';
import { claudeParams, toClaudeTools, explainClaudeError } from '../plugins/ai_assistant/claude.js';
import { toOpenAITools, explainOpenAIError } from '../plugins/ai_assistant/openai.js';
import { PROVIDERS, resolveProvider } from '../plugins/ai_assistant/providers.js';
import fs from 'node:fs';

test('เลือกผู้ให้บริการ: ค่าเริ่มต้น Claude, เจ้าอื่นใช้โมเดลแนะนำเมื่อเว้นว่าง และพร้อมใช้เมื่อตั้งคีย์ของเจ้านั้นแล้ว', () => {
  const claude = resolveProvider({}, {});
  assert.equal(claude.id, 'claude');
  assert.equal(claude.model, 'claude-opus-5');
  assert.equal(claude.title, 'Claude Opus 5');
  assert.equal(claude.ready, false);

  const router = resolveProvider({ provider: 'openrouter', model: '' }, { openrouter_api_key: true, anthropic_api_key: false });
  assert.equal(router.kind, 'openai');
  assert.equal(router.model, 'openrouter/auto');
  assert.equal(router.basePath, '/api/v1');
  assert.equal(router.ready, true);
  assert.equal(router.title, 'OpenRouter · openrouter/auto');

  const custom = resolveProvider({ provider: 'gemini', model: ' gemini-2.5-pro ' }, {});
  assert.equal(custom.model, 'gemini-2.5-pro');
  assert.equal(custom.ready, false);
  assert.equal(resolveProvider({ provider: 'no-such' }).id, 'claude', 'ค่ามั่วกลับไปใช้ Claude');
  assert.equal(resolveProvider({ provider: 'openai', openaiModel: 'gpt-old' }).model, 'gpt-old', 'ค่าตั้งแบบเดิม (1.0) ยังใช้ได้');
});

test('ทุกผู้ให้บริการมีค่าลับและ proxy ใน manifest ตรงกับ basePath ที่ SDK จะเรียก', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../plugins/ai_assistant/manifest.json', import.meta.url), 'utf8'));
  const secrets = new Set(manifest.secrets.map((s) => s.key));
  const options = manifest.settings.find((s) => s.key === 'provider').options.map((o) => o.value);
  assert.deepEqual(options.sort(), Object.keys(PROVIDERS).sort());
  for (const [id, p] of Object.entries(PROVIDERS)) {
    assert.ok(secrets.has(p.secret), `${id}: ไม่มีค่าลับ ${p.secret}`);
    const route = manifest.proxy[p.proxy];
    assert.ok(route, `${id}: ไม่มี proxy ${p.proxy}`);
    const expected = p.kind === 'anthropic' ? '/v1/messages' : `${p.basePath}/chat/completions`;
    assert.ok(route.paths.includes(expected), `${id}: SDK จะเรียก ${expected} แต่ manifest ประกาศ ${route.paths}`);
    assert.ok(Object.values(route.headers).join(' ').includes(`{{${p.secret}}}`), `${id}: ส่วนหัวไม่ได้ใช้คีย์ของตัวเอง`);
  }
});

function fakeBoard() {
  return {
    id: 'b1',
    meta: { title: 'บอร์ดทดสอบ', description: 'ทีมพัฒนา' },
    me: { id: 'u1', displayName: 'Aom', isAdmin: true },
    columns: [
      { id: 'c1', name: 'Todo', order: 0, limit: null },
      { id: 'c2', name: 'In Progress', order: 1, limit: 3 },
      { id: 'c3', name: 'Done', order: 2, limit: null },
    ],
    labels: [
      { id: 'l1', name: 'bug', color: '#e5484d' },
      { id: 'l2', name: 'feature', color: '#3e63dd' },
    ],
    members: [
      { id: 'u1', displayName: 'Aom', username: 'aom' },
      { id: 'u2', displayName: 'Bank', username: 'bank' },
      { id: 'u3', displayName: 'Bankai', username: 'bk' },
    ],
    cards: [
      { id: 'k1', number: 1, title: 'แก้บั๊กม้าหาย', body: '- [x] หาสาเหตุ\n- [ ] แก้โค้ด\n```\n- [ ] ไม่นับ\n```', columnId: 'c2', order: 0, labels: ['l1'], assignees: ['u2'], updatedAt: '2026-09-20T01:00:00Z', attachments: [{ name: 'log.txt' }] },
      { id: 'k2', number: 2, title: 'ระบบบ้าน', body: 'ขายบ้านได้', columnId: 'c1', order: 0, labels: ['l2'], assignees: [], updatedAt: '2026-09-01T00:00:00Z', attachments: [] },
      { id: 'k3', number: 3, title: 'ของเก่า', body: '', columnId: 'c3', order: 0, labels: [], assignees: ['u1'], archived: true, attachments: [] },
    ],
  };
}

function fakeHost(board = fakeBoard()) {
  const calls = [];
  return {
    calls,
    board: () => board,
    async request(method, path, body) {
      calls.push({ method, path, body });
      if (method === 'PATCH' && body?.title === 'ล็อกอยู่') throw Object.assign(new Error('การ์ดนี้มีคนกำลังแก้อยู่'), { status: 423 });
      if (method === 'POST' && path === '/cards') return { number: 4, ...body };
      if (method === 'POST' && path === '/labels') return { ...body };
      return { ok: true };
    },
  };
}

const parse = (r) => JSON.parse(r.content);

test('list_cards: กรองตามคอลัมน์ label คน และซ่อนการ์ดในคลัง', async () => {
  const run = makeExecutor(fakeHost());
  const all = parse(await run('list_cards', {}));
  assert.deepEqual(all.cards.map((c) => c.number), [2, 1], 'เรียงตามลำดับคอลัมน์ และไม่มีการ์ดในคลัง');
  assert.equal(all.cards[1].checklist, '1/2', 'checkbox ในบล็อกโค้ดไม่นับ');
  assert.deepEqual(all.cards[1].assignees, ['Bank']);

  assert.deepEqual(parse(await run('list_cards', { column: 'in prog' })).cards.map((c) => c.number), [1]);
  assert.deepEqual(parse(await run('list_cards', { label: 'feature' })).cards.map((c) => c.number), [2]);
  assert.deepEqual(parse(await run('list_cards', { unassigned: true })).cards.map((c) => c.number), [2]);
  assert.deepEqual(parse(await run('list_cards', { assignee: 'me', include_archived: true })).cards.map((c) => c.number), [3]);
  assert.deepEqual(parse(await run('list_cards', { query: 'ขายบ้าน' })).cards.map((c) => c.number), [2]);
});

test('get_card: อ่านรายละเอียดเต็มพร้อมไฟล์แนบ', async () => {
  const card = parse(await makeExecutor(fakeHost())('get_card', { number: 1 }));
  assert.equal(card.title, 'แก้บั๊กม้าหาย');
  assert.match(card.body, /หาสาเหตุ/);
  assert.deepEqual(card.attachments, ['log.txt']);
  assert.equal((await makeExecutor(fakeHost())('get_card', { number: 99 })).isError, true);
});

test('create_card: แปลงชื่อคอลัมน์ label และคนเป็น id ก่อนส่ง', async () => {
  const host = fakeHost();
  const r = await makeExecutor(host)('create_card', { title: 'งานใหม่', body: '- [ ] a', column: 'done', labels: ['BUG'], assignees: ['me', 'bank'] });
  assert.equal(r.isError, false);
  assert.equal(parse(r).number, 4);
  assert.deepEqual(host.calls[0], {
    method: 'POST',
    path: '/cards',
    body: { title: 'งานใหม่', body: '- [ ] a', columnId: 'c3', labels: ['l1'], assignees: ['u1', 'u2'] },
  });
});

test('ชื่อที่ไม่พบหรือกำกวม ตอบกลับเป็นข้อผิดพลาดที่บอกตัวเลือกให้ AI แก้เองได้', async () => {
  const run = makeExecutor(fakeHost());
  const missing = await run('create_card', { title: 'x', column: 'Backlog' });
  assert.equal(missing.isError, true);
  assert.match(missing.content, /ไม่พบคอลัมน์ "Backlog".*Todo, In Progress, Done/);
  const ambiguous = await run('update_card', { number: 2, assignees: ['ban'] });
  assert.equal(ambiguous.isError, true);
  assert.match(ambiguous.content, /กำกวม.*Bank.*Bankai/);
  assert.equal((await run('no_such_tool', {})).isError, true);
});

test('update / move / archive / create_label ส่งคำขอถูกเส้นทาง', async () => {
  const host = fakeHost();
  const run = makeExecutor(host);
  assert.equal((await run('update_card', { number: 1, title: 'ชื่อใหม่', labels: [] })).isError, false);
  assert.equal((await run('move_card', { number: 2, column: 'In Progress', position: 'top' })).isError, false);
  assert.equal((await run('move_card', { number: 2, column: 'Done' })).isError, false);
  assert.equal((await run('archive_card', { number: 1 })).isError, false);
  assert.equal((await run('create_label', { name: 'urgent' })).isError, false);
  assert.equal((await run('create_label', { name: 'Bug' })).isError, true, 'label ชื่อซ้ำ');
  assert.equal((await run('update_card', { number: 1 })).isError, true, 'ไม่ได้บอกว่าจะแก้อะไร');
  assert.deepEqual(
    host.calls.map((c) => [c.method, c.path, c.body]),
    [
      ['PATCH', '/cards/k1', { title: 'ชื่อใหม่', labels: [] }],
      ['POST', '/cards/k2/move', { columnId: 'c2', index: 0 }],
      ['POST', '/cards/k2/move', { columnId: 'c3' }],
      ['PATCH', '/cards/k1', { archived: true }],
      ['POST', '/labels', { name: 'urgent', color: '#f76b15' }],
    ]
  );
});

test('การ์ดที่มีคนกำลังแก้อยู่ (423) บอกเหตุผลให้ AI', async () => {
  const r = await makeExecutor(fakeHost())('update_card', { number: 1, title: 'ล็อกอยู่' });
  assert.equal(r.isError, true);
  assert.match(r.content, /มีคนกำลังแก้การ์ดใบนี้อยู่/);
});

test('ปิดสิทธิ์แก้ไข = เครื่องมือแก้บอร์ดไม่ถูกส่งให้ AI และเรียกตรง ๆ ก็ไม่ทำ', async () => {
  const readOnly = toolsFor({ allowEdits: false }).map((t) => t.name);
  assert.deepEqual(readOnly, ['list_cards', 'get_card']);
  assert.equal(toolsFor().length, TOOLS.length);
  const host = fakeHost();
  const r = await makeExecutor(host, { allowEdits: false })('create_card', { title: 'x' });
  assert.equal(r.isError, true);
  assert.equal(host.calls.length, 0);
});

test('ข้อความระบบมีโครงบอร์ด คนที่คุยด้วย และคำสั่งเพิ่มเติมของเจ้าของบอร์ด', () => {
  const text = systemPrompt(fakeBoard(), {
    allowEdits: false,
    instructions: 'ตอบสั้น ๆ',
    now: new Date('2026-09-28T10:00:00Z'),
  });
  assert.match(text, /Board: บอร์ดทดสอบ — ทีมพัฒนา/);
  assert.match(text, /Today: 2026-09-28 \(Monday\)/);
  assert.match(text, /You are talking to: Aom/);
  assert.match(text, /- In Progress \(1 card, WIP limit 3\)/);
  assert.match(text, /Labels: bug, feature/);
  assert.match(text, /Editing is turned off/);
  assert.match(text, /Additional instructions from the board owner:\nตอบสั้น ๆ/);
});

test('คำอธิบายการกระทำสำหรับแสดงในแชท', () => {
  const board = fakeBoard();
  assert.equal(describeCall('move_card', { number: 1, column: 'Done' }, board), 'ย้ายการ์ด #1 “แก้บั๊กม้าหาย” ไปคอลัมน์ Done');
  assert.equal(describeCall('archive_card', { number: 2, archived: false }, board), 'นำการ์ด #2 “ระบบบ้าน” ออกจากคลัง');
  assert.equal(describeCall('list_cards', { column: 'Todo', unassigned: true }), 'ดูรายการการ์ด (คอลัมน์ Todo, ที่ยังไม่มีคนรับ)');
  assert.equal(checklist('- [ ] a\n* [x] b\n1. [X] c'), '2/3');
  assert.equal(checklist('ไม่มีเช็กลิสต์'), null);
});

test('Claude: opus-5 คิดแบบ adaptive และเปิดโมเดลสำรองอัตโนมัติ · Haiku ไม่ส่ง thinking/effort', () => {
  const base = { system: 's', messages: [], tools: TOOLS };
  const opus = claudeParams({ ...base, model: 'claude-opus-5', effort: 'medium' });
  assert.deepEqual(opus.thinking, { type: 'adaptive' });
  assert.deepEqual(opus.output_config, { effort: 'medium' });
  assert.deepEqual(opus.betas, ['server-side-fallback-2026-07-01']);
  assert.equal(opus.fallbacks, 'default');
  assert.equal(opus.max_tokens, 64000);
  assert.deepEqual(opus.cache_control, { type: 'ephemeral' });

  const sonnet = claudeParams({ ...base, model: 'claude-sonnet-5', effort: 'default' });
  assert.deepEqual(sonnet.thinking, { type: 'adaptive' });
  assert.equal(sonnet.output_config, undefined, 'ค่าเริ่มต้น = ไม่ส่ง effort');
  assert.equal(sonnet.fallbacks, undefined);

  const haiku = claudeParams({ ...base, model: 'claude-haiku-4-5', effort: 'high' });
  assert.equal(haiku.thinking, undefined);
  assert.equal(haiku.output_config, undefined);
  assert.equal(haiku.betas, undefined);
});

test('แปลงนิยามเครื่องมือเป็นรูปแบบของ Claude และ OpenAI', () => {
  const claude = toClaudeTools(TOOLS);
  assert.deepEqual(Object.keys(claude[0]), ['name', 'description', 'input_schema']);
  assert.equal(claude[2].input_schema.required[0], 'title');
  const openai = toOpenAITools(TOOLS);
  assert.equal(openai[0].type, 'function');
  assert.deepEqual(Object.keys(openai[0].function), ['name', 'description', 'parameters']);
  for (const t of TOOLS) assert.equal(t.parameters.additionalProperties, false, t.name);
});

test('ข้อความผิดพลาด: ข้อความจาก proxy ของ Tanva และการหยุดกลางคัน', () => {
  const proxy = { status: 400, error: { error: 'แอดมินยังไม่ได้ตั้ง “Anthropic API key (Claude)”', code: 'secret_missing' } };
  assert.deepEqual(explainClaudeError(proxy), { message: proxy.error.error, code: 'secret_missing' });
  assert.equal(explainClaudeError({ aborted: true }).aborted, true);
  assert.equal(explainOpenAIError({ status: 429, error: 'เรียกถี่เกินไป รอสักครู่แล้วลองใหม่' }).message, 'เรียกถี่เกินไป รอสักครู่แล้วลองใหม่');
  assert.equal(explainOpenAIError({ aborted: true }).aborted, true);
  assert.equal(explainClaudeError(new Error('boom')).message, 'boom');
});
