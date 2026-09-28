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
} from '../plugins/redm_blips_location/blips.js';

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
