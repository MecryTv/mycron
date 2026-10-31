// Teilen des Live-Boards im lokalen Netzwerk: dauerhafte Schlüssel für Lese- und Bearbeitungslinks.
// Die Schlüssel liegen in .works/share.json (nicht im Repo) und überleben Neustarts und Updates des Servers.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { worksDir, readJson, writeJson } from './lib.mjs';
import { ensureGitignore } from './server-control.mjs';

const newKey = () => crypto.randomBytes(18).toString('base64url');

export function shareFile(root) { return path.join(worksDir(root), 'share.json'); }

export function shareKeys(root, { create = true } = {}) {
  const file = shareFile(root);
  let k = readJson(file, null);
  if ((!k || !k.view || !k.owner) && create) {
    k = { view: newKey(), owner: newKey(), created: new Date().toISOString() };
    ensureGitignore(root, ['share.json']);
    writeJson(file, k);
    try { fs.chmodSync(file, 0o600); } catch { /* Windows */ }
  }
  return k;
}

export function rotateKeys(root) {
  try { fs.unlinkSync(shareFile(root)); } catch { /* nicht vorhanden */ }
  return shareKeys(root);
}

// IPv4-Adressen im lokalen Netz, ohne Loopback und ohne typische virtuelle Adapter.
export function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    if (/^(docker|br-|veth|virbr|vmnet|vboxnet|utun|tailscale|zt)/i.test(name)) continue;
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal) out.push({ name, address: a.address });
    }
  }
  return out;
}

export function shareLinks(root, port) {
  const k = shareKeys(root);
  return lanAddresses().map((a) => ({
    name: a.name,
    address: a.address,
    view: `http://${a.address}:${port}/?view=${k.view}`,
    edit: `http://${a.address}:${port}/?key=${k.owner}`,
  }));
}
