#!/usr/bin/env node
// Cora local MCP server over stdio (newline-delimited JSON-RPC 2.0). Read-only tools backed by Cora's REST API.
// Env: CORA_API_KEY (personal key, cora_...) and CORA_BASE_URL (for example http://127.0.0.1:3000). No dependencies.
// Spec followed: MCP 2026-07-28 (latest, per-request _meta, server/discover) and 2025-11-25 (initialize handshake),
// verified against https://modelcontextprotocol.io/specification on 2026-09-30. Legacy 2025-06-18, 2025-03-26 and 2024-11-05 are echoed on initialize (same tools/list and tools/call shapes).
import { createInterface } from 'node:readline';

const MODERN = '2026-07-28';
const LEGACY = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER_INFO = { name: 'cora-mcp', title: 'Cora (read-only)', version: '0.1.0' };
const META = 'io.modelcontextprotocol/';
const ID_RE = /^[A-Za-z0-9-]{1,80}$/;
const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const idSchema = { type: 'object', properties: { id: { type: 'string', description: 'Cora project id from list_projects' } }, required: ['id'], additionalProperties: false };
export const TOOLS = [
  { name: 'get_project', title: 'Get project', description: 'Read one Cora project (cards, design, caption, version). Card photos are reported as hasImage only.', inputSchema: idSchema, annotations: readOnly },
  { name: 'list_assets', title: 'List assets', description: 'List the card photos of one Cora project (card number, mime type, byte size). No image bytes.', inputSchema: idSchema, annotations: readOnly },
  { name: 'list_projects', title: 'List projects', description: 'List the API key owner\'s Cora projects (id, brand, title, card count, work status, updated time).', inputSchema: { type: 'object', additionalProperties: false }, annotations: readOnly },
];
const base = () => (process.env.CORA_BASE_URL || '').replace(/\/+$/, '');
async function api(path) {
  const key = process.env.CORA_API_KEY || '', root = base();
  if (!key || !root) throw new Error('CORA_API_KEY and CORA_BASE_URL must be set in the MCP server environment.');
  let res;
  try { res = await fetch(root + path, { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) }); }
  catch (e) { throw new Error(`Cora is not reachable at ${root}: ${e.message}`); }
  const text = await res.text(); let body; try { body = JSON.parse(text); } catch { body = null; }
  if (!res.ok) throw new Error(`Cora API ${res.status}: ${body?.error ?? text.slice(0, 200)}`);
  if (!body) throw new Error('Cora API returned a non-JSON response.');
  return body;
}
const handlers = {
  list_projects: async () => api('/api/v1/projects'),
  get_project: async a => api('/api/v1/platform-project?id=' + encodeURIComponent(a.id)),
  list_assets: async a => api('/api/v1/platform-assets?id=' + encodeURIComponent(a.id)),
};
const ok = (id, result, modern) => ({ jsonrpc: '2.0', id, result: modern ? { resultType: 'complete', ...result } : result });
const err = (id, code, message, data) => ({ jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } });
export async function handle(msg) {
  if (Array.isArray(msg) || !msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return err(msg && msg.id !== undefined ? msg.id : null, -32600, 'Invalid Request');
  const isNote = msg.id === undefined || msg.id === null;
  const p = msg.params && typeof msg.params === 'object' ? msg.params : {};
  const requested = p._meta?.[META + 'protocolVersion'];
  const modern = requested !== undefined;
  if (isNote) return null; // notifications (initialized, cancelled) need no reply
  if (modern && requested !== MODERN) return err(msg.id, -32022, 'Unsupported protocol version', { supported: [MODERN, ...LEGACY.slice(0, 1)], requested });
  switch (msg.method) {
    case 'initialize': {
      const v = typeof p.protocolVersion === 'string' && LEGACY.includes(p.protocolVersion) ? p.protocolVersion : LEGACY[0];
      return ok(msg.id, { protocolVersion: v, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: 'Read-only access to your Cora projects. Use list_projects first, then get_project or list_assets with an id.' }, false);
    }
    case 'server/discover':
      return ok(msg.id, { supportedVersions: [MODERN, LEGACY[0]], capabilities: { tools: { listChanged: false } }, _meta: { [META + 'serverInfo']: SERVER_INFO }, instructions: 'Read-only access to your Cora projects.' }, true);
    case 'ping': return ok(msg.id, {}, modern);
    case 'tools/list': return ok(msg.id, { tools: TOOLS }, modern);
    case 'tools/call': {
      const tool = TOOLS.find(t => t.name === p.name);
      if (!tool) return err(msg.id, -32602, `Unknown tool: ${String(p.name).slice(0, 80)}`);
      const args = p.arguments && typeof p.arguments === 'object' && !Array.isArray(p.arguments) ? p.arguments : {};
      try {
        if (tool.name !== 'list_projects' && (typeof args.id !== 'string' || !ID_RE.test(args.id))) throw new Error('Argument "id" must be a Cora project id (letters, digits, hyphen).');
        const data = await handlers[tool.name](args);
        return ok(msg.id, { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data, isError: false }, modern);
      } catch (e) { return ok(msg.id, { content: [{ type: 'text', text: String(e.message).slice(0, 1000) }], isError: true }, modern); }
    }
    default: return err(msg.id, -32601, `Method not found: ${msg.method.slice(0, 80)}`);
  }
}
export function serve(input = process.stdin, output = process.stdout) {
  const rl = createInterface({ input, crlfDelay: Infinity }); const pending = new Set();
  rl.on('line', line => {
    if (!line.trim()) return;
    let msg; try { msg = JSON.parse(line); } catch { output.write(JSON.stringify(err(null, -32700, 'Parse error')) + '\n'); return; }
    const job = handle(msg).then(r => { if (r) output.write(JSON.stringify(r) + '\n'); }, e => { process.stderr.write(`internal error: ${e?.message}\n`); if (msg?.id !== undefined) output.write(JSON.stringify(err(msg.id, -32603, 'Internal error')) + '\n'); }).finally(() => pending.delete(job));
    pending.add(job);
  });
  return new Promise(resolve => rl.on('close', () => Promise.all(pending).then(resolve)));
}
import { fileURLToPath } from 'node:url';
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) serve().then(() => process.exit(0));
