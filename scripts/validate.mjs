/**
 * ตรวจคลังปลั๊กอินก่อน merge: registry.json ตรงกับ manifest ของแต่ละตัว และไฟล์ที่ประกาศไว้มีอยู่จริง
 * ใช้กฎเดียวกับที่ Tanva Kanban ใช้ตอนติดตั้ง
 *   node scripts/validate.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ID = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const CODE = /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,80}\.(?:js|mjs|css)$/;
const ASSET = /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,80}\.(?:js|mjs|css|json|svg|png|jpe?g|webp|gif|md)$/i;
const MAX_FILE = 2 * 1024 * 1024;
const MAX_TOTAL = 10 * 1024 * 1024;

const errors = [];
const fail = (msg) => errors.push(msg);

const registry = JSON.parse(await fs.readFile(path.join(root, 'registry.json'), 'utf8'));
if (!Array.isArray(registry.plugins)) fail('registry.json: "plugins" must be an array');

const seen = new Set();
for (const entry of registry.plugins || []) {
  const where = `registry.json → ${entry.id || '(no id)'}`;
  if (!ID.test(String(entry.id || ''))) {
    fail(`${where}: "id" may only contain a-z 0-9 _ - (max 40 characters)`);
    continue;
  }
  if (seen.has(entry.id)) fail(`${where}: duplicate id`);
  seen.add(entry.id);

  const dir = String(entry.path || `plugins/${entry.id}`);
  if (dir.split('/').includes('..')) fail(`${where}: "path" must stay inside the repository`);
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(path.join(root, dir, 'manifest.json'), 'utf8'));
  } catch (err) {
    fail(`${where}: cannot read ${dir}/manifest.json (${err.message})`);
    continue;
  }
  if (manifest.id !== entry.id) fail(`${where}: manifest id "${manifest.id}" does not match`);
  if (manifest.version !== entry.version) {
    fail(`${where}: version in registry (${entry.version}) and manifest (${manifest.version}) differ`);
  }
  const entryFile = manifest.entry || 'index.js';
  if (!CODE.test(entryFile)) fail(`${where}: "entry" must be a .js file in the plugin folder`);
  for (const f of manifest.styles || []) if (!CODE.test(f)) fail(`${where}: bad style file name "${f}"`);
  for (const f of manifest.files || []) if (!ASSET.test(f)) fail(`${where}: bad file name "${f}" (no sub-folders)`);

  let total = 0;
  for (const f of new Set(['manifest.json', entryFile, ...(manifest.styles || []), ...(manifest.files || [])])) {
    try {
      const { size } = await fs.stat(path.join(root, dir, f));
      if (size > MAX_FILE) fail(`${where}: ${f} is larger than 2 MB`);
      total += size;
    } catch {
      fail(`${where}: listed file "${f}" does not exist`);
    }
  }
  if (total > MAX_TOTAL) fail(`${where}: plugin is larger than 10 MB`);

  // import ภายในปลั๊กอินต้องอยู่ในรายการไฟล์ ไม่งั้นติดตั้งแล้วจะหาไฟล์ไม่เจอ
  const listed = new Set([entryFile, ...(manifest.files || [])]);
  for (const f of listed) {
    if (!/\.m?js$/.test(f)) continue;
    const src = await fs.readFile(path.join(root, dir, f), 'utf8').catch(() => '');
    for (const m of src.matchAll(/\bfrom\s+['"]\.\/([^'"]+)['"]/g)) {
      if (!listed.has(m[1])) fail(`${where}: ${f} imports "./${m[1]}" but it is not listed in "files"`);
    }
  }
}

if (errors.length) {
  console.error(`Registry check failed (${errors.length}):\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log(`Registry OK — ${seen.size} plugin(s)`);
