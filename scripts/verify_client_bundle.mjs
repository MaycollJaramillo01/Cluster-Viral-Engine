import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const names = ['DATABASE_URL', 'AUTH_DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'BETTER_AUTH_SECRET'];
const values = new Map(names.filter(name => process.env[name]).map(name => [name, process.env[name]]));
try {
  const env = await fs.readFile(path.join(root, 'apps/web/.env.local'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (names.includes(line.slice(0, i))) values.set(line.slice(0, i), line.slice(i + 1));
  }
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const secrets = [...values.values()].filter(value => value && value.length >= 20);
for (const value of [...secrets]) {
  try { const password = decodeURIComponent(new URL(value).password); if (password.length >= 16) secrets.push(password); } catch { /* Not a URL. */ }
}
let files = 0;
async function inspect(folder) {
  for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) { await inspect(file); continue; }
    if (!entry.name.endsWith('.js')) continue;
    files++;
    const content = await fs.readFile(file, 'utf8');
    if (secrets.some(value => content.includes(value)) || /process\.env\.(?:AUTH_DATABASE_URL|DATABASE_URL|BETTER_AUTH_SECRET)\b/.test(content)) throw new Error('SERVER_CREDENTIAL_IN_CLIENT_BUNDLE');
  }
}
await inspect(path.join(root, 'apps/web/.next/static'));
if (!files) throw new Error('NO_CLIENT_BUNDLE_FOUND');
console.log(JSON.stringify({ status: 'PASS', client_js_files: files, configured_secret_values_checked: secrets.length, secret_values_printed: false }));
