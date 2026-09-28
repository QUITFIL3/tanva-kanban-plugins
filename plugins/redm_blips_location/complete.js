/**
 * คำแนะนำตอนพิมพ์ (IntelliSense) ของ !blip ในช่องเขียนรายละเอียดการ์ด
 *
 * - พิมพ์ ! ต้นบรรทัด = เลือกแม่แบบ !blip (กด Tab ไปช่องถัดไป)
 * - ในบล็อก !blip ขึ้นบรรทัดใหม่หรือพิมพ์ชื่อช่อง = ช่องที่ยังไม่ได้ใส่ พร้อมคำอธิบาย
 * - หลัง icon: / color: / coords: / sound: / sells: … = ค่าที่ใช้ได้
 *   (ไอคอน สี พิกัดของจุดอื่นในบอร์ด ไฟล์เสียงที่แนบในการ์ด ของที่ขายในจุดอื่น)
 *
 * ไม่แตะหน้าเว็บเลย — คืนแค่รายการให้ช่องเขียนของ Tanva Kanban วาดเอง (เทสต์ใน Node ได้)
 */
import {
  blipContext,
  parseBlips,
  formatVec,
  FIELD_ALIASES,
  ICON_ALIASES,
  NAMED_COLORS,
  ICON_KEYS,
  SHORT_SPRITES,
  blipImage,
  joaat,
} from './blips.js';
import { BLIP_NAMES } from './blip-names.js';

/** คำไทยของส่วนในชื่อรูป blip ไว้ค้นเป็นภาษาไทย เช่น พิมพ์ "ปืน" เจอ blip_shop_gunsmith */
const BLIP_WORDS_TH = {
  shop: 'ร้าน',
  store: 'ร้านค้า',
  gunsmith: 'ร้านปืน ปืน',
  doctor: 'หมอ ร้านยา',
  barber: 'ร้านตัดผม',
  butcher: 'ร้านเนื้อ',
  tailor: 'ร้านเสื้อผ้า',
  wardrobe: 'ตู้เสื้อผ้า',
  horse: 'ม้า',
  saddle: 'อานม้า',
  train: 'รถไฟ',
  coach: 'รถม้า',
  fishing: 'ตกปลา',
  fish: 'ปลา',
  hunting: 'ล่าสัตว์',
  animal: 'สัตว์',
  trapper: 'ขนสัตว์',
  camp: 'แคมป์',
  campfire: 'กองไฟ',
  tent: 'เต็นท์',
  home: 'บ้าน',
  hotel: 'โรงแรม',
  bath: 'อาบน้ำ',
  saloon: 'ร้านเหล้า บาร์',
  bank: 'ธนาคาร',
  post: 'ไปรษณีย์',
  sheriff: 'นายอำเภอ ตำรวจ',
  bounty: 'ค่าหัว',
  gang: 'แก๊ง',
  mission: 'ภารกิจ',
  objective: 'เป้าหมาย ภารกิจ',
  poi: 'จุด',
  npc: 'คน',
  ped: 'คน',
  player: 'ผู้เล่น',
  treasure: 'สมบัติ',
  herb: 'สมุนไพร',
  plant: 'พืช',
  church: 'โบสถ์',
  town: 'เมือง',
  fence: 'รับซื้อของโจร',
  moonshine: 'เหล้าเถื่อน',
  market: 'ตลาด',
  attention: 'ระวัง อันตราย',
  newspaper: 'หนังสือพิมพ์ ข้อมูล',
  blacksmith: 'ช่างตีเหล็ก',
  robbery: 'ปล้น',
  location: 'ตำแหน่ง',
};

const thaiWords = (name) =>
  name
    .split('_')
    .map((w) => BLIP_WORDS_TH[w] || '')
    .filter(Boolean)
    .join(' ');

const hex = (h) => `0x${(h >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;

/**
 * เรียงรูป blip ตามที่คนทำเซิร์ฟเวอร์ใช้บ่อย: ร้านค้า → จุดบริการ/สถานที่ทั่วไป → ambient → ภารกิจ/ออนไลน์/ตัวชี้ทิศ
 * (พิมพ์ "gun" แล้ว blip_shop_gunsmith จะมาก่อนรูปภารกิจ gunslinger)
 */
const blipRank = (n) =>
  n.startsWith('blip_shop_') ? 0 : /^blip_(mp|mission|rc|region|overlay|radar|direction|code)_/.test(n) ? 3 : n.startsWith('blip_ambient_') ? 2 : 1;
const BLIPS_BY_USE = BLIP_NAMES.map((n, i) => [n, i])
  .sort((a, b) => blipRank(a[0]) - blipRank(b[0]) || a[1] - b[1])
  .map(([n]) => n);

const AUDIO_EXT = /\.(wav|mp3|ogg|m4a|aac|flac)$/i;

/** ช่องทั้งหมดของ !blip ตามลำดับที่ควรใส่ */
export const FIELDS = [
  {
    key: 'coords',
    title: 'พิกัด',
    required: true,
    example: 'vec3(-322.25, 803.97, 117.88)',
    doc: 'พิกัดในเกม `vec2(x, y)` `vec3(x, y, z)` หรือ `vec4(x, y, z, h)` — ช่องเดียวที่ต้องมี\n\nหาได้จากในเกม หรือคลิกบนแท็บ **แผนที่** แล้วกด **คัดลอก**',
  },
  { key: 'name', title: 'ชื่อบนแผนที่', example: 'ร้านปืน Valentine', doc: 'ชื่อที่ขึ้นบนหมุดและในรายการของแผนที่ · ไม่ใส่ = ใช้ชื่อการ์ด' },
  {
    key: 'icon',
    title: 'รูป blip',
    example: 'blip_shop_gunsmith',
    doc:
      'รูปบนหมุด — ชื่อรูป blip ของเกม (ชุดเดียวกับ redlookup.com/blips เช่น `blip_shop_gunsmith`) หรือ hash ของมัน · ' +
      'หรือแบบสั้น `shop` `npc` `house` `camp` `quest` `danger` `info` `pin`',
  },
  { key: 'color', title: 'สีหมุด', example: 'orange', doc: '`#hex` หรือชื่อสีภาษาอังกฤษ · ไม่ใส่ = สีของคอลัมน์ที่การ์ดอยู่' },
  { key: 'radius', title: 'รัศมี', example: '25', doc: 'วาดวงรอบจุด หน่วยเดียวกับพิกัดในเกม' },
  { key: 'role', title: 'หน้าที่', example: 'ขายและซ่อมอาวุธ', doc: 'จุดนี้มีไว้ทำอะไร' },
  {
    key: 'sells',
    title: 'ของที่ขาย',
    example: 'ขนมปัง, นม, ชีส',
    doc: 'คั่นด้วย `,` หรือเว้นว่างแล้วเขียนเป็นรายการย่อยบรรทัดละชิ้น (กด Tab ย่อหน้า)',
  },
  {
    key: 'sound',
    title: 'เสียง',
    example: 'ทักทาย.wav',
    doc: 'ชื่อไฟล์เสียงที่แนบในการ์ด, `[ชื่อ](/uploads/…)` หรือลิงก์ `https://` — หลายเสียงคั่นด้วย `,`',
  },
  { key: 'npc', title: 'โมเดล NPC', example: 'u_m_m_valgenstoreowner_01', doc: 'ชื่อโมเดล ped ของ NPC ประจำจุดนี้' },
  { key: 'hours', title: 'เวลาเปิด', example: '08:00-20:00', doc: 'เวลาเปิด-ปิดของจุดนี้' },
  { key: 'note', title: 'หมายเหตุ', example: 'เปิดเฉพาะช่วงอีเวนต์', doc: 'ข้อความเพิ่มเติมท้ายกล่องรายละเอียด' },
];

const COLOR_THAI = {
  red: 'แดง',
  orange: 'ส้ม',
  yellow: 'เหลือง',
  green: 'เขียว',
  blue: 'น้ำเงิน ฟ้า',
  purple: 'ม่วง',
  pink: 'ชมพู',
  white: 'ขาว',
  gray: 'เทา',
  grey: 'เทา',
  black: 'ดำ',
};

const RADIUS = [
  ['10', 'จุดเล็ก ๆ'],
  ['25', 'รอบร้าน / บ้านหนึ่งหลัง'],
  ['50', 'ลานหรือค่าย'],
  ['100', 'ย่านในเมือง'],
  ['250', 'ทั้งเมืองเล็ก'],
];

const HOURS = [
  ['08:00-20:00', 'เปิดกลางวัน'],
  ['06:00-22:00', 'เปิดเช้าถึงค่ำ'],
  ['20:00-04:00', 'เปิดกลางคืน'],
  ['24 ชั่วโมง', 'เปิดตลอด'],
];

const code = (s) => '`' + String(s).replace(/`/g, '') + '`';
const fence = (s) => '```\n' + s + '\n```';

/** แม่แบบของ !blip — ${n:ข้อความ} = ช่องที่กด Tab ไปได้ · $0 = เคอร์เซอร์สุดท้าย */
function templates(soundName) {
  const sound = soundName ? soundName.replace(/[$}\\]/g, '') : 'ชื่อไฟล์เสียงที่แนบในการ์ด';
  return [
    {
      label: '!blip',
      detail: 'หมุดพื้นฐาน',
      about: 'ปักหมุดบนแผนที่ด้วยพิกัดกับชื่อ — ใส่ช่องอื่นเพิ่มทีหลังได้ (ขึ้นบรรทัดใหม่ในบล็อกแล้วเลือกช่อง)',
      body: ['!blip', ' - coords: vec3(${1:x}, ${2:y}, ${3:z})', ' - name: ${4:ชื่อจุด}$0'],
    },
    {
      label: '!blip ร้านค้า',
      detail: 'ร้าน + ของที่ขาย',
      about: 'จุดขายของ พร้อมหน้าที่ รายการสินค้า และเวลาเปิด',
      body: [
        '!blip',
        ' - coords: vec3(${1:x}, ${2:y}, ${3:z})',
        ' - name: ${4:ชื่อร้าน}',
        ' - icon: shop',
        ' - role: ${5:ขายอะไร / ทำหน้าที่อะไร}',
        ' - sells: ${6:สินค้า 1, สินค้า 2}',
        ' - hours: ${7:08:00-20:00}$0',
      ],
    },
    {
      label: '!blip NPC',
      detail: 'NPC + เสียง',
      about: 'NPC ประจำจุด พร้อมทิศที่หัน (h) โมเดล หน้าที่ และเสียงพูด',
      body: [
        '!blip',
        ' - coords: vec4(${1:x}, ${2:y}, ${3:z}, ${4:h})',
        ' - name: ${5:ชื่อ NPC}',
        ' - icon: npc',
        ' - npc: ${6:ชื่อโมเดล ped}',
        ' - role: ${7:หน้าที่}',
        ` - sound: \${8:${sound}}$0`,
      ],
    },
    {
      label: '!blip จุดอันตราย',
      detail: 'หมุดสีแดง + รัศมี',
      about: 'พื้นที่ที่ต้องระวัง วาดวงรัศมีสีแดงบนแผนที่',
      body: ['!blip', ' - coords: vec3(${1:x}, ${2:y}, ${3:z})', ' - name: ${4:ชื่อพื้นที่}', ' - icon: danger', ' - color: red', ' - radius: ${5:50}', ' - note: ${6:ระวังอะไร}$0'],
    },
    {
      label: '!blip ครบทุกช่อง',
      detail: 'ทุกช่องที่ใส่ได้',
      about: 'ใส่ครบทุกช่อง ลบช่องที่ไม่ใช้ทิ้งได้',
      body: [
        '!blip',
        ' - coords: vec3(${1:x}, ${2:y}, ${3:z})',
        ' - name: ${4:ชื่อจุด}',
        ' - icon: ${5:pin}',
        ' - color: ${6:orange}',
        ' - radius: ${7:25}',
        ' - role: ${8:หน้าที่}',
        ' - sells: ${9:สินค้า 1, สินค้า 2}',
        ` - sound: \${10:${sound}}`,
        ' - npc: ${11:ชื่อโมเดล ped}',
        ' - hours: ${12:08:00-20:00}',
        ' - note: ${13:หมายเหตุ}$0',
      ],
    },
  ].map((t) => {
    const insert = t.body.join('\n');
    const preview = insert.replace(/\$\{\d+:([^}]*)\}/g, '$1').replace(/\$0/g, '');
    return {
      label: t.label,
      detail: t.detail,
      filter: `${t.label} blip`,
      doc: `${t.about}\n\n${fence(preview)}\n\nกด **Tab** ไปช่องถัดไป · **Esc** เมื่อเสร็จ`,
      insert,
    };
  });
}

/** ชื่อที่จะใส่ให้ช่อง: ถ้ากำลังพิมพ์ชื่อภาษาไทย/ชื่ออื่นที่ใช้แทนกันได้ ก็ใช้ชื่อนั้นต่อ */
function nameFor(key, typed) {
  const q = typed.trim().toLowerCase();
  if (!q || key.startsWith(q)) return key;
  return FIELD_ALIASES[key].find((a) => a.startsWith(q)) || key;
}

const audioOf = (card) =>
  (card?.attachments || []).filter((a) => /^audio\//.test(a.mime || '') || AUDIO_EXT.test(a.name || ''));

/** เมนูคลิกขวาในช่องเขียน: แทรก !blip จากแม่แบบ (ต่อกับ setup(host) → { editorMenu }) */
export function blipEditorMenu(ctx, { iconPaths = {} } = {}) {
  return [
    {
      label: 'แทรก !blip',
      icon: iconPaths.pin || '',
      items: templates(audioOf(ctx?.card)[0]?.name).map((t) => ({ label: t.label, insert: t.insert, block: true })),
    },
  ];
}

/**
 * ตัวให้คำแนะนำของปลั๊กอิน — ต่อกับ setup(host) → { completions }
 * iconPaths / iconLabels = ไอคอนและชื่อของแต่ละแบบหมุด (มาจาก index.js)
 */
export function createBlipCompletions(host, { iconPaths = {}, iconLabels = {} } = {}) {
  const cache = new Map(); // id การ์ด -> blip ที่อ่านแล้ว (อ่านใหม่เมื่อเนื้อหาเปลี่ยน)

  function boardBlips() {
    const auto = host.settings().autoDetect !== false;
    const out = [];
    for (const card of host.board().cards || []) {
      if (card.archived) continue;
      const key = `${auto ? 1 : 0}\n${card.body || ''}`;
      let hit = cache.get(card.id);
      if (!hit || hit.key !== key) {
        hit = { key, blips: parseBlips(card.body, { title: card.title, autoDetect: auto }).blips };
        cache.set(card.id, hit);
      }
      for (const b of hit.blips) out.push({ ...b, card });
    }
    return out;
  }

  /** ค่าที่เคยใช้ในบอร์ด (ไม่ซ้ำ ใหม่สุดก่อน) เช่นของที่ขาย โมเดล NPC หน้าที่ */
  function usedValues(pick, limit = 30) {
    const seen = new Map();
    for (const b of boardBlips()) {
      for (const raw of [].concat(pick(b) || [])) {
        const value = String(raw).trim();
        if (value && !seen.has(value.toLowerCase())) seen.set(value.toLowerCase(), { value, b });
      }
    }
    return [...seen.values()].slice(0, limit);
  }

  function commandItems(c, ctx) {
    const sound = audioOf(ctx.card)[0]?.name;
    return { title: '!blip — ปักหมุดบนแผนที่ RedM', from: c.from, to: c.to, items: templates(sound) };
  }

  function fieldItems(c, ctx) {
    const typed = ctx.text.slice(c.from, ctx.offset);
    const prefix = c.bullet ? '' : ' - ';
    const hasValues = new Set(['coords', 'icon', 'color', 'radius', 'sound', 'hours']);
    if (usedValues((b) => b.npc, 1).length) hasValues.add('npc');
    if (usedValues((b) => b.sells, 1).length) hasValues.add('sells');
    if (usedValues((b) => b.role, 1).length) hasValues.add('role');
    if (ctx.card?.title) hasValues.add('name');
    const items = FIELDS.filter((f) => !c.used.has(f.key)).map((f) => {
      const name = nameFor(f.key, typed);
      const aliases = FIELD_ALIASES[f.key].filter((a) => a !== f.key);
      return {
        label: name,
        detail: `${f.title}${f.required ? ' · จำเป็น' : ''}`,
        icon: fieldIcon(f.key),
        filter: [f.key, ...FIELD_ALIASES[f.key]].join(' '),
        doc: `**${f.key}** — ${f.title}\n\n${f.doc}\n\nตัวอย่าง ${code(`${f.key}: ${f.example}`)}\n\nชื่ออื่นที่ใช้แทนได้: ${aliases.map(code).join(' ')}`,
        insert: `${prefix}${name}: `,
        retrigger: hasValues.has(f.key),
      };
    });
    if (!items.length) return null;
    return { title: 'ช่องของ !blip', from: c.from, to: c.to, items };
  }

  // ไอคอนเฉพาะช่องที่มีรูปตรงความหมาย ที่เหลือเป็นจุดธรรมดา
  const fieldIcon = (key) => iconPaths[{ coords: 'pin', sells: 'shop', npc: 'npc' }[key]] || '';

  function valueItems(c, ctx) {
    const field = FIELDS.find((f) => f.key === c.key);
    const title = `${c.key} — ${field?.title || ''}`;
    const out = (items, extra = {}) => (items.length ? { title, from: c.from, to: c.to, items, ...extra } : null);
    // พิมพ์ค่าเสร็จไปแล้ว (ยาวกว่าที่จะเป็นคำค้น) = ไม่ต้องเด้งขึ้นมาเอง ยกเว้นกด Ctrl+Space
    const typed = c.value.trim();
    const quiet = ctx.trigger !== 'explicit';

    switch (c.key) {
      case 'coords': {
        if (quiet && /\)\s*$/.test(typed)) return null;
        const vec = [
          { label: 'vec3(x, y, z)', detail: 'x y และความสูง', insert: 'vec3(${1:x}, ${2:y}, ${3:z})', doc: 'รูปแบบที่ใช้บ่อยที่สุด — ตำแหน่งกับความสูงในเกม' },
          { label: 'vec2(x, y)', detail: 'ตำแหน่งบนพื้น', insert: 'vec2(${1:x}, ${2:y})', doc: 'ไม่มีความสูง ใช้ปักหมุดบนแผนที่ได้เหมือนกัน' },
          { label: 'vec4(x, y, z, h)', detail: '+ ทิศที่หัน', insert: 'vec4(${1:x}, ${2:y}, ${3:z}, ${4:h})', doc: 'มีทิศที่หัน (heading) เหมาะกับจุดยืนของ NPC' },
        ];
        const seen = new Set();
        const others = boardBlips()
          .filter((b) => {
            const k = formatVec(b);
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          })
          .slice(0, 30)
          .map((b) => ({
            label: formatVec(b),
            detail: b.name,
            icon: iconPaths[b.icon] || iconPaths.pin,
            filter: `${formatVec(b)} ${b.name} #${b.card.number}`,
            doc: `พิกัดเดียวกับ **${b.name}** ในการ์ด #${b.card.number} ${b.card.title}`,
            insert: formatVec(b),
          }));
        return out([...vec, ...others]);
      }
      case 'icon':
        // แบบสั้นที่ใช้บ่อยก่อน แล้วตามด้วยรูป blip ของเกมทั้งหมด (พิมพ์ชื่อ/คำไทยเพื่อกรอง)
        return out([
          ...ICON_KEYS.map((key) => ({
            label: key,
            detail: iconLabels[key] || '',
            image: blipImage(SHORT_SPRITES[key]),
            filter: [key, ...(ICON_ALIASES[key] || []), SHORT_SPRITES[key]].join(' '),
            doc: `ไอคอน **${iconLabels[key] || key}** — ใช้รูป ${code(SHORT_SPRITES[key])} ของเกม\n\nพิมพ์แบบนี้ก็ได้: ${(ICON_ALIASES[key] || []).map(code).join(' ')}`,
            insert: key,
          })),
          ...BLIPS_BY_USE.map((name) => ({
            label: name,
            image: blipImage(name),
            filter: `${name} ${name.replace(/^blip_/, '').replace(/_/g, ' ')} ${thaiWords(name)}`,
            doc: `รูป blip ของเกม ${code(name)}\n\nhash ${code(joaat(name))} · ${code(hex(joaat(name)))} — ใช้ในสคริปต์ RedM ได้ตรง ๆ`,
            insert: name,
          })),
        ]);
      case 'color':
        return out([
          ...Object.entries(NAMED_COLORS)
            .filter(([name]) => name !== 'grey')
            .map(([name, hex]) => ({
              label: name,
              detail: COLOR_THAI[name]?.split(' ')[0] || '',
              color: hex,
              filter: `${name} ${COLOR_THAI[name] || ''}`,
              doc: `สี ${COLOR_THAI[name] || name} ${code(hex)}`,
              insert: name,
            })),
          { label: '#hex', detail: 'ใส่รหัสสีเอง', filter: '# hex rgb', doc: 'รหัสสีแบบ `#e5484d` หรือ `#f60`', insert: '#${1:e5484d}' },
        ]);
      case 'radius':
        return out(RADIUS.map(([n, about]) => ({ label: n, detail: about, doc: `วงรัศมี ${n} หน่วยรอบจุด`, insert: n })));
      case 'hours':
        return out(HOURS.map(([h, about]) => ({ label: h, detail: about, insert: h })));
      case 'sound': {
        const files = audioOf(ctx.card);
        if (files.length) {
          return out(
            files.map((a) => ({
              label: a.name,
              detail: 'ไฟล์ในการ์ดนี้',
              doc: `ไฟล์เสียงที่แนบในการ์ดนี้ — เล่นได้จากกล่อง blip และบนแผนที่\n\n${code(a.name)}`,
              insert: a.name,
            }))
          );
        }
        return out([
          {
            label: '[ชื่อ](ลิงก์)',
            detail: 'ลิงก์ไฟล์เสียง',
            filter: 'link url https ลิงก์',
            doc: 'การ์ดนี้ยังไม่มีไฟล์เสียงแนบ — แนบไฟล์ .wav / .mp3 / .ogg ในแท็บ **ไฟล์แนบ** แล้วพิมพ์ชื่อไฟล์ได้เลย หรือใส่ลิงก์ `https://`',
            insert: '[${1:ชื่อเสียง}](${2:https://})',
          },
        ]);
      }
      case 'name':
        if (!ctx.card?.title) return null;
        return out([{ label: ctx.card.title, detail: 'ชื่อการ์ด', doc: 'ใช้ชื่อเดียวกับการ์ด (ไม่ใส่ช่อง name ก็ได้ผลเหมือนกัน)', insert: ctx.card.title }]);
      case 'npc':
        return out(
          usedValues((b) => b.npc).map(({ value, b }) => ({
            label: value,
            detail: b.name,
            icon: iconPaths.npc,
            doc: `ใช้อยู่ที่ **${b.name}** (#${b.card.number})`,
            insert: value,
          }))
        );
      case 'sells': {
        // ของที่อยู่ในบรรทัดนี้แล้วไม่ต้องแนะนำซ้ำ
        const inline = c.item ? '' : ctx.line.match(/[:=：]\s*(.*)$/)?.[1] || '';
        const have = new Set(
          inline
            .split(/[,，、]/)
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean)
        );
        have.delete(c.value.trim().toLowerCase());
        return out(
          usedValues((b) => b.sells)
            .filter(({ value }) => !have.has(value.toLowerCase()))
            .map(({ value, b }) => ({ label: value, detail: b.name, icon: iconPaths.shop, doc: `ขายอยู่ที่ **${b.name}** (#${b.card.number})`, insert: value }))
        );
      }
      case 'role':
        return out(
          usedValues((b) => b.role, 20).map(({ value, b }) => ({ label: value, detail: b.name, doc: `หน้าที่ของ **${b.name}** (#${b.card.number})`, insert: value }))
        );
      default:
        return null;
    }
  }

  return {
    provide(ctx) {
      const c = blipContext(ctx.text, ctx.offset);
      if (!c) return null;
      if (c.kind === 'command') return commandItems(c, ctx);
      if (c.kind === 'field') return fieldItems(c, ctx);
      return valueItems(c, ctx);
    },
  };
}
