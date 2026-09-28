/**
 * ให้ผู้ช่วย AI (ปลั๊กอิน ai_assistant) ใช้ความสามารถของปลั๊กอินนี้ได้
 * ต่อกับ setup(host) → { ai: createBlipAi(host) } — ผู้ช่วย AI อ่านผ่าน host.pluginExports('ai')
 *
 * - guide: วิธีเขียน !blip ให้ AI รู้ (ไปอยู่ในข้อความระบบของ AI)
 * - tools: list_blips (อ่าน) · add_blip (แก้การ์ด — ผู้ใช้ต้องกดอนุญาตก่อนถ้าเปิดไว้)
 */
import { parseBlips, formatVec, blipBlock } from './blips.js';

const LIST_LIMIT = 80;

export const BLIP_GUIDE = [
  'Cards can put points on the RedM / Red Dead Redemption 2 map with a "!blip" block in the card description:',
  '',
  '!blip',
  ' - coords: vec3(-322.25, 803.97, 117.88)',
  ' - name: Valentine General Store',
  ' - icon: shop',
  ' - role: sells supplies and ammo',
  ' - sells: bread, milk, ammo',
  ' - sound: greeting.wav',
  ' - npc: u_m_m_valgenstoreowner_01',
  ' - hours: 08:00-20:00',
  '',
  'Rules:',
  '- coords is required: vec2(x, y), vec3(x, y, z) or vec4(x, y, z, heading) in in-game coordinates. Never invent coordinates — use list_blips or ask the user.',
  '- Optional fields: name, icon, color (#hex or red/orange/yellow/green/blue/purple/pink/white/gray/black), radius (in-game units),',
  '  role (what the place is for), sells (comma-separated), sound (audio file attached to the card, or a link), npc (ped model), hours, note.',
  '  Any other "- field: value" line is shown as-is in the blip details.',
  '- icon: short keys shop, npc, house, camp, quest, danger, info, pin — or any RedM blip sprite name such as blip_shop_store,',
  '  blip_shop_gunsmith, blip_shop_doctor, blip_shop_horse, blip_campfire, blip_post_office (or its hash from the game).',
  '- Field names may also be written in Thai (พิกัด, ชื่อ, ไอคอน, หน้าที่, ขาย, เสียง, เวลา). Thai users call blips "จุด", "หมุด" or "blip".',
  '- To add a blip, prefer the add_blip tool (it appends a correctly formatted block). To change an existing blip, edit the card',
  '  description with update_card and keep the same block format. A card may contain several blocks.',
].join('\n');

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : undefined);

export function createBlipAi(host) {
  return {
    guide: BLIP_GUIDE,
    tools: [
      {
        name: 'list_blips',
        description:
          'List the map blips defined in cards on this board: name, in-game coordinates, icon, card number and title, role, what it sells, NPC model, hours. ' +
          'Use query to filter by name, card title, role or sold items, and card to list one card only.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Only blips whose name, card title, role or sold items contain this text' },
            card: { type: 'integer', description: 'Only blips in this card number' },
          },
          additionalProperties: false,
        },
        describe: (a) =>
          `ดู blip บนแผนที่${a.card ? ` ในการ์ด #${a.card}` : ''}${a.query ? ` ที่มีคำว่า “${a.query}”` : ''}`,
        async run(a) {
          const { cards } = host.board();
          const auto = host.settings().autoDetect !== false;
          const q = String(a.query || '').trim().toLowerCase();
          const out = [];
          for (const card of cards) {
            if (card.archived || (a.card && card.number !== Number(a.card))) continue;
            for (const b of parseBlips(card.body, { title: card.title, autoDetect: auto }).blips) {
              const hay = `${b.name}\n${card.title}\n${b.role}\n${b.sells.join(',')}`.toLowerCase();
              if (q && !hay.includes(q)) continue;
              out.push({
                name: b.name,
                coords: formatVec(b),
                icon: b.sprite || b.icon,
                card: card.number,
                cardTitle: card.title,
                ...(b.role ? { role: b.role } : {}),
                ...(b.sells.length ? { sells: b.sells } : {}),
                ...(b.npc ? { npc: b.npc } : {}),
                ...(b.hours ? { hours: b.hours } : {}),
                ...(b.source === 'auto' ? { source: 'coordinates typed in the card (no !blip block)' } : {}),
              });
            }
          }
          return { total: out.length, shown: Math.min(out.length, LIST_LIMIT), blips: out.slice(0, LIST_LIMIT) };
        },
      },
      {
        name: 'add_blip',
        write: true,
        description:
          'Add a blip to a card by appending a correctly formatted !blip block to the end of its description. Coordinates are in-game coordinates.',
        parameters: {
          type: 'object',
          properties: {
            card: { type: 'integer', description: 'Card number to add the blip to' },
            x: { type: 'number' },
            y: { type: 'number' },
            z: { type: 'number', description: 'Height (optional)' },
            name: { type: 'string', description: 'Name shown on the map' },
            icon: { type: 'string', description: 'Short key (shop, npc, house, camp, quest, danger, info, pin) or a RedM blip sprite name like blip_shop_store' },
            role: { type: 'string', description: 'What the place is for' },
            sells: { type: 'array', items: { type: 'string' }, description: 'Items sold here' },
            sound: { type: 'string', description: 'Audio file name attached to the card, or a link' },
            note: { type: 'string' },
          },
          required: ['card', 'x', 'y', 'name'],
          additionalProperties: false,
        },
        describe: (a) => `เพิ่ม blip “${a.name || ''}” ลงการ์ด #${a.card}`,
        async run(a) {
          const card = host.board().cards.find((c) => c.number === Number(a.card));
          if (!card) throw new Error(`ไม่พบการ์ด #${a.card}`);
          const x = num(a.x);
          const y = num(a.y);
          if (x === undefined || y === undefined) throw new Error('ต้องมีพิกัด x และ y เป็นตัวเลข');
          const block = blipBlock({
            x,
            y,
            ...(num(a.z) !== undefined ? { z: num(a.z) } : {}),
            name: String(a.name || '').trim() || 'Blip',
            icon: String(a.icon || '').trim() || 'pin',
            role: String(a.role || '').trim(),
            sells: Array.isArray(a.sells) ? a.sells.map(String) : [],
            sound: String(a.sound || '').trim(),
            note: String(a.note || '').trim(),
          });
          const current = String(card.body || '').replace(/\s+$/, '');
          await host.updateCard(card.id, { body: current ? `${current}\n\n${block}\n` : `${block}\n` });
          return { ok: true, card: card.number, added: block };
        },
      },
    ],
  };
}
