/**
 * เทสต์ตัวอ่าน blip ของปลั๊กอิน redm_blips_location (ฟังก์ชันล้วน ไม่ต้องมีเบราว์เซอร์)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBlips,
  parseCoords,
  parseSound,
  toMap,
  toGame,
  formatVec,
  blipBlock,
  iconKey,
  safeColor,
  blipContext,
  blipSprite,
  blipImage,
  joaat,
} from '../plugins/redm_blips_location/blips.js';
import { createBlipCompletions, blipEditorMenu } from '../plugins/redm_blips_location/complete.js';
import { createBlipAi } from '../plugins/redm_blips_location/ai.js';
import { BLIP_NAMES } from '../plugins/redm_blips_location/blip-names.js';

test('บล็อก !blip แบบพื้นฐาน (coords + name)', () => {
  const body = ['รายละเอียดร้าน', '', '!blip', ' - coords: vec2(-1745.5, -390.9)', ' - name: ร้านค้า'].join('\n');
  const { blips, problems, blocks } = parseBlips(body, { title: 'การ์ดร้านค้า' });
  assert.equal(problems.length, 0);
  assert.equal(blips.length, 1);
  assert.deepEqual(
    { x: blips[0].x, y: blips[0].y, name: blips[0].name, source: blips[0].source, line: blips[0].line },
    { x: -1745.5, y: -390.9, name: 'ร้านค้า', source: 'blip', line: 2 }
  );
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].blip, blips[0]);
});

test('ข้อมูลของ blip: หน้าที่ ของที่ขาย เสียง NPC เวลา และช่องที่ตั้งชื่อเอง', () => {
  const body = [
    '!blip',
    ' - coords: vec3(-322.25, 803.97, 117.88)',
    ' - name: ร้านค้าวาเลนไทน์',
    ' - icon: shop',
    ' - หน้าที่: ขายของใช้และเสบียง',
    ' - ขาย: ขนมปัง, นม, กระสุน (ปืนพก, ไรเฟิล)',
    ' - sound: [เสียงทักทาย](/uploads/abc.wav), ปิดร้าน.mp3',
    ' - npc: `a_m_m_valgenstoreowner_01`',
    ' - hours: 08:00-20:00',
    ' - ราคาเฉลี่ย: 5$',
    ' - ของหายาก:',
    '   - ยาชูกำลัง',
    '   - นม: ขวดใหญ่',
  ].join('\n');
  const [b] = parseBlips(body).blips;
  assert.equal(b.icon, 'shop');
  assert.equal(b.role, 'ขายของใช้และเสบียง');
  assert.deepEqual(b.sells, ['ขนมปัง', 'นม', 'กระสุน (ปืนพก, ไรเฟิล)'], 'จุลภาคในวงเล็บไม่ถูกตัด');
  assert.deepEqual(b.sounds, [
    { name: 'เสียงทักทาย', url: '/uploads/abc.wav' },
    { name: 'ปิดร้าน.mp3', url: '' },
  ]);
  assert.equal(b.npc, 'a_m_m_valgenstoreowner_01');
  assert.equal(b.hours, '08:00-20:00');
  assert.deepEqual(b.extra, [
    { label: 'ราคาเฉลี่ย', value: '5$' },
    { label: 'ของหายาก', value: ['ยาชูกำลัง', 'นม: ขวดใหญ่'] },
  ]);
});

test('ของที่ขายเขียนเป็นรายการย่อยก็ได้', () => {
  const body = ['!blip', ' - coords: vec2(1, 2)', ' - sells:', '   - ขนมปัง 5$', '   - นม 3$', ' - name: ร้าน'].join('\n');
  const [b] = parseBlips(body).blips;
  assert.deepEqual(b.sells, ['ขนมปัง 5$', 'นม 3$']);
  assert.equal(b.name, 'ร้าน');
});

test('หลาย blip ในการ์ดเดียว พร้อมช่องไม่บังคับ และชื่อ field ภาษาไทย', () => {
  const body = [
    '!blip',
    '- coords: vector4(1, 2, 3, 90)',
    '- name: **คอกม้า**',
    '- icon: บ้าน',
    '- color: red',
    '- radius: 30',
    '- note: เปิดตลอด',
    '!blip แคมป์โจร',
    '- พิกัด: vec3(10.5, -20.25, 5)',
    '- ประเภท: danger',
  ].join('\n');
  const { blips, blocks } = parseBlips(body);
  assert.equal(blips.length, 2);
  assert.equal(blocks.length, 2);
  assert.equal(blips[0].name, 'คอกม้า');
  assert.equal(blips[0].icon, 'house');
  assert.equal(blips[0].color, '#e5484d');
  assert.equal(blips[0].radius, 30);
  assert.equal(blips[0].note, 'เปิดตลอด');
  assert.equal(blips[0].h, 90);
  assert.equal(blips[1].name, 'แคมป์โจร');
  assert.equal(blips[1].icon, 'danger');
  assert.equal(blips[1].z, 5);
});

test('blip ที่ยังไม่ใส่พิกัดถูกแจ้งเป็นปัญหา และยังอยู่ในลำดับบล็อก', () => {
  const { blips, problems, blocks } = parseBlips(
    '!blip\n - coords: vec2()\n - name: ร้านค้า\n\n!blip\n - name: ไม่มีพิกัด\n\n!blip\n - coords: vec2(1,2)'
  );
  assert.equal(blips.length, 1);
  assert.equal(problems.length, 2);
  assert.match(problems[0].message, /อ่านพิกัด/);
  assert.match(problems[1].message, /ยังไม่ได้ใส่พิกัด/);
  assert.deepEqual(
    blocks.map((b) => (b.blip ? 'blip' : 'problem')),
    ['problem', 'problem', 'blip']
  );
});

test('ดึงพิกัดที่พิมพ์ไว้เฉย ๆ อัตโนมัติ ใช้หัวข้อแม่ของรายการเป็นชื่อ และแยกลำดับจุดที่ชื่อซ้ำ', () => {
  const body = [
    '* **ร้านขายของปลูกผัก** NPC : a_m_m_farmhand',
    '    * `vector4(-1745.5693, -390.9870, 156.6194, 122.1778)`',
    '    * `vector4(-372.8898, 722.8582, 116.3867, 329.1141)`',
    '* จุดตกปลา vec3(100, 200, 30)',
  ].join('\n');
  const { blips } = parseBlips(body, { title: 'ตำแหน่ง NPC' });
  assert.equal(blips.length, 3);
  assert.equal(blips[0].name, 'ร้านขายของปลูกผัก NPC : a_m_m_farmhand · จุดที่ 1');
  assert.equal(blips[1].name, 'ร้านขายของปลูกผัก NPC : a_m_m_farmhand · จุดที่ 2');
  assert.equal(blips[2].name, 'จุดตกปลา');
  assert.ok(blips.every((b) => b.source === 'auto'));
  assert.equal(parseBlips(body, { autoDetect: false }).blips.length, 0, 'ปิดดึงอัตโนมัติ = ไม่เอา');
});

test('พิกัดในบล็อกโค้ดและใน !blip ไม่ถูกนับซ้ำ', () => {
  const body = ['```lua', 'local p = vector3(1, 2, 3)', '```', '!blip', ' - coords: vec2(5, 6)', ' - name: A'].join('\n');
  const { blips } = parseBlips(body);
  assert.equal(blips.length, 1);
  assert.equal(blips[0].name, 'A');
});

test('แปลงพิกัดเกม <-> แผนที่ กลับไปกลับมาได้ตรง', () => {
  const at = toMap({ x: -1745.5, y: -390.9 });
  assert.ok(Math.abs(at[0] - (0.01552 * -390.9 - 63.6)) < 1e-9);
  assert.ok(Math.abs(at[1] - (0.01552 * -1745.5 + 111.29)) < 1e-9);
  const back = toGame({ lat: at[0], lng: at[1] });
  assert.ok(Math.abs(back.x + 1745.5) < 1e-6 && Math.abs(back.y + 390.9) < 1e-6);
});

test('อ่าน/เขียนพิกัดและบล็อกหลายรูปแบบ', () => {
  assert.deepEqual(parseCoords('vec3(1.5, -2, 3)'), { x: 1.5, y: -2, z: 3, kind: 'vec3' });
  assert.deepEqual(parseCoords('vector2(10 20)'), { x: 10, y: 20, kind: 'vec2' });
  assert.deepEqual(parseCoords('100, 200'), { x: 100, y: 200, kind: 'vec2' });
  assert.equal(parseCoords('vec2()'), null);
  assert.equal(formatVec({ x: 1.234, y: -5.678, z: 9 }), 'vec3(1.23, -5.68, 9)');
  assert.equal(
    blipBlock({ x: 1, y: 2, name: 'ร้านค้า', icon: 'shop', role: 'ขายของ', sells: 'ขนมปัง, นม', sound: 'ทักทาย.wav' }),
    '!blip\n - coords: vec2(1, 2)\n - name: ร้านค้า\n - icon: shop\n - role: ขายของ\n - sells: ขนมปัง, นม\n - sound: ทักทาย.wav'
  );
  assert.deepEqual(parseSound('https://cdn.test/a%20b.mp3'), { name: 'a b.mp3', url: 'https://cdn.test/a%20b.mp3' });
  assert.equal(iconKey('ร้าน'), 'shop');
  assert.equal(iconKey('อะไรก็ไม่รู้'), 'pin');
  assert.equal(safeColor('#ABC'), '#aabbcc');
  assert.equal(safeColor('javascript:alert(1)'), null);
});

/* ---------------- คำแนะนำตอนพิมพ์ (IntelliSense) ---------------- */

/** ตำแหน่งเคอร์เซอร์ = ตรงที่มี | ในข้อความ */
const at = (s) => ({ text: s.replace('|', ''), offset: s.indexOf('|') });

const fakeHost = (cards = []) => ({
  settings: () => ({ autoDetect: true }),
  board: () => ({ cards }),
});
const PATHS = { pin: 'P', shop: 'S', npc: 'N', house: 'H', camp: 'C', quest: 'Q', danger: 'D', info: 'I' };
const suggest = (s, { card = null, cards = [], trigger = 'typing' } = {}) => {
  const { text, offset } = at(s);
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
  let lineEnd = text.indexOf('\n', offset);
  if (lineEnd === -1) lineEnd = text.length;
  return createBlipCompletions(fakeHost(cards), { iconPaths: PATHS, iconLabels: { shop: 'ร้านค้า' } }).provide({
    text,
    offset,
    lineStart,
    line: text.slice(lineStart, lineEnd),
    before: text.slice(lineStart, offset),
    after: text.slice(offset, lineEnd),
    card,
    trigger,
  });
};

test('บริบท: พิมพ์ ! ต้นบรรทัด = เลือกแม่แบบ !blip', () => {
  const { text, offset } = at('รายละเอียด\n!bl|');
  assert.deepEqual(blipContext(text, offset), { kind: 'command', from: text.indexOf('!'), to: text.length });
  assert.equal(blipContext(...Object.values(at('- !b|'))).kind, 'command', 'หลังขีดของรายการก็ได้');
  assert.equal(blipContext(...Object.values(at('ราคา 5!|'))), null, '! กลางประโยคไม่นับ');

  const res = suggest('ร้าน\n!|');
  assert.equal(res.items[0].label, '!blip');
  assert.match(res.items[0].insert, /^!blip\n - coords: vec3\(\$\{1:x\}, \$\{2:y\}, \$\{3:z\}\)\n - name: \$\{4:ชื่อจุด\}\$0$/);
  assert.ok(res.items.some((i) => i.label === '!blip ร้านค้า' && i.insert.includes(' - icon: shop')));
  assert.ok(res.items.every((i) => i.doc.includes('```')), 'มีตัวอย่างในคำอธิบาย');
});

test('บริบท: ช่องที่ยังไม่ได้ใส่ในบล็อก (ไม่นับช่องที่มีแล้ว)', () => {
  const s = '!blip\n - coords: vec3(1, 2, 3)\n - |\n - icon: shop';
  const c = blipContext(...Object.values(at(s)));
  assert.equal(c.kind, 'field');
  assert.equal(c.bullet, true);
  assert.deepEqual([...c.used].sort(), ['coords', 'icon']);

  const res = suggest(s, { card: { title: 'ร้านปืน' } });
  const labels = res.items.map((i) => i.label);
  assert.ok(!labels.includes('coords') && !labels.includes('icon'));
  assert.equal(labels[0], 'name');
  assert.equal(res.items[0].insert, 'name: ');
  assert.equal(res.items[0].retrigger, true, 'มีชื่อการ์ดให้เลือกต่อ');
  assert.equal(res.items.find((i) => i.label === 'color').retrigger, true);
  assert.equal(res.items.find((i) => i.label === 'note').retrigger, false);
});

test('บริบท: บรรทัดว่างใต้ !blip เติมขีดนำให้ และพิมพ์ชื่อไทยได้', () => {
  const res = suggest('!blip\n|');
  assert.equal(res.items[0].label, 'coords');
  assert.equal(res.items[0].insert, ' - coords: ');
  assert.equal(res.items[0].detail, 'พิกัด · จำเป็น');

  const thai = suggest('!blip\n - พิ|');
  const coords = thai.items.find((i) => i.filter.split(' ').includes('coords'));
  assert.equal(coords.label, 'พิกัด');
  assert.equal(coords.insert, 'พิกัด: ');
});

test('บริบท: ค่าของช่อง — ไอคอน สี พิกัดจากจุดอื่นในบอร์ด ไฟล์เสียงในการ์ด', () => {
  const icon = blipContext(...Object.values(at('!blip\n - icon: sh|op')));
  assert.equal(icon.kind, 'value');
  assert.equal(icon.key, 'icon');
  assert.equal(icon.value, 'sh');
  const icons = suggest('!blip\n - icon: |');
  assert.equal(icons.items.length, 8 + BLIP_NAMES.length, 'แบบสั้น 8 แบบ + รูป blip ของเกมทั้งหมด');
  assert.deepEqual(icons.items.find((i) => i.label === 'shop'), {
    label: 'shop',
    detail: 'ร้านค้า',
    image: blipImage('blip_shop_store'),
    filter: 'shop shop store ร้าน ร้านค้า blip_shop_store',
    doc: 'ไอคอน **ร้านค้า** — ใช้รูป `blip_shop_store` ของเกม\n\nพิมพ์แบบนี้ก็ได้: `shop` `store` `ร้าน` `ร้านค้า`',
    insert: 'shop',
  });
  const gunsmith = icons.items.find((i) => i.label === 'blip_shop_gunsmith');
  assert.equal(gunsmith.insert, 'blip_shop_gunsmith');
  assert.match(gunsmith.image, /^https:\/\/cdn\.jsdelivr\.net\/gh\/.+\/blips\/images\/blip_shop_gunsmith\.png$/);
  assert.match(gunsmith.filter, /ปืน/, 'ค้นเป็นภาษาไทยได้');
  assert.match(gunsmith.doc, new RegExp(`\`${joaat('blip_shop_gunsmith')}\``), 'บอก hash ไว้ใช้ในสคริปต์');

  const colors = suggest('!blip\n - สี: |');
  assert.equal(colors.items.find((i) => i.label === 'red').color, '#e5484d');
  assert.match(colors.items.find((i) => i.label === 'red').filter, /แดง/);

  const cards = [
    { id: 'a', number: 3, title: 'ร้านค้า', body: '!blip\n - coords: vec3(-322.25, 803.97, 117.88)\n - name: ร้านค้า Valentine\n - icon: shop\n - sells: ขนมปัง, นม' },
  ];
  const coords = suggest('!blip\n - coords: |', { cards });
  assert.equal(coords.items[0].label, 'vec3(x, y, z)');
  const other = coords.items.find((i) => i.label === 'vec3(-322.25, 803.97, 117.88)');
  assert.equal(other.detail, 'ร้านค้า Valentine');
  assert.equal(other.icon, 'S');
  assert.equal(suggest('!blip\n - coords: vec3(1, 2, 3)|', { cards }), null, 'พิมพ์พิกัดครบแล้วไม่เด้งเอง');
  assert.ok(suggest('!blip\n - coords: vec3(1, 2, 3)|', { cards, trigger: 'explicit' }), 'กด Ctrl+Space ยังขอดูได้');

  const card = { title: 'NPC', attachments: [{ name: 'ทักทาย.wav', mime: 'audio/wav' }, { name: 'รูป.png', mime: 'image/png' }] };
  const sound = suggest('!blip\n - sound: |', { card });
  assert.deepEqual(sound.items.map((i) => i.insert), ['ทักทาย.wav']);
  assert.match(suggest('!blip\n - sound: |', { card: { title: 'x' } }).items[0].insert, /^\[\$\{1:/, 'ไม่มีไฟล์เสียง = แนะนำลิงก์');
});

test('บริบท: ช่องแบบรายการ (sells) แนะนำทีละชิ้น ทั้งแบบคั่นจุลภาคและรายการย่อย', () => {
  const inline = at('!blip\n - sells: ขนมปัง, น|, ชีส');
  const c = blipContext(inline.text, inline.offset);
  assert.equal(c.key, 'sells');
  assert.equal(c.value, 'น');
  assert.equal(inline.text.slice(c.from, c.to), 'น');

  const sub = at('!blip\n - sells:\n   - ขน|');
  const s = blipContext(sub.text, sub.offset);
  assert.equal(s.kind, 'value');
  assert.equal(s.item, true);
  assert.equal(sub.text.slice(s.from, s.to), 'ขน');

  const cards = [{ id: 'a', number: 1, title: 'ร้าน', body: '!blip\n - coords: vec2(1, 2)\n - sells: ขนมปัง, นม, ชีส' }];
  const res = suggest('!blip\n - sells: นม, |', { cards });
  assert.deepEqual(res.items.map((i) => i.label), ['ขนมปัง', 'ชีส'], 'ของที่ใส่แล้วไม่แนะนำซ้ำ');
});

test('บริบท: ไม่เกี่ยวกับ !blip = ไม่แนะนำอะไร', () => {
  assert.equal(suggest('สวัสดี|'), null);
  assert.equal(suggest('- งานที่ต้องทำ|'), null);
  assert.equal(suggest('```\n!bl|\n```'), null, 'ในบล็อกโค้ดไม่นับ');
  assert.equal(suggest('!blip\n - ราคา: 5|'), null, 'ช่องที่ตั้งชื่อเองไม่มีคำแนะนำ');
  assert.equal(suggest('!blip\n - co|ords: vec3(1, 2)'), null, 'ไม่แนะนำชื่อช่องทับช่องที่มีอยู่แล้ว');
  assert.equal(suggest('!blip\n - coords: vec2(1, 2)\n\n|'), null, 'บรรทัดว่างจบบล็อกแล้ว');
  assert.equal(suggest('!blip\n - note:\n   - |'), null, 'รายการย่อยของช่องที่ไม่ใช่รายการ');
});

/* ---------------- รูป blip ของเกม (ชุดเดียวกับ redlookup.com/blips) ---------------- */

test('รูป blip: รับชื่อรูปของเกม ชื่อไม่มี blip_ นำหน้า hash และไอคอนแบบสั้นเดิม', () => {
  assert.equal(BLIP_NAMES.length, 586);
  assert.equal(new Set(BLIP_NAMES).size, BLIP_NAMES.length, 'ไม่มีชื่อซ้ำ');
  assert.equal(joaat('blip_shop_store'), 1475879922, 'hash แบบเดียวกับเกม');
  assert.equal(joaat('blip_ambient_bounty_hunter'), -861219276);

  assert.equal(blipSprite('blip_shop_gunsmith'), 'blip_shop_gunsmith');
  assert.equal(blipSprite('BLIP_SHOP_GUNSMITH'), 'blip_shop_gunsmith');
  assert.equal(blipSprite('shop_gunsmith'), 'blip_shop_gunsmith');
  assert.equal(blipSprite('1475879922'), 'blip_shop_store');
  assert.equal(blipSprite('-861219276'), 'blip_ambient_bounty_hunter', 'hash มีเครื่องหมาย');
  assert.equal(blipSprite('3433748020'), 'blip_ambient_bounty_hunter', 'hash ไม่มีเครื่องหมาย');
  assert.equal(blipSprite('0x57F823F2'), 'blip_shop_store', 'hash แบบ hex');
  assert.equal(blipSprite('shop'), 'blip_shop_store', 'ไอคอนแบบสั้นเดิมใช้รูปของเกมที่ใกล้เคียง');
  assert.equal(blipSprite('ร้าน'), 'blip_shop_store');
  assert.equal(blipSprite('danger'), 'blip_attention');
  assert.equal(blipSprite(''), 'blip_poi');
  assert.equal(blipSprite('ไม่มีอยู่จริง'), 'blip_poi');
  assert.equal(blipSprite('99999999999'), 'blip_poi', 'ตัวเลขเกิน 32 บิต');

  const { blips } = parseBlips('!blip\n - coords: vec2(1, 2)\n - icon: blip_shop_doctor\n\nจุดอื่น vec3(3, 4, 5)');
  assert.deepEqual(
    blips.map((b) => [b.sprite, b.source]),
    [
      ['blip_shop_doctor', 'blip'],
      ['blip_poi', 'auto'],
    ]
  );
  assert.equal(
    blipImage('blip_poi'),
    'https://cdn.jsdelivr.net/gh/BryceCanyonCounty/rdr3-nativedb-data@0297f047a82c244866dc5936e6abd6d6a6d3c869/blips/images/blip_poi.png'
  );
});

test('เมนูคลิกขวา: แทรก !blip จากแม่แบบ (เป็นย่อหน้าของตัวเอง)', () => {
  const [menu] = blipEditorMenu({ card: { attachments: [{ name: 'ทักทาย.wav', mime: 'audio/wav' }] } }, { iconPaths: { pin: 'P' } });
  assert.equal(menu.label, 'แทรก !blip');
  assert.equal(menu.icon, 'P');
  assert.deepEqual(
    menu.items.map((i) => i.label),
    ['!blip', '!blip ร้านค้า', '!blip NPC', '!blip จุดอันตราย', '!blip ครบทุกช่อง']
  );
  assert.ok(menu.items.every((i) => i.block === true && i.insert.startsWith('!blip\n')));
  assert.match(menu.items[2].insert, /sound: \$\{8:ทักทาย\.wav\}/, 'ใส่ไฟล์เสียงที่แนบไว้ให้เป็นค่าตั้งต้น');
});

test('ให้ผู้ช่วย AI ใช้: คู่มือ !blip + list_blips + add_blip (แก้การ์ดผ่าน host)', async () => {
  const updates = [];
  const cards = [
    { id: 'c1', number: 1, title: 'ร้านค้า', body: '!blip\n - coords: vec3(-322.25, 803.97, 117.88)\n - name: ร้านค้า Valentine\n - icon: shop\n - sells: ขนมปัง, นม' },
    { id: 'c2', number: 2, title: 'ว่าง', body: 'ยังไม่มีอะไร' },
  ];
  const host = {
    board: () => ({ cards }),
    settings: () => ({ autoDetect: true }),
    updateCard: async (id, patch) => {
      updates.push({ id, patch });
      return { id, ...patch };
    },
  };
  const ai = createBlipAi(host);
  assert.match(ai.guide, /!blip/);
  assert.match(ai.guide, /blip_shop_store/);
  assert.deepEqual(
    ai.tools.map((t) => [t.name, Boolean(t.write)]),
    [
      ['list_blips', false],
      ['add_blip', true],
    ]
  );

  const list = await ai.tools[0].run({ query: 'นม' });
  assert.equal(list.total, 1);
  assert.deepEqual(list.blips[0], {
    name: 'ร้านค้า Valentine',
    coords: 'vec3(-322.25, 803.97, 117.88)',
    icon: 'blip_shop_store',
    card: 1,
    cardTitle: 'ร้านค้า',
    sells: ['ขนมปัง', 'นม'],
  });
  assert.equal((await ai.tools[0].run({ card: 2 })).total, 0);

  const add = ai.tools[1];
  assert.equal(add.describe({ card: 2, name: 'ร้านปืน' }), 'เพิ่ม blip “ร้านปืน” ลงการ์ด #2');
  const res = await add.run({ card: 2, x: -281, y: 780.7, z: 119.5, name: 'ร้านปืน', icon: 'blip_shop_gunsmith', sells: ['ปืน', 'กระสุน'] });
  assert.equal(res.ok, true);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].id, 'c2');
  assert.equal(
    updates[0].patch.body,
    'ยังไม่มีอะไร\n\n!blip\n - coords: vec3(-281, 780.7, 119.5)\n - name: ร้านปืน\n - icon: blip_shop_gunsmith\n - sells: ปืน, กระสุน\n'
  );
  const parsed = parseBlips(updates[0].patch.body).blips[0];
  assert.equal(parsed.sprite, 'blip_shop_gunsmith', 'บล็อกที่ AI เพิ่มอ่านกลับได้ถูกต้อง');
  await assert.rejects(() => add.run({ card: 99, x: 1, y: 2, name: 'x' }), /ไม่พบการ์ด #99/);
  await assert.rejects(() => add.run({ card: 1, x: 'abc', y: 2, name: 'x' }), /x และ y/);
});
