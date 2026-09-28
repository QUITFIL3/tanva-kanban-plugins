/**
 * ปลั๊กอิน RedM Blips Location
 * - แท็บ "แผนที่": ปักหมุดทุกพิกัดจากการ์ดในบอร์ด กดหมุด = ดูรายละเอียด/เปิดการ์ด
 * - คลิก (หรือคลิกขวา) บนแผนที่ = ดูพิกัดในเกม คัดลอก หรือเพิ่มเป็น blip ลงการ์ด
 * - ในหน้าการ์ด: บล็อก !blip กลายเป็นกล่องรายละเอียด + แผนที่ย่อ และมีแผนที่ย่อของทุกจุดในแถบข้าง
 */
import {
  parseBlips,
  parseCoords,
  toMap,
  toGame,
  toMapDistance,
  formatVec,
  blipBlock,
  MAP_BOUNDS,
  ICON_KEYS,
  FIELD_LABELS,
  SHORT_SPRITES,
  BLIP_NAME_SET,
  blipImage,
} from './blips.js';
import { BLIP_NAMES } from './blip-names.js';
import { createBlipCompletions, blipEditorMenu } from './complete.js';
import { createBlipAi } from './ai.js';

const LEAFLET = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/';

const TILES = {
  detailed: {
    url: 'https://map-tiles.b-cdn.net/assets/rdr3/webp/detailed/{z}/{x}_{y}.webp',
    attribution: 'แผนที่ © <a href="https://rdr2map.com/" target="_blank" rel="noopener">RDR2Map</a>',
  },
  dark: {
    url: 'https://map-tiles.b-cdn.net/assets/rdr3/webp/darkmode/{z}/{x}_{y}.webp',
    attribution: 'แผนที่ © <a href="https://github.com/TDLCTV" target="_blank" rel="noopener">TDLCTV</a>',
  },
  game: {
    url: 'https://s.rsg.sc/sc/images/games/RDR2/map/game/{z}/{x}/{y}.jpg',
    attribution: '© <a href="https://www.rockstargames.com/" target="_blank" rel="noopener">Rockstar Games</a>',
  },
};
const CREDIT = 'พิกัดตาม <a href="https://github.com/jeanropke/RDOMap" target="_blank" rel="noopener">RDOMap</a>';

const ICON_PATHS = {
  pin: 'm12.596 11.596-3.535 3.536a1.5 1.5 0 0 1-2.122 0l-3.535-3.536a6.5 6.5 0 1 1 9.192-9.193 6.5 6.5 0 0 1 0 9.193Zm-1.06-8.132v-.001a5 5 0 1 0-7.072 7.072L8 14.07l3.536-3.534a5 5 0 0 0 0-7.072ZM8 9a2 2 0 1 1-.001-3.999A2 2 0 0 1 8 9Z',
  shop: 'm8.878.392 5.25 3.045c.54.314.872.89.872 1.514v6.098a1.75 1.75 0 0 1-.872 1.514l-5.25 3.045a1.75 1.75 0 0 1-1.756 0l-5.25-3.045A1.75 1.75 0 0 1 1 11.049V4.951c0-.624.332-1.201.872-1.514L7.122.392a1.75 1.75 0 0 1 1.756 0ZM7.875 1.69l-4.63 2.685L8 7.133l4.755-2.758-4.63-2.685a.248.248 0 0 0-.25 0ZM2.5 5.677v5.372c0 .09.047.171.125.216l4.625 2.683V8.432Zm6.25 8.271 4.625-2.683a.25.25 0 0 0 .125-.216V5.677L8.75 8.432Z',
  npc: 'M10.561 8.073a6.005 6.005 0 0 1 3.432 5.142.75.75 0 1 1-1.498.07 4.5 4.5 0 0 0-8.99 0 .75.75 0 0 1-1.498-.07 6.004 6.004 0 0 1 3.431-5.142 3.999 3.999 0 1 1 5.123 0ZM10.5 5a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z',
  house: 'M6.906.664a1.749 1.749 0 0 1 2.187 0l5.25 4.2c.415.332.657.835.657 1.367v7.019A1.75 1.75 0 0 1 13.25 15h-3.5a.75.75 0 0 1-.75-.75V9H7v5.25a.75.75 0 0 1-.75.75h-3.5A1.75 1.75 0 0 1 1 13.25V6.23c0-.531.242-1.034.657-1.366l5.25-4.2Zm1.25 1.171a.25.25 0 0 0-.312 0l-5.25 4.2a.25.25 0 0 0-.094.196v7.019c0 .138.112.25.25.25H5.5V8.25a.75.75 0 0 1 .75-.75h3.5a.75.75 0 0 1 .75.75v5.25h2.75a.25.25 0 0 0 .25-.25V6.23a.25.25 0 0 0-.094-.195Z',
  camp: 'M9.533.753V.752c.217 2.385 1.463 3.626 2.653 4.81C13.37 6.74 14.498 7.863 14.498 10c0 3.5-3 6-6.5 6S1.5 13.512 1.5 10c0-1.298.536-2.56 1.425-3.286.376-.308.862 0 1.035.454C4.46 8.487 5.581 8.419 6 8c.282-.282.341-.811-.003-1.5C4.34 3.187 7.035.75 8.77.146c.39-.137.726.194.763.607ZM7.998 14.5c2.832 0 5-1.98 5-4.5 0-1.463-.68-2.19-1.879-3.383l-.036-.037c-1.013-1.008-2.3-2.29-2.834-4.434-.322.256-.63.579-.864.953-.432.696-.621 1.58-.046 2.73.473.947.67 2.284-.278 3.232-.61.61-1.545.84-2.403.633a2.79 2.79 0 0 1-1.436-.874A3.198 3.198 0 0 0 3 10c0 2.53 2.164 4.5 4.998 4.5Z',
  quest: 'M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Zm0 2.445L6.615 5.5a.75.75 0 0 1-.564.41l-3.097.45 2.24 2.184a.75.75 0 0 1 .216.664l-.528 3.084 2.769-1.456a.75.75 0 0 1 .698 0l2.77 1.456-.53-3.084a.75.75 0 0 1 .216-.664l2.24-2.183-3.096-.45a.75.75 0 0 1-.564-.41L8 2.694Z',
  danger: 'M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z',
  info: 'M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z',
};
const FIT_ICON =
  'M1.75 10a.75.75 0 0 1 .75.75v2.5c0 .138.112.25.25.25h2.5a.75.75 0 0 1 0 1.5h-2.5A1.75 1.75 0 0 1 1 13.25v-2.5a.75.75 0 0 1 .75-.75Zm12.5 0a.75.75 0 0 1 .75.75v2.5A1.75 1.75 0 0 1 13.25 15h-2.5a.75.75 0 0 1 0-1.5h2.5a.25.25 0 0 0 .25-.25v-2.5a.75.75 0 0 1 .75-.75ZM2.75 2.5a.25.25 0 0 0-.25.25v2.5a.75.75 0 0 1-1.5 0v-2.5C1 1.784 1.784 1 2.75 1h2.5a.75.75 0 0 1 0 1.5ZM10 1.75a.75.75 0 0 1 .75-.75h2.5c.966 0 1.75.784 1.75 1.75v2.5a.75.75 0 0 1-1.5 0v-2.5a.25.25 0 0 0-.25-.25h-2.5a.75.75 0 0 1-.75-.75Z';

const ICON_LABELS = {
  pin: 'จุดทั่วไป',
  shop: 'ร้านค้า',
  npc: 'NPC / คน',
  house: 'บ้าน / ที่พัก',
  camp: 'แคมป์',
  quest: 'ภารกิจ',
  danger: 'อันตราย',
  info: 'ข้อมูล',
};

const EXAMPLE = [
  '!blip',
  ' - coords: vec3(-322.25, 803.97, 117.88)',
  ' - name: ร้านค้าวาเลนไทน์',
  ' - icon: shop',
  ' - role: ขายของใช้และเสบียง',
  ' - sells: ขนมปัง, นม, กระสุน',
  ' - sound: เสียงทักทาย.wav',
  ' - hours: 08:00-20:00',
].join('\n');

const AUDIO_EXT = /\.(wav|mp3|ogg|m4a|aac|flac)$/i;

const svg = (d, size = 14) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="${d}"></path></svg>`;

/* ---------------- ใช้ร่วมกัน ---------------- */

function tileChoice(host) {
  const s = host.settings();
  let key = s.tiles || 'auto';
  if (key === 'custom' && /^https?:\/\/\S+$/.test(s.customTiles || '')) {
    return { key: `custom:${s.customTiles}`, url: s.customTiles, attribution: '' };
  }
  if (!TILES[key]) key = host.theme() === 'light' ? 'detailed' : 'dark';
  return { key, ...TILES[key] };
}

async function ensureLeaflet(host) {
  await Promise.all([host.loadStyle(`${LEAFLET}leaflet.css`), host.loadScript(`${LEAFLET}leaflet.js`)]);
  return window.L;
}

const colorOf = (b, column) => b.color || column?.color || '#d4d4d4';

/** รูป blip ของเกม (ชื่อมาจากรายการที่รู้จักเท่านั้น จึงใส่ใน URL ได้ปลอดภัย) */
const spriteOf = (b) => (BLIP_NAME_SET.has(b.sprite) ? b.sprite : SHORT_SPRITES[b.icon] || SHORT_SPRITES.pin);
const spriteHtml = (b) => `<span class="rb-sprite" style="background-image:url('${blipImage(spriteOf(b))}')"></span>`;

/** ชื่อแบบอ่านง่ายของรูป blip: ไอคอนแบบสั้นใช้ชื่อไทย · รูปของเกมใช้ชื่อรูป */
function spriteLabel(b) {
  const sprite = spriteOf(b);
  return sprite === SHORT_SPRITES[b.icon] ? ICON_LABELS[b.icon] : sprite.replace(/^blip_/, '').replace(/_/g, ' ');
}

/** หมุดบนแผนที่: วงกลมเข้ม ขอบสีตามคอลัมน์/สีของ blip และรูป blip ของเกมตรงกลาง */
function pinHtml(b, color, cls = '') {
  return `<span class="rb-pin rb-${b.source} ${cls}" style="--pin:${color}">${spriteHtml(b)}</span>`;
}

/** รูป blip ขนาดเล็กในรายการ */
const chipHtml = (b, color) => `<span class="rb-chip" style="--pin:${color}">${spriteHtml(b)}</span>`;

/** ข้อความในช่อง -> HTML แบบบรรทัดเดียว (ลิงก์ ตัวหนา ฯลฯ ใช้ตัวแปลงของเว็บหลัก) */
function inline(host, text) {
  const html = host.markdown(String(text ?? ''));
  const m = html.match(/^<p>([\s\S]*)<\/p>$/);
  return m && !m[1].includes('<p>') ? m[1] : html || host.esc(text);
}

const safeAudioUrl = (u) => (/^(https:\/\/|\/uploads\/)[^\s"'<>]+$/.test(String(u || '')) ? u : '');

/** หาไฟล์เสียงที่อ้างถึง: ลิงก์ตรง ๆ หรือชื่อไฟล์ที่แนบไว้ในการ์ด */
function resolveSounds(b, card) {
  const files = (card?.attachments || []).filter((a) => /^audio\//.test(a.mime || '') || AUDIO_EXT.test(a.name || ''));
  const norm = (s) =>
    String(s || '')
      .toLowerCase()
      .replace(/\.[a-z0-9]{2,4}$/, '')
      .replace(/[\s_-]+/g, '');
  return b.sounds.map((s) => {
    if (s.url) return { name: s.name, url: safeAudioUrl(s.url) };
    const want = norm(s.name);
    const hit =
      files.find((a) => norm(a.name) === want) || (want.length >= 3 && files.find((a) => norm(a.name).includes(want)));
    return { name: s.name, url: hit ? safeAudioUrl(hit.url) : '' };
  });
}

/** รายละเอียดของ blip: หน้าที่ ของที่ขาย เสียง NPC เวลา ช่องอื่น ๆ และหมายเหตุ */
function detailsHtml(host, b, card, { compact = false } = {}) {
  const esc = host.esc;
  const rows = [];
  const row = (label, html) => rows.push(`<div class="rb-field"><dt>${esc(label)}</dt><dd>${html}</dd></div>`);
  if (b.role) row(FIELD_LABELS.role, inline(host, b.role));
  if (b.sells?.length) {
    row(FIELD_LABELS.sells, `<ul class="rb-chips">${b.sells.map((s) => `<li>${inline(host, s)}</li>`).join('')}</ul>`);
  }
  const sounds = resolveSounds(b, card);
  if (sounds.length) {
    row(
      FIELD_LABELS.sound,
      sounds
        .map((s) =>
          s.url
            ? `<div class="rb-sound"><span class="rb-sound-name">${esc(s.name || 'เสียง')}</span><audio controls preload="none" src="${esc(s.url)}"></audio></div>`
            : `<div class="rb-sound missing">${esc(s.name)} <span>— ไม่พบไฟล์นี้ในไฟล์แนบของการ์ด</span></div>`
        )
        .join('')
    );
  }
  if (b.npc) row(FIELD_LABELS.npc, `<code>${esc(b.npc)}</code>`);
  if (b.hours) row(FIELD_LABELS.hours, inline(host, b.hours));
  for (const f of b.extra || []) {
    row(
      f.label,
      Array.isArray(f.value)
        ? `<ul class="rb-chips">${f.value.map((v) => `<li>${inline(host, v)}</li>`).join('')}</ul>`
        : inline(host, f.value)
    );
  }
  if (b.note) row(FIELD_LABELS.note, inline(host, b.note));
  if (!rows.length) return '';
  return `<dl class="rb-fields ${compact ? 'compact' : ''}">${rows.join('')}</dl>`;
}

/** ทุก blip ในบอร์ด พร้อมการ์ด/คอลัมน์ที่มันอยู่ */
function collect(host) {
  const { cards, columns } = host.board();
  const settings = host.settings();
  const items = [];
  const problems = [];
  for (const card of cards) {
    if (card.archived && !settings.includeArchived) continue;
    const column = columns.find((c) => c.id === card.columnId) || null;
    const { blips, problems: bad } = parseBlips(card.body, { title: card.title, autoDetect: settings.autoDetect !== false });
    blips.forEach((b, i) => items.push({ ...b, id: `${card.id}:${b.line}:${i}`, card, column }));
    for (const p of bad) problems.push({ ...p, card });
  }
  return { items, problems };
}

/* ---------------- แผนที่ย่อ (ในหน้าการ์ด) ---------------- */

const minis = new Set();

/** แผนที่เล็ก ๆ ที่แค่โชว์ตำแหน่ง กดแล้วไปแท็บแผนที่ */
async function mountMini(host, el, points, { zoom = 5, onOpen } = {}) {
  for (const m of minis) {
    if (!m.getContainer().isConnected) {
      m.remove();
      minis.delete(m);
    }
  }
  let L;
  try {
    L = await ensureLeaflet(host);
  } catch {
    el.innerHTML = '<div class="rb-mini-note">โหลดแผนที่ไม่ได้ (ต้องต่ออินเทอร์เน็ต)</div>';
    return;
  }
  if (!el.isConnected || !points.length) return;
  const t = tileChoice(host);
  const map = L.map(el, {
    crs: L.CRS.Simple,
    minZoom: 2,
    maxZoom: 7,
    zoomControl: false,
    attributionControl: false,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
    touchZoom: false,
    tap: false,
  });
  L.tileLayer(t.url, { noWrap: true, bounds: L.latLngBounds(MAP_BOUNDS), minZoom: 2, maxZoom: 7 }).addTo(map);
  for (const p of points) {
    L.marker(toMap(p), {
      icon: L.divIcon({ className: 'rb-marker', html: pinHtml(p, p.pinColor, 'small'), iconSize: [20, 20], iconAnchor: [10, 10] }),
      interactive: false,
      keyboard: false,
    }).addTo(map);
  }
  if (points.length === 1) map.setView(toMap(points[0]), zoom);
  else map.fitBounds(L.latLngBounds(points.map(toMap)), { padding: [18, 18], maxZoom: zoom });
  minis.add(map);
  if (onOpen) {
    el.classList.add('clickable');
    el.title = 'เปิดในแท็บแผนที่';
    el.addEventListener('click', onOpen);
  }
}

/* ---------------- ฟอร์มเพิ่ม blip ---------------- */

/** มาจากแผนที่ (มีพิกัดแล้ว) หรือจากหน้าการ์ด (มีการ์ดแล้ว) */
async function addBlip({ host, shared }, { cardId = null, x = null, y = null } = {}) {
  const board = host.board();
  const cards = board.cards.filter((c) => !c.archived).sort((a, b) => b.number - a.number);
  if (!cards.length) return host.toast('ยังไม่มีการ์ดในบอร์ดนี้', 'error');
  const fields = [];
  if (!cardId) {
    const preset = cards.some((c) => c.id === shared.lastCardId) ? shared.lastCardId : cards[0].id;
    fields.push({
      key: 'card',
      label: 'การ์ด',
      type: 'select',
      value: preset,
      options: cards.map((c) => ({ value: c.id, label: `#${c.number} ${c.title}`.slice(0, 70) })),
    });
  }
  fields.push({ key: 'name', label: 'ชื่อ blip', value: '', placeholder: 'เช่น ร้านค้าวาเลนไทน์' });
  if (x === null) {
    fields.push({
      key: 'coords',
      label: 'พิกัด',
      value: '',
      placeholder: 'เช่น vec3(-322.25, 803.97, 117.88)',
      hint: 'วางค่าจากเกมได้เลย รองรับ vec2 / vec3 / vec4 หรือตัวเลขคั่นด้วยจุลภาค',
    });
  }
  fields.push({
    key: 'icon',
    label: 'รูป blip',
    type: 'select',
    value: 'pin',
    // 8 แบบที่ใช้บ่อยก่อน แล้วตามด้วยรูป blip ของเกมทั้งหมด (พิมพ์ตัวอักษรในรายการเพื่อกระโดดหาได้)
    options: [
      ...ICON_KEYS.map((k) => ({ value: k, label: `${ICON_LABELS[k]} (${SHORT_SPRITES[k]})` })),
      ...BLIP_NAMES.map((n) => ({ value: n, label: n })),
    ],
    hint: 'รูปชุดเดียวกับ redlookup.com/blips — ในการ์ดพิมพ์ชื่อรูปหรือ hash ในช่อง icon ได้เลย',
  });
  fields.push({ key: 'role', label: 'หน้าที่ของจุดนี้ (ไม่บังคับ)', value: '', placeholder: 'เช่น ขายของใช้และเสบียง' });
  fields.push({ key: 'sells', label: 'ขายอะไร (ไม่บังคับ)', value: '', placeholder: 'คั่นด้วยจุลภาค เช่น ขนมปัง, นม, กระสุน' });
  fields.push({
    key: 'sound',
    label: 'เสียง (ไม่บังคับ)',
    value: '',
    placeholder: 'ชื่อไฟล์เสียงที่แนบในการ์ด หรือ URL',
    hint: 'แนบไฟล์เสียงไว้ในการ์ดแล้วพิมพ์ชื่อไฟล์ จะเล่นได้ในกล่อง blip และบนแผนที่',
  });
  fields.push({ key: 'note', label: 'หมายเหตุ (ไม่บังคับ)', value: '' });

  const res = await host.form({
    title: 'เพิ่ม blip',
    message: x !== null ? `พิกัด ${formatVec({ x, y })}` : '',
    okText: 'เพิ่ม blip',
    fields,
  });
  if (!res) return;
  const v = Object.fromEntries(fields.map((f, i) => [f.key, String(res[i] ?? '').trim()]));
  const targetId = cardId || v.card;
  const pos = x !== null ? { x, y } : parseCoords(v.coords);
  if (!pos) return host.toast('อ่านพิกัดไม่ออก — ลองใส่แบบ vec3(x, y, z)', 'error');
  const card = host.card(targetId);
  if (!card) return host.toast('ไม่พบการ์ด', 'error');

  shared.lastCardId = targetId;
  const name = v.name || 'Blip';
  const block = blipBlock({
    x: pos.x,
    y: pos.y,
    ...(pos.z !== undefined ? { z: pos.z } : {}),
    name,
    icon: v.icon,
    role: v.role,
    sells: v.sells,
    sound: v.sound,
    note: v.note,
  });
  const body = String(card.body || '').replace(/\s+$/, '');
  try {
    await host.updateCard(targetId, { body: body ? `${body}\n\n${block}` : block });
    host.toast(`เพิ่ม blip “${name}” ลง #${card.number} แล้ว`, 'success');
  } catch (err) {
    host.toast(err.message, 'error');
  }
}

/* ---------------- แท็บแผนที่ ---------------- */

function createMapView(ctx) {
  const { host, shared } = ctx;
  const esc = host.esc;
  let root = null;
  let L = null;
  let map = null;
  let tiles = null;
  let tilesKey = '';
  let layer = null;
  let readout = null;
  let resize = null;
  let offTheme = null;
  let fitted = false;
  let items = [];
  let problems = [];
  const markers = new Map();
  const filter = { q: '', column: '', source: 'all' };
  const q = (sel) => root?.querySelector(sel);

  function applyTiles() {
    if (!map) return;
    const t = tileChoice(host);
    if (t.key === tilesKey) return;
    tilesKey = t.key;
    tiles?.remove();
    tiles = L.tileLayer(t.url, {
      noWrap: true,
      bounds: L.latLngBounds(MAP_BOUNDS),
      minZoom: 2,
      maxZoom: 7,
      attribution: [t.attribution, CREDIT].filter(Boolean).join(' · '),
    }).addTo(map);
    root.dataset.tiles = t.key.split(':')[0];
  }

  function visible() {
    const text = filter.q.trim().toLowerCase();
    const num = /^#?\d+$/.test(text) ? Number(text.replace('#', '')) : null;
    return items.filter((b) => {
      if (filter.source !== 'all' && b.source !== filter.source) return false;
      if (filter.column && b.card.columnId !== filter.column) return false;
      if (!text) return true;
      if (num !== null) return b.card.number === num;
      return [b.name, b.card.title, b.note, b.role, b.npc, ...(b.sells || [])].join(' ').toLowerCase().includes(text);
    });
  }

  function popupHtml(b) {
    const vec = formatVec(b);
    return `
      <div class="rb-pop">
        <div class="rb-pop-name">${esc(b.name)}</div>
        <button type="button" class="rb-pop-card" data-rb-open="${esc(b.card.id)}" title="เปิดการ์ด">
          <span class="rb-dot" style="background:${esc(b.column?.color || '#8b8d98')}"></span>
          <span class="mono">#${b.card.number}</span>
          <span class="rb-pop-title">${esc(b.card.title)}</span>
        </button>
        ${detailsHtml(host, b, b.card, { compact: true })}
        <div class="rb-pop-coords"><code>${esc(vec)}</code><button type="button" data-rb-copy="${esc(vec)}">คัดลอก</button></div>
        ${b.source === 'auto' ? '<div class="rb-pop-src">ดึงอัตโนมัติจากพิกัดที่พิมพ์ไว้ในการ์ด</div>' : ''}
      </div>`;
  }

  function draw() {
    if (!map) return;
    layer.clearLayers();
    markers.clear();
    for (const b of visible()) {
      const at = toMap(b);
      const color = colorOf(b, b.column);
      if (b.radius) {
        layer.addLayer(
          L.circle(at, { radius: toMapDistance(b.radius), color, weight: 1.5, fillOpacity: 0.12, interactive: false })
        );
      }
      const marker = L.marker(at, {
        icon: L.divIcon({ className: 'rb-marker', html: pinHtml(b, esc(color)), iconSize: [26, 26], iconAnchor: [13, 13] }),
        riseOnHover: true,
        alt: b.name,
      });
      marker.bindTooltip(esc(b.name), { direction: 'top', offset: [0, -14], className: 'rb-tip' });
      marker.bindPopup(() => popupHtml(b), { className: 'rb-popup', maxWidth: 320, minWidth: 240, offset: [0, -8] });
      marker.on('popupopen', () => markActive(b.id));
      marker.on('popupclose', () => markActive(null));
      layer.addLayer(marker);
      markers.set(b.id, marker);
    }
  }

  function markActive(id) {
    root?.querySelectorAll('.rb-item.active').forEach((el) => el.classList.remove('active'));
    if (!id) return;
    const el = root?.querySelector(`[data-rb-focus="${CSS.escape(id)}"]`);
    if (el) {
      el.classList.add('active');
      el.scrollIntoView({ block: 'nearest' });
    }
  }

  function renderList() {
    const list = visible();
    const groups = new Map();
    for (const b of list) {
      if (!groups.has(b.card.id)) groups.set(b.card.id, { card: b.card, column: b.column, blips: [] });
      groups.get(b.card.id).blips.push(b);
    }
    q('[data-rb-stats]').textContent = items.length ? `${list.length} จุด จาก ${groups.size} การ์ด` : 'ยังไม่มีพิกัดในบอร์ดนี้';

    const bad =
      filter.source !== 'auto' && problems.length
        ? `<div class="rb-problems">
             <div class="rb-problems-head">${svg(ICON_PATHS.danger, 13)} ${problems.length} blip ยังใส่ข้อมูลไม่ครบ</div>
             ${problems
               .map(
                 (p) => `<button type="button" class="rb-problem" data-rb-open="${esc(p.card.id)}">
                   <span class="mono">#${p.card.number}</span> ${esc(p.name)} — ${esc(p.message)}</button>`
               )
               .join('')}
           </div>`
        : '';

    const body = [...groups.values()]
      .map(
        (g) => `
        <div class="rb-group">
          <button type="button" class="rb-group-head" data-rb-open="${esc(g.card.id)}" title="เปิดการ์ด">
            <span class="rb-dot" style="background:${esc(g.column?.color || '#8b8d98')}"></span>
            <span class="mono">#${g.card.number}</span>
            <span class="rb-group-title">${esc(g.card.title)}</span>
            <span class="rb-count">${g.blips.length}</span>
          </button>
          ${g.blips
            .map(
              (b) => `
            <button type="button" class="rb-item" data-rb-focus="${esc(b.id)}">
              <span class="rb-item-icon">${chipHtml(b, esc(colorOf(b, b.column)))}</span>
              <span class="rb-item-name">${esc(b.name)}${b.role ? `<span class="rb-item-role">${esc(b.role)}</span>` : ''}</span>
              ${b.sounds?.length ? '<span class="rb-item-tag">เสียง</span>' : ''}
              ${b.source === 'auto' ? '<span class="rb-item-tag">อัตโนมัติ</span>' : ''}
            </button>`
            )
            .join('')}
        </div>`
      )
      .join('');

    const empty = items.length
      ? '<div class="rb-empty">ไม่พบจุดที่ตรงกับตัวกรอง</div>'
      : `<div class="rb-empty">
           ยังไม่มีพิกัดในบอร์ดนี้ — ใส่บล็อก <code>!blip</code> ในรายละเอียดการ์ด
           หรือคลิกบนแผนที่แล้วกด “เพิ่มเป็น blip ในการ์ด”
         </div>`;
    q('[data-rb-list]').innerHTML = bad + (body || empty);
  }

  function fitTo(list, maxZoom = 5) {
    if (!map) return;
    if (!list.length) {
      map.setView([-70, 111.75], 3);
      return;
    }
    if (list.length === 1) {
      map.setView(toMap(list[0]), Math.max(map.getZoom(), maxZoom));
      return;
    }
    map.fitBounds(L.latLngBounds(list.map(toMap)), { padding: [48, 48], maxZoom });
  }

  function focusBlip(id) {
    const marker = markers.get(id);
    if (!marker) return false;
    map.setView(marker.getLatLng(), Math.max(map.getZoom(), 5), { animate: true });
    marker.openPopup();
    return true;
  }

  function takePendingFocus() {
    const want = shared.pendingFocus;
    if (!want || !map) return false;
    shared.pendingFocus = null;
    if (want.id) return focusBlip(want.id);
    if (want.cardId) {
      fitTo(visible().filter((b) => b.card.id === want.cardId));
      return true;
    }
    return false;
  }

  function showCoords(e) {
    const g = toGame(e.latlng);
    const vec = formatVec(g);
    L.popup({ className: 'rb-popup', offset: [0, -4] })
      .setLatLng(e.latlng)
      .setContent(
        `<div class="rb-pop">
           <div class="rb-pop-name">พิกัดตรงนี้</div>
           <div class="rb-pop-coords"><code>${esc(vec)}</code><button type="button" data-rb-copy="${esc(vec)}">คัดลอก</button></div>
           <button type="button" class="rb-pop-add" data-rb-add="${g.x.toFixed(2)},${g.y.toFixed(2)}">${svg(ICON_PATHS.pin, 13)} เพิ่มเป็น blip ในการ์ด…</button>
           <div class="rb-pop-src">ความสูง (z) ดูจากแผนที่ไม่ได้ — ถ้าต้องใช้ในสคริปต์ให้ใส่เพิ่มเองภายหลัง</div>
         </div>`
      )
      .openOn(map);
  }

  function update() {
    if (!root) return;
    ({ items, problems } = collect(host));
    const select = q('[data-rb-column]');
    if (select) {
      const current = filter.column;
      select.innerHTML =
        '<option value="">ทุกคอลัมน์</option>' +
        host
          .board()
          .columns.map((c) => `<option value="${esc(c.id)}" ${c.id === current ? 'selected' : ''}>${esc(c.name)}</option>`)
          .join('');
    }
    applyTiles();
    draw();
    renderList();
    if (map && !takePendingFocus() && !fitted) {
      fitted = true;
      fitTo(visible(), 4);
    }
  }

  async function mount(container) {
    root = container;
    root.setAttribute('data-own-contextmenu', '');
    root.innerHTML = `
      <div class="rb-wrap">
        <div class="rb-map" data-rb-map><div class="rb-loading">กำลังโหลดแผนที่…</div></div>
        <aside class="rb-side">
          <div class="rb-side-head">
            <div class="rb-side-top">
              <strong>Blips</strong>
              <span class="rb-stats" data-rb-stats></span>
              <button type="button" class="btn btn-invisible btn-sm btn-icon" data-rb-fit title="ซูมให้เห็นทุกจุด" aria-label="ซูมให้เห็นทุกจุด">${svg(FIT_ICON)}</button>
            </div>
            <input class="input" data-rb-q placeholder="ค้นหาชื่อ, ของที่ขาย, การ์ด หรือ #เลขการ์ด" autocomplete="off" />
            <div class="rb-filters">
              <select class="input" data-rb-column aria-label="กรองตามคอลัมน์"><option value="">ทุกคอลัมน์</option></select>
              <select class="input" data-rb-source aria-label="กรองตามที่มา">
                <option value="all">ทุกจุด</option>
                <option value="blip">เฉพาะ !blip</option>
                <option value="auto">เฉพาะที่ดึงอัตโนมัติ</option>
              </select>
            </div>
          </div>
          <div class="rb-list" data-rb-list></div>
          <details class="rb-help">
            <summary>วิธีใส่ blip ในการ์ด</summary>
            <pre>${esc(EXAMPLE)}</pre>
            <p>
              <code>coords</code> บังคับ (vec2 / vec3 / vec4) ที่เหลือไม่บังคับ:
              <code>name</code> <code>icon</code> (shop npc house camp quest danger info)
              <code>role</code> หน้าที่ · <code>sells</code> ของที่ขาย · <code>sound</code> ไฟล์เสียงที่แนบในการ์ด ·
              <code>npc</code> <code>hours</code> <code>color</code> <code>radius</code> <code>note</code>
              และตั้งช่องใหม่เองได้ เช่น <code>- ราคา: 5$</code>
            </p>
            <p>ถ้าเปิด “ดึงอัตโนมัติ” พิกัด vec ที่พิมพ์ไว้เฉย ๆ ก็ขึ้นบนแผนที่ด้วย</p>
            <button type="button" class="btn btn-sm" data-rb-template>คัดลอกตัวอย่าง</button>
          </details>
        </aside>
      </div>`;

    root.addEventListener('click', (e) => {
      const open = e.target.closest('[data-rb-open]');
      if (open) return host.openCard(open.dataset.rbOpen);
      const focus = e.target.closest('[data-rb-focus]');
      if (focus) return focusBlip(focus.dataset.rbFocus);
      const copy = e.target.closest('[data-rb-copy]');
      if (copy) return host.copy(copy.dataset.rbCopy, 'คัดลอกพิกัดแล้ว');
      const add = e.target.closest('[data-rb-add]');
      if (add) {
        const [x, y] = add.dataset.rbAdd.split(',').map(Number);
        map?.closePopup();
        return addBlip(ctx, { x, y });
      }
      if (e.target.closest('[data-rb-fit]')) return fitTo(visible(), 5);
      if (e.target.closest('[data-rb-template]')) return host.copy(EXAMPLE, 'คัดลอกตัวอย่างแล้ว');
    });
    q('[data-rb-q]').addEventListener('input', (e) => {
      filter.q = e.target.value;
      draw();
      renderList();
    });
    root.addEventListener('change', (e) => {
      if (e.target.matches('[data-rb-column]')) filter.column = e.target.value;
      else if (e.target.matches('[data-rb-source]')) filter.source = e.target.value;
      else return;
      draw();
      renderList();
    });

    update(); // แสดงรายการได้ก่อนแม้แผนที่ยังโหลดไม่เสร็จ

    try {
      L = await ensureLeaflet(host);
    } catch (err) {
      const box = q('[data-rb-map]');
      if (box) box.innerHTML = `<div class="rb-loading">โหลดแผนที่ไม่ได้ — ต้องต่ออินเทอร์เน็ตเพื่อดึงแผนที่ (${esc(err.message)})</div>`;
      return;
    }
    if (!root?.isConnected) return; // ปิดแท็บไปแล้วระหว่างรอ

    const box = q('[data-rb-map]');
    box.innerHTML = '';
    map = L.map(box, {
      crs: L.CRS.Simple,
      minZoom: 2,
      maxZoom: 7,
      zoomSnap: 0.5,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 90,
      maxBounds: L.latLngBounds([-170, -40], [25, 215]),
      maxBoundsViscosity: 0.6,
      attributionControl: true,
    }).setView([-70, 111.75], 3);
    map.attributionControl.setPrefix(false);
    layer = L.layerGroup().addTo(map);

    readout = L.control({ position: 'bottomleft' });
    readout.onAdd = () => {
      const div = L.DomUtil.create('div', 'rb-readout');
      div.textContent = 'คลิกบนแผนที่เพื่อดูพิกัด';
      return div;
    };
    readout.addTo(map);
    map.on('mousemove', (e) => {
      const g = toGame(e.latlng);
      readout.getContainer().textContent = `x ${g.x.toFixed(1)} · y ${g.y.toFixed(1)}`;
    });
    map.on('click', showCoords);
    map.on('contextmenu', showCoords);

    resize = new ResizeObserver(() => map?.invalidateSize());
    resize.observe(box);
    offTheme = host.on('theme', () => applyTiles());

    fitted = false;
    update();
  }

  function unmount() {
    offTheme?.();
    resize?.disconnect();
    map?.remove();
    map = tiles = layer = readout = resize = offTheme = null;
    tilesKey = '';
    markers.clear();
    root = null;
  }

  return { mount, update, unmount };
}

/* ---------------- ในหน้าการ์ด ---------------- */

function goToMap(ctx, focus) {
  ctx.shared.pendingFocus = focus;
  ctx.host.closeCard();
  ctx.host.openView('map');
}

/* ---------------- แผนที่แบบหน้าต่างลอย: กดจากการ์ดแล้วดูได้เลย ไม่ต้องออกจากการ์ด ---------------- */

let mapModal = null;

function closeMapModal() {
  if (!mapModal) return;
  window.removeEventListener('keydown', mapModal.onKey, true);
  mapModal.view.unmount();
  mapModal.layer.remove();
  mapModal = null;
}

/** เปิดแผนที่เต็มในหน้าต่างลอยเหนือการ์ด — focus = { id } (blip) หรือ { cardId } (ทุกจุดของการ์ด) */
function openMapModal(ctx, focus, title = '') {
  closeMapModal();
  const { host } = ctx;
  const esc = host.esc;
  const layer = document.createElement('div');
  layer.className = 'rb-modal-layer';
  layer.innerHTML = `
    <div class="rb-modal" role="dialog" aria-modal="true" aria-label="แผนที่">
      <div class="rb-modal-head">
        <span class="rb-modal-title">${svg(ICON_PATHS.pin, 14)} แผนที่${title ? `<span class="rb-modal-sub">${esc(title)}</span>` : ''}</span>
        <button type="button" class="btn btn-sm" data-rb-modal-tab title="ปิดการ์ดแล้วไปที่แท็บแผนที่">เปิดในแท็บแผนที่</button>
        <button type="button" class="btn btn-invisible btn-icon" data-rb-modal-close title="ปิด (Esc)" aria-label="ปิด">${host.icons?.x || '×'}</button>
      </div>
      <div class="rb-modal-body"></div>
    </div>`;
  document.body.append(layer);

  // ใช้สถานะแยกจากแท็บแผนที่ (ไม่แย่งจุดที่ต้องซูมไปหากัน)
  const view = createMapView({ host, shared: { pendingFocus: focus, get lastCardId() { return ctx.shared.lastCardId; }, set lastCardId(v) { ctx.shared.lastCardId = v; } } });
  const onKey = (e) => {
    if (e.key !== 'Escape' || document.querySelector('.dialog-layer')) return; // กล่องฟอร์มเปิดอยู่ = ให้กล่องนั้นปิดก่อน
    e.preventDefault();
    e.stopPropagation(); // ปิดแค่แผนที่ การ์ดข้างหลังยังเปิดอยู่
    closeMapModal();
  };
  window.addEventListener('keydown', onKey, true);
  layer.addEventListener('mousedown', (e) => {
    if (e.target === layer) closeMapModal();
  });
  layer.querySelector('[data-rb-modal-close]').addEventListener('click', closeMapModal);
  layer.querySelector('[data-rb-modal-tab]').addEventListener('click', () => {
    closeMapModal();
    goToMap(ctx, focus);
  });
  // เปิดการ์ดใบอื่นจากในแผนที่ = ปิดหน้าต่างนี้ก่อน การ์ดจะได้ไม่ไปอยู่ข้างหลัง
  layer.addEventListener('click', (e) => e.target.closest('[data-rb-open]') && closeMapModal(), true);
  mapModal = { layer, view, onKey };
  view.mount(layer.querySelector('.rb-modal-body'));
}

/** แถบข้าง: แผนที่ย่อของทุกจุดในการ์ด + รายชื่อ */
function renderCardPanel(ctx, section, card, { readonly = false } = {}) {
  const { host } = ctx;
  const esc = host.esc;
  const settings = host.settings();
  const column = host.column(card.columnId);
  const { blips, problems } = parseBlips(card.body, { title: card.title, autoDetect: settings.autoDetect !== false });
  const shown = blips.slice(0, 8);

  section.innerHTML = `
    <div class="sidebar-title">
      <span>${svg(ICON_PATHS.pin, 13)} Blips บนแผนที่ ${blips.length ? `<span class="column-count">${blips.length}</span>` : ''}</span>
      ${readonly ? '' : '<button type="button" class="btn btn-invisible btn-sm" data-rb-new>เพิ่ม</button>'}
    </div>
    ${blips.length ? '<div class="rb-mini" data-rb-mini></div>' : ''}
    ${
      blips.length
        ? `<div class="rb-panel-list">
             ${shown
               .map(
                 (b, i) => `
               <button type="button" class="rb-panel-item" data-rb-show="${esc(`${card.id}:${b.line}:${i}`)}" title="ดูบนแผนที่">
                 <span class="rb-item-icon">${chipHtml(b, esc(colorOf(b, column)))}</span>
                 <span class="rb-panel-name">${esc(b.name)}</span>
               </button>`
               )
               .join('')}
             ${blips.length > shown.length ? `<div class="sidebar-value">และอีก ${blips.length - shown.length} จุด</div>` : ''}
           </div>`
        : `<div class="sidebar-value">ยังไม่มีพิกัด — พิมพ์ <code>!blip</code> ในรายละเอียด${readonly ? '' : ' หรือกด “เพิ่ม”'}</div>`
    }
    ${problems.map((p) => `<div class="rb-panel-warn">${svg(ICON_PATHS.danger, 12)} ${esc(p.name)}: ${esc(p.message)}</div>`).join('')}`;

  section.addEventListener('click', (e) => {
    const show = e.target.closest('[data-rb-show]');
    if (show) return openMapModal(ctx, { id: show.dataset.rbShow }, `#${card.number} ${card.title}`);
    if (e.target.closest('[data-rb-new]')) addBlip(ctx, { cardId: card.id });
  });

  const mini = section.querySelector('[data-rb-mini]');
  if (mini) {
    mountMini(
      host,
      mini,
      blips.map((b) => ({ ...b, pinColor: colorOf(b, column) })),
      { zoom: 4, onOpen: () => openMapModal(ctx, { cardId: card.id }, `#${card.number} ${card.title}`) }
    );
  }
}

/** เปลี่ยนบล็อก !blip ในเนื้อหาการ์ดเป็นกล่องรายละเอียด + แผนที่ย่อ */
function decorateCardBody(ctx, bodyEl, card) {
  const { host } = ctx;
  const esc = host.esc;
  const settings = host.settings();
  const column = host.column(card.columnId);
  const parsed = parseBlips(card.body, { title: card.title, autoDetect: settings.autoDetect !== false });
  const lines = String(card.body || '').replace(/\r\n?/g, '\n').split('\n');
  // เฉพาะบล็อกที่ขึ้นต้นบรรทัดด้วย !blip — ตัววาด markdown จะวาดเป็นย่อหน้าระดับบนสุดเสมอ
  const blocks = parsed.blocks.filter((b) => /^!blip\b/i.test(lines[b.line] || ''));
  if (!blocks.length) return;
  const root = bodyEl.classList.contains('markdown') ? bodyEl : bodyEl.querySelector('.markdown') || bodyEl;

  // ย่อหน้าระดับบนสุดที่มีบรรทัดขึ้นต้นด้วย !blip (อาจอยู่ท้ายย่อหน้าที่มีข้อความอื่นนำหน้า)
  const found = [];
  for (const p of [...root.children].filter((el) => el.tagName === 'P')) {
    const nodes = [...p.childNodes];
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const atLineStart = i === 0 || nodes[i - 1].nodeName === 'BR';
      if (atLineStart && n.nodeType === 3 && /^\s*!blip\b/i.test(n.textContent)) found.push({ p, index: i });
    }
  }

  found.forEach(({ p, index }, n) => {
    const block = blocks[n];
    if (!block) return;
    const wrap = document.createElement('div');
    wrap.className = 'rb-card-wrap';
    wrap.addEventListener('dblclick', (e) => e.stopPropagation()); // ไม่เข้าโหมดแก้ไขตอนดับเบิลคลิกกล่องนี้

    if (block.blip) {
      const b = block.blip;
      const id = `${card.id}:${b.line}:${parsed.blips.indexOf(b)}`;
      const color = colorOf(b, column);
      const vec = formatVec(b);
      wrap.innerHTML = `
        <div class="rb-card">
          <div class="rb-card-head">
            ${pinHtml(b, esc(color))}
            <div class="rb-card-title">
              <strong>${esc(b.name)}</strong>
              <span class="rb-card-sub">${esc(spriteLabel(b))}${b.hours ? ` · ${esc(b.hours)}` : ''}</span>
            </div>
            <button type="button" class="btn btn-sm" data-rb-card-show>${svg(ICON_PATHS.pin, 13)} ดูบนแผนที่</button>
          </div>
          <div class="rb-card-body">
            <div class="rb-card-map" data-rb-card-map></div>
            <div class="rb-card-info">
              ${detailsHtml(host, b, card) || '<div class="rb-card-empty">ยังไม่มีรายละเอียด — เพิ่มช่องเช่น role / sells / sound ได้</div>'}
              <div class="rb-pop-coords"><code>${esc(vec)}</code><button type="button" data-rb-copy="${esc(vec)}">คัดลอก</button></div>
            </div>
          </div>
        </div>`;
      wrap.querySelector('[data-rb-card-show]').addEventListener('click', () => openMapModal(ctx, { id }, b.name));
      wrap.querySelector('[data-rb-copy]').addEventListener('click', (e) => host.copy(e.currentTarget.dataset.rbCopy, 'คัดลอกพิกัดแล้ว'));
      mountMini(host, wrap.querySelector('[data-rb-card-map]'), [{ ...b, pinColor: color }], {
        zoom: 5,
        onOpen: () => openMapModal(ctx, { id }, b.name),
      });
    } else {
      wrap.innerHTML = `
        <div class="rb-card problem">
          <div class="rb-card-head">
            <span class="rb-card-warn">${svg(ICON_PATHS.danger, 14)}</span>
            <div class="rb-card-title">
              <strong>${esc(block.problem.name)}</strong>
              <span class="rb-card-sub">${esc(block.problem.message)} — แก้รายละเอียดแล้วใส่ <code>- coords: vec3(x, y, z)</code></span>
            </div>
          </div>
        </div>`;
    }

    // ตัดส่วน !blip ออกจากย่อหน้า (ข้อความก่อนหน้ายังอยู่) แล้วเอากล่องไปวางแทน
    const nodes = [...p.childNodes];
    nodes.slice(index).forEach((node) => node.remove());
    while (p.lastChild && (p.lastChild.nodeName === 'BR' || (p.lastChild.nodeType === 3 && !p.lastChild.textContent.trim()))) {
      p.lastChild.remove();
    }
    // รายการช่อง (- coords: … - name: …) ที่ตามมาทันที
    const next = p.nextElementSibling;
    if (next && /^(UL|OL)$/.test(next.tagName) && /^[^:：=\n]{1,30}[:：=]/.test(next.firstElementChild?.textContent.trim() || '')) {
      next.remove();
    }
    if (p.childNodes.length) p.after(wrap);
    else p.replaceWith(wrap);
  });
}

export default function setup(host) {
  const ctx = { host, shared: { pendingFocus: null, lastCardId: null } };
  return {
    views: { map: createMapView(ctx) },
    cardPanel: (section, card, opts) => renderCardPanel(ctx, section, card, opts),
    cardBody: (bodyEl, card) => decorateCardBody(ctx, bodyEl, card),
    // IntelliSense ของ !blip ตอนแก้รายละเอียดการ์ด (ต้องใช้ Tanva Kanban รุ่นที่มีคำแนะนำตอนพิมพ์)
    completions: createBlipCompletions(host, { iconPaths: ICON_PATHS, iconLabels: ICON_LABELS }),
    // คลิกขวาในช่องเขียน → แทรก !blip
    editorMenu: (ctx) => blipEditorMenu(ctx, { iconPaths: ICON_PATHS }),
    // ให้ผู้ช่วย AI รู้วิธีเขียน !blip และเรียกดู/เพิ่ม blip ได้
    ai: createBlipAi(host),
  };
}
