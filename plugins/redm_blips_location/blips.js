/**
 * อ่านพิกัด blip จากเนื้อหาการ์ด + แปลงพิกัดในเกม RDR2/RedM <-> พิกัดบนแผนที่
 *
 * รูปแบบที่ใส่ในการ์ด (หนึ่งการ์ดมีได้หลาย blip):
 *
 *   !blip
 *    - coords: vec3(-1745.56, -390.98, 156.61)
 *    - name: ร้านค้า
 *    - icon: shop            (shop npc house camp quest danger info pin)
 *    - role: ขายของใช้ทั่วไป   (หน้าที่ของจุดนี้)
 *    - sells: ขนมปัง, นม, ชีส  (หรือเขียนเป็นรายการย่อยด้านล่างก็ได้)
 *    - sound: [เสียงทักทาย](/uploads/xxx.wav)   (หรือชื่อไฟล์เสียงที่แนบในการ์ด)
 *    - npc: a_m_m_valgenstoreowner_01
 *    - hours: 08:00-20:00
 *    - color: #e5484d   radius: 25   note: ...
 *    - ช่องอื่น ๆ ตั้งชื่อเองได้ เช่น  - ราคา: 5$  (จะขึ้นในกล่องรายละเอียดด้วย)
 *
 * ถ้าเปิด "ดึงอัตโนมัติ" พิกัด vec2/vec3/vec4 (หรือ vector2/3/4) ที่พิมพ์ไว้ตรงไหนก็ได้ในการ์ดจะถูกปักหมุดด้วย
 * โดยใช้ข้อความในบรรทัดนั้น (หรือหัวข้อแม่ของรายการ) เป็นชื่อ
 */

import { BLIP_NAMES, BLIP_IMAGE_BASE } from './blip-names.js';

/* ---------------- พิกัด ---------------- */

// ค่าแปลงเดียวกับแผนที่ของชุมชน RDR2 (RDOMap / RDR2CollectorsMap) — แผนที่แบบ Leaflet CRS.Simple
const SCALE = 0.01552;
const LAT_OFFSET = -63.6;
const LNG_OFFSET = 111.29;

/** พิกัดในเกม (x, y) -> [lat, lng] บนแผนที่ */
export function toMap({ x, y }) {
  return [SCALE * y + LAT_OFFSET, SCALE * x + LNG_OFFSET];
}

/** [lat, lng] บนแผนที่ -> พิกัดในเกม */
export function toGame({ lat, lng }) {
  return { x: (lng - LNG_OFFSET) / SCALE, y: (lat - LAT_OFFSET) / SCALE };
}

/** หน่วยระยะในเกม -> หน่วยบนแผนที่ (ใช้กับวงรัศมี) */
export const toMapDistance = (d) => d * SCALE;

export const MAP_BOUNDS = [
  [-144, 0],
  [0, 176],
];

const round = (n) => Math.round(n * 100) / 100;
const NUM = /-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi;
const VEC = /\b(?:vector|vec)([234])\s*\(([^()]*)\)/gi;

/** "vec3(1, 2, 3)" / "vector4(…)" / "1.5, -2" -> { x, y, z?, h?, kind } หรือ null ถ้าตัวเลขไม่ถึง 2 ค่า */
export function parseCoords(text) {
  const src = String(text ?? '');
  VEC.lastIndex = 0;
  const vec = VEC.exec(src);
  const numbers = (vec ? vec[2] : src).match(NUM)?.map(Number).filter(Number.isFinite) || [];
  if (numbers.length < 2) return null;
  const [x, y, z, h] = numbers;
  const out = { x, y, kind: vec ? `vec${vec[1]}` : `vec${Math.min(numbers.length, 4)}` };
  if (z !== undefined && (vec ? Number(vec[1]) >= 3 : true)) out.z = z;
  if (h !== undefined && (vec ? Number(vec[1]) >= 4 : true)) out.h = h;
  return out;
}

/** เขียนพิกัดกลับเป็นข้อความ เช่น vec3(-1745.56, -390.98, 156.61) */
export function formatVec(p) {
  const parts = [p.x, p.y];
  if (p.z !== undefined) parts.push(p.z);
  if (p.h !== undefined) parts.push(p.h);
  return `vec${parts.length}(${parts.map((n) => round(n)).join(', ')})`;
}

/* ---------------- ไอคอน / สี ---------------- */

export const ICON_KEYS = ['pin', 'shop', 'npc', 'house', 'camp', 'quest', 'danger', 'info'];

export const ICON_ALIASES = {
  shop: ['shop', 'store', 'ร้าน', 'ร้านค้า'],
  npc: ['npc', 'person', 'people', 'คน'],
  house: ['house', 'home', 'บ้าน'],
  camp: ['camp', 'fire', 'แคมป์'],
  quest: ['quest', 'mission', 'star', 'ภารกิจ', 'เควส'],
  danger: ['danger', 'alert', 'warning', 'อันตราย'],
  info: ['info', 'note', 'ข้อมูล'],
  pin: ['pin', 'point', 'default', 'จุด'],
};

export function iconKey(value) {
  const v = String(value ?? '').trim().toLowerCase();
  if (!v) return 'pin';
  for (const [key, names] of Object.entries(ICON_ALIASES)) if (names.includes(v)) return key;
  return 'pin';
}

/* ---------------- รูป blip ของเกม (ชุดเดียวกับ redlookup.com/blips) ---------------- */

/** ไอคอนแบบสั้นเดิม → รูป blip ของเกมที่ใกล้เคียงที่สุด */
export const SHORT_SPRITES = {
  pin: 'blip_poi',
  shop: 'blip_shop_store',
  npc: 'blip_ambient_npc',
  house: 'blip_proc_home',
  camp: 'blip_camp',
  quest: 'blip_objective',
  danger: 'blip_attention',
  info: 'blip_ambient_newspaper',
};

export const BLIP_NAME_SET = new Set(BLIP_NAMES);

/** hash ของชื่อแบบที่เกมใช้ (joaat) เป็นเลขมีเครื่องหมาย 32 บิต เช่น blip_shop_store → 1475879922 */
export function joaat(name) {
  let h = 0;
  for (const ch of String(name).toLowerCase()) {
    h = (h + ch.charCodeAt(0)) >>> 0;
    h = (h + (h << 10)) >>> 0;
    h = (h ^ (h >>> 6)) >>> 0;
  }
  h = (h + (h << 3)) >>> 0;
  h = (h ^ (h >>> 11)) >>> 0;
  h = (h + (h << 15)) >>> 0;
  return h | 0;
}

let hashIndex = null;
const byHash = () => (hashIndex ||= new Map(BLIP_NAMES.map((n) => [joaat(n), n])));

/** "1475879922" / "-861219276" / "3433748020" / "0x57F823F2" → hash แบบมีเครื่องหมาย หรือ null */
function parseHash(v) {
  if (/^0x[0-9a-f]{1,8}$/i.test(v)) return parseInt(v, 16) | 0;
  if (/^-?\d{1,10}$/.test(v)) {
    const n = Number(v);
    if (n >= -2147483648 && n <= 4294967295) return n | 0;
  }
  return null;
}

/**
 * ค่าในช่อง icon → ชื่อรูป blip ของเกม
 * รับได้ทั้ง blip_shop_store / shop_store (ไม่มี blip_ นำหน้า) / hash จากเกม / ไอคอนแบบสั้นเดิม (shop, npc, ร้าน …)
 */
export function blipSprite(value) {
  const v = String(value ?? '').trim().toLowerCase();
  if (!v) return SHORT_SPRITES.pin;
  if (BLIP_NAME_SET.has(v)) return v;
  if (BLIP_NAME_SET.has(`blip_${v}`)) return `blip_${v}`;
  const hash = parseHash(v);
  if (hash !== null) return byHash().get(hash) || SHORT_SPRITES.pin;
  return SHORT_SPRITES[iconKey(v)];
}

export const blipImage = (sprite) => `${BLIP_IMAGE_BASE}${sprite}.png`;

export const NAMED_COLORS = {
  red: '#e5484d',
  orange: '#f76b15',
  yellow: '#ffc53d',
  green: '#30a46c',
  blue: '#3e63dd',
  purple: '#8e4ec6',
  pink: '#d6409f',
  white: '#fafafa',
  gray: '#8b8d98',
  grey: '#8b8d98',
  black: '#111111',
};

export function safeColor(value) {
  const v = String(value ?? '').trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${[...v.slice(1)].map((c) => c + c).join('')}`;
  return NAMED_COLORS[v] || null;
}

/* ---------------- อ่าน blip จากการ์ด ---------------- */

export const FIELD_ALIASES = {
  coords: ['coords', 'coord', 'coordinates', 'pos', 'position', 'location', 'loc', 'พิกัด', 'ตำแหน่ง'],
  name: ['name', 'title', 'label', 'ชื่อ'],
  icon: ['icon', 'type', 'sprite', 'ไอคอน', 'ประเภท'],
  color: ['color', 'colour', 'สี'],
  radius: ['radius', 'range', 'รัศมี'],
  note: ['note', 'notes', 'desc', 'description', 'หมายเหตุ', 'รายละเอียด'],
  role: ['role', 'purpose', 'function', 'job', 'หน้าที่', 'บทบาท'],
  sells: ['sells', 'sell', 'shop', 'items', 'goods', 'ขาย', 'สินค้า', 'ของขาย'],
  sound: ['sound', 'sounds', 'audio', 'voice', 'เสียง'],
  npc: ['npc', 'ped', 'model', 'โมเดล'],
  hours: ['hours', 'open', 'time', 'เวลา', 'เวลาเปิด'],
};

/** ช่องที่เก็บได้หลายค่า (คั่นด้วย , หรือเขียนเป็นรายการย่อย) */
export const LIST_FIELDS = new Set(['sells', 'sound']);

export const FIELD_LABELS = {
  role: 'หน้าที่',
  sells: 'ขาย',
  sound: 'เสียง',
  npc: 'NPC',
  hours: 'เวลา',
  note: 'หมายเหตุ',
};

export function fieldKey(raw) {
  const k = String(raw).trim().toLowerCase();
  for (const [key, names] of Object.entries(FIELD_ALIASES)) if (names.includes(k)) return key;
  return null;
}

/** ตัดสัญลักษณ์ markdown ออก เหลือข้อความล้วนไว้ตั้งชื่อ */
export function cleanText(text) {
  return String(text ?? '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s*(?:>\s*)*/, '')
    .replace(/^\s*(?:#{1,6}\s+|[-*+]\s+|\d{1,9}[.)]\s+)/, '')
    .replace(/^\[[ xX]?\]\s*/, '')
    .replace(/`+|~~|\*+/g, '')
    // _ตัวเอียง_ เอาออก แต่ชื่อแบบ a_m_m_farmhand_01 ต้องอยู่ครบ
    .replace(/(^|[\s(])_+(?=\S)/g, '$1')
    .replace(/(\S)_+(?=[\s).,!?:;]|$)/g, '$1')
    .replace(/\s+/g, ' ')
    .replace(/^[\s:：\-–—|,·]+|[\s:：\-–—|,·]+$/g, '')
    .trim();
}

/** "a, b、c" -> ['a', 'b', 'c'] (ไม่ตัดจุลภาคที่อยู่ในวงเล็บ/ลิงก์) */
function splitList(text) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of String(text)) {
    if ('([{'.includes(ch)) depth++;
    if (')]}'.includes(ch)) depth = Math.max(0, depth - 1);
    if (depth === 0 && ',，、;'.includes(ch)) {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** อ้างถึงไฟล์เสียง: [ชื่อ](url) / url / ชื่อไฟล์ที่แนบในการ์ด */
export function parseSound(text) {
  const src = String(text ?? '').trim();
  const md = src.match(/\[([^\]]+)\]\(([^)\s]+)\)/);
  if (md) return { name: cleanText(md[1]) || md[2].split('/').pop(), url: md[2] };
  const url = src.match(/https?:\/\/\S+|\/uploads\/\S+/);
  if (url) return { name: cleanText(src.replace(url[0], '')) || decodeURIComponent(url[0].split('/').pop()), url: url[0] };
  return { name: cleanText(src), url: '' };
}

const indentOf = (line) => line.match(/^\s*/)[0].replace(/\t/g, '  ').length;
const FENCE_OPEN = /^\s*```+\s*[\w-]*\s*$/;
const FENCE_ANY = /^\s*```/;
const BLIP_START = /^\s*(?:[-*+]\s+)?!blip\b[:\s]*(.*)$/i;
const FIELD_LINE = /^\s*(?:[-*+]\s+)?([A-Za-z฀-๿_][A-Za-z0-9฀-๿_ ]{0,29}?)\s*[:=：]\s*(.*)$/;
const ITEM_LINE = /^\s*(?:[-*+]|\d{1,9}[.)])\s+(.*)$/;

/** ชื่อของพิกัดที่ดึงอัตโนมัติ: ข้อความในบรรทัดนั้น ถ้าไม่มีใช้หัวข้อแม่ของรายการ */
function autoName(lines, i, rest) {
  const own = cleanText(rest);
  if (own.length >= 2) return own.slice(0, 80);
  const indent = indentOf(lines[i]);
  for (let k = i - 1; k >= 0 && i - k <= 40; k--) {
    const line = lines[k];
    if (!line.trim()) continue;
    if (indentOf(line) < indent || (indent === 0 && !/^\s*(?:[-*+]|\d{1,9}[.)])\s/.test(lines[i]))) {
      VEC.lastIndex = 0;
      const text = cleanText(line.replace(VEC, ''));
      if (text.length >= 2) return text.slice(0, 80);
      if (indentOf(line) === 0) break;
    }
  }
  return '';
}

/** อ่านช่องทั้งหมดของบล็อก !blip ที่เริ่มบรรทัด i — คืน { fields, extra, end } */
function readBlock(lines, i) {
  const fields = {};
  const extra = [];
  let current = null; // ช่องล่าสุด (ไว้รับรายการย่อย)
  let j = i + 1;
  for (; j < lines.length; j++) {
    const line = lines[j];
    if (!line.trim() || BLIP_START.test(line)) break;
    const indent = indentOf(line);
    // รายการย่อยใต้ช่องที่ไม่มีค่า เช่น  - ขาย:\n   - ขนมปัง
    if (current && indent > current.indent && ITEM_LINE.test(line)) {
      current.items.push(line.match(ITEM_LINE)[1].trim());
      continue;
    }
    const f = line.match(FIELD_LINE);
    if (!f) break;
    const label = f[1].trim();
    const key = fieldKey(label);
    current = { key, label, indent, value: f[2].trim(), items: [] };
    if (key) fields[key] = current;
    else extra.push(current);
  }
  return { fields, extra, end: j };
}

const valueOf = (f) => (f ? (f.items.length ? f.items.join(', ') : f.value) : '');
const listOf = (f) => (f ? (f.items.length ? f.items : splitList(f.value)) : []);

/**
 * อ่าน blip ทั้งหมดจากเนื้อหาการ์ด
 * คืน {
 *   blips: [{ x, y, z?, h?, kind, name, icon, color, radius, note, role, sells[], sounds[], npc, hours, extra[], line, source }],
 *   problems: [{ line, name, message }],
 *   blocks: บล็อก !blip เรียงตามลำดับในการ์ด [{ line, blip } | { line, problem }]
 * }
 */
export function parseBlips(body, { title = '', autoDetect = true } = {}) {
  const lines = String(body ?? '').replace(/\r\n?/g, '\n').split('\n');
  const blips = [];
  const problems = [];
  const blocks = [];
  const used = new Set();
  let fence = false;

  // 1) บล็อก !blip ที่เขียนไว้ชัดเจน
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (fence) {
      if (FENCE_ANY.test(line)) fence = false;
      continue;
    }
    if (FENCE_OPEN.test(line)) {
      fence = true;
      continue;
    }
    const start = line.match(BLIP_START);
    if (!start) continue;

    const { fields, extra, end } = readBlock(lines, i);
    for (let k = i; k < end; k++) used.add(k);

    const name = cleanText(valueOf(fields.name) || start[1]) || cleanText(title) || 'Blip';
    const coordsText = valueOf(fields.coords);
    const pos = parseCoords(coordsText);
    if (!pos) {
      const problem = {
        line: i,
        name,
        message: coordsText ? `อ่านพิกัด "${coordsText}" ไม่ออก` : 'ยังไม่ได้ใส่พิกัด (coords)',
      };
      problems.push(problem);
      blocks.push({ line: i, problem });
    } else {
      const radius = Number(valueOf(fields.radius));
      const blip = {
        ...pos,
        name: name.slice(0, 80),
        icon: iconKey(valueOf(fields.icon)),
        sprite: blipSprite(valueOf(fields.icon)),
        color: safeColor(valueOf(fields.color)),
        radius: Number.isFinite(radius) && radius > 0 ? Math.min(radius, 5000) : null,
        note: valueOf(fields.note).slice(0, 500),
        role: valueOf(fields.role).slice(0, 300),
        sells: listOf(fields.sells).slice(0, 50).map((s) => s.slice(0, 120)),
        sounds: listOf(fields.sound).slice(0, 10).map(parseSound).filter((s) => s.name || s.url),
        npc: cleanText(valueOf(fields.npc)).slice(0, 80),
        hours: valueOf(fields.hours).slice(0, 80),
        extra: extra
          .slice(0, 20)
          .map((f) => ({ label: f.label.slice(0, 30), value: f.items.length ? f.items.slice(0, 30) : f.value.slice(0, 300) })),
        line: i,
        source: 'blip',
      };
      blips.push(blip);
      blocks.push({ line: i, blip });
    }
    i = end - 1;
  }

  // 2) พิกัดที่พิมพ์ไว้ตรงไหนก็ได้ (ถ้าเปิดไว้)
  if (autoDetect) {
    fence = false;
    const auto = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (fence) {
        if (FENCE_ANY.test(line)) fence = false;
        continue;
      }
      if (FENCE_OPEN.test(line)) {
        fence = true;
        continue;
      }
      if (used.has(i)) continue;
      VEC.lastIndex = 0;
      const found = [...line.matchAll(VEC)];
      if (!found.length) continue;
      const rest = found.reduce((acc, m) => acc.replace(m[0], ' '), line);
      const name = autoName(lines, i, rest) || cleanText(title) || 'พิกัด';
      for (const m of found) {
        const pos = parseCoords(m[0]);
        if (pos) {
          auto.push({
            ...pos,
            name,
            icon: 'pin',
            sprite: SHORT_SPRITES.pin,
            color: null,
            radius: null,
            note: '',
            role: '',
            sells: [],
            sounds: [],
            npc: '',
            hours: '',
            extra: [],
            line: i,
            source: 'auto',
          });
        }
      }
    }
    // ชื่อซ้ำกันในการ์ดเดียว (เช่นร้านเดียวมีหลายจุด) = ต่อท้ายลำดับให้แยกออก
    const counts = auto.reduce((m, b) => m.set(b.name, (m.get(b.name) || 0) + 1), new Map());
    const seen = new Map();
    for (const b of auto) {
      if (counts.get(b.name) > 1) {
        const n = (seen.get(b.name) || 0) + 1;
        seen.set(b.name, n);
        b.name = `${b.name} · จุดที่ ${n}`;
      }
      blips.push(b);
    }
  }

  return { blips, problems, blocks };
}

/* ---------------- เคอร์เซอร์อยู่ตรงไหนของบล็อก !blip (ไว้ให้คำแนะนำตอนพิมพ์) ---------------- */

const NAME_CHARS = 'A-Za-z0-9\\u0E00-\\u0E7F_';
const COMMAND_AT = /^(\s*(?:[-*+]\s+)?)!([A-Za-z]*)$/;
const NAME_AT = new RegExp(`^(\\s*)([-*+]\\s+)?([${NAME_CHARS}]*)$`);
const NAME_REST = new RegExp(`^[${NAME_CHARS}]*\\s*$`);
const VALUE_AT = new RegExp(`^\\s*(?:[-*+]\\s+)?([A-Za-z\\u0E00-\\u0E7F_][${NAME_CHARS} ]{0,29}?)\\s*[:=：]\\s*`);
const BULLET_AT = /^\s*[-*+]\s+/;

/**
 * ตำแหน่ง offset ในเนื้อหาการ์ดอยู่ตรงไหนของบล็อก !blip — คืนหนึ่งในนี้ หรือ null ถ้าไม่เกี่ยว
 *   { kind: 'command', from, to }                              พิมพ์ ! ต้นบรรทัด (เลือกแม่แบบ !blip)
 *   { kind: 'field', from, to, bullet, used }                   ตำแหน่งชื่อช่องในบล็อก · bullet = บรรทัดมีขีดนำแล้ว · used = ช่องที่มีแล้ว
 *   { kind: 'value', key, label, from, to, value, used, item }  หลัง "ชื่อช่อง:" หรือรายการย่อยใต้ช่อง
 *                                                               (ช่องแบบรายการ เช่น sells = เฉพาะรายการที่เคอร์เซอร์อยู่)
 * from–to = ช่วงที่คำแนะนำจะไปแทนที่ · value = ข้อความที่พิมพ์ไว้ก่อนเคอร์เซอร์ในช่วงนั้น
 */
export function blipContext(text, offset) {
  const src = String(text ?? '');
  const at = Math.max(0, Math.min(Number(offset) || 0, src.length));
  const lines = src.split('\n');
  let i = 0;
  let start = 0;
  for (let nl = src.indexOf('\n'); nl !== -1 && nl < at; nl = src.indexOf('\n', nl + 1)) {
    i++;
    start = nl + 1;
  }
  const line = lines[i];
  const before = line.slice(0, at - start);
  const after = line.slice(at - start);

  // ในบล็อกโค้ด ``` ไม่นับ (กติกาเดียวกับตอนอ่าน blip)
  let fence = false;
  for (let k = 0; k < i; k++) {
    if (fence) {
      if (FENCE_ANY.test(lines[k])) fence = false;
    } else if (FENCE_OPEN.test(lines[k])) fence = true;
  }
  if (fence) return null;

  // 1) พิมพ์ "!" ต้นบรรทัด
  const cmd = before.match(COMMAND_AT);
  if (cmd && /^[A-Za-z]*\s*$/.test(after)) {
    return { kind: 'command', from: start + cmd[1].length, to: at + after.match(/^[A-Za-z]*/)[0].length };
  }
  if (BLIP_START.test(line)) return null;

  // 2) อยู่ในบล็อกไหม — ไล่ขึ้นไปหาหัวบล็อก (ระหว่างทางต้องเป็นช่องหรือรายการย่อยทุกบรรทัด)
  let head = -1;
  for (let k = i - 1; k >= 0 && i - k <= 80; k--) {
    const l = lines[k];
    if (!l.trim()) break;
    if (BLIP_START.test(l)) {
      head = k;
      break;
    }
    if (!FIELD_LINE.test(l) && !ITEM_LINE.test(l)) break;
  }
  if (head === -1) return null;

  // ช่องที่มีแล้ว + ช่องที่อยู่เหนือเคอร์เซอร์ใกล้สุด (ไล่ตามกติกาเดียวกับ readBlock)
  const used = new Set();
  let current = null;
  let parent = null;
  for (let k = head + 1; k < lines.length; k++) {
    const l = lines[k];
    if (k === i) {
      parent = current;
      continue;
    }
    if (!l.trim() || BLIP_START.test(l)) break;
    const indent = indentOf(l);
    if (current && indent > current.indent && ITEM_LINE.test(l)) continue; // รายการย่อยของช่องก่อนหน้า
    const f = l.match(FIELD_LINE);
    if (!f) {
      if (k > i) break;
      continue;
    }
    const key = fieldKey(f[1]);
    if (key) used.add(key);
    current = { key, indent, value: f[2].trim() };
  }

  // 3) รายการย่อยใต้ช่องที่ไม่มีค่า เช่น  - sells:\n   - ขนมปัง
  const bullet = before.match(BULLET_AT);
  if (bullet && parent?.key && !parent.value && indentOf(line) > parent.indent) {
    if (!LIST_FIELDS.has(parent.key)) return null;
    return {
      kind: 'value',
      key: parent.key,
      label: parent.key,
      from: start + bullet[0].length,
      to: start + line.length,
      value: before.slice(bullet[0].length),
      used,
      item: true,
    };
  }

  // 4) หลัง "ชื่อช่อง:" = ค่าของช่องนั้น
  const v = before.match(VALUE_AT);
  if (v) {
    const key = fieldKey(v[1]);
    if (!key) return null; // ช่องที่ตั้งชื่อเอง — ไม่มีอะไรจะแนะนำ
    const valueStart = start + v[0].length;
    const typed = before.slice(v[0].length);
    if (LIST_FIELDS.has(key)) {
      // แนะนำทีละรายการ: ตั้งแต่หลังจุลภาคตัวล่าสุด ถึงจุลภาคตัวถัดไป
      const cut = Math.max(typed.lastIndexOf(','), typed.lastIndexOf('，'), typed.lastIndexOf('、'));
      const lead = cut === -1 ? 0 : cut + 1 + typed.slice(cut + 1).match(/^\s*/)[0].length;
      const next = after.search(/[,，、]/);
      return {
        kind: 'value',
        key,
        label: v[1].trim(),
        from: valueStart + lead,
        to: next === -1 ? start + line.length : at + next,
        value: typed.slice(lead),
        used,
        item: false,
      };
    }
    return { kind: 'value', key, label: v[1].trim(), from: valueStart, to: start + line.length, value: typed, used, item: false };
  }

  // 5) ตำแหน่งชื่อช่อง (บรรทัดใหม่ในบล็อก หรือกำลังพิมพ์ชื่อช่อง)
  const n = before.match(NAME_AT);
  if (n && NAME_REST.test(after)) {
    return {
      kind: 'field',
      from: start + n[1].length + (n[2] ? n[2].length : 0),
      to: at + after.match(new RegExp(`^[${NAME_CHARS}]*`))[0].length,
      bullet: Boolean(n[2]) || n[1].length > 0,
      used,
    };
  }
  return null;
}

/** ข้อความบล็อก !blip สำหรับต่อท้ายการ์ด */
export function blipBlock({ x, y, z, name, icon = 'pin', role = '', sells = [], sound = '', note = '' }) {
  const lines = ['!blip', ` - coords: ${formatVec({ x, y, ...(z !== undefined ? { z } : {}) })}`, ` - name: ${name || 'Blip'}`];
  if (icon && icon !== 'pin') lines.push(` - icon: ${icon}`);
  if (role) lines.push(` - role: ${role}`);
  const items = Array.isArray(sells) ? sells.filter(Boolean) : splitList(sells);
  if (items.length) lines.push(` - sells: ${items.join(', ')}`);
  if (sound) lines.push(` - sound: ${sound}`);
  if (note) lines.push(` - note: ${note}`);
  return lines.join('\n');
}
