import { createHash, createHmac, randomUUID } from 'node:crypto';

/**
 * Public media hosting on an S3-compatible bucket (Cloudflare R2 or AWS S3) so Instagram can download
 * images and Reels from a public HTTPS URL. Uploads use AWS Signature Version 4 (region 'auto' for R2).
 * Settings (names only; values live in ~/.config/cora/secrets.env): CORA_S3_ENDPOINT, CORA_S3_BUCKET,
 * CORA_S3_ACCESS_KEY, CORA_S3_SECRET_KEY, CORA_S3_PUBLIC_BASE, optional CORA_S3_REGION (default 'auto').
 */
const sha256 = (v: string | Uint8Array) => createHash('sha256').update(v).digest('hex');
const hmac = (k: string | Buffer, v: string) => createHmac('sha256', k).update(v).digest();
// RFC 3986 encoding as required by SigV4 (encodeURIComponent leaves !'()* unescaped).
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());

export type SignInput = { method: string; url: string; headers: Record<string, string>; payloadHash: string; accessKey: string; secretKey: string; region: string; service: string; amzDate: string };
/** Returns the Authorization header value. `headers` must already contain host, x-amz-date and x-amz-content-sha256. */
export function signV4(i: SignInput) {
  const u = new URL(i.url); const date = i.amzDate.slice(0, 8);
  const path = u.pathname.split('/').map(seg => enc(decodeURIComponent(seg))).join('/') || '/';
  const query = [...u.searchParams.entries()].map(([k, v]) => [enc(k), enc(v)]).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1).map(([k, v]) => `${k}=${v}`).join('&');
  const names = Object.keys(i.headers).map(h => h.toLowerCase()).sort();
  const lower = Object.fromEntries(Object.entries(i.headers).map(([k, v]) => [k.toLowerCase(), String(v).trim().replace(/\s+/g, ' ')]));
  const canonical = [i.method, path, query, names.map(n => `${n}:${lower[n]}\n`).join(''), names.join(';'), i.payloadHash].join('\n');
  const scope = `${date}/${i.region}/${i.service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', i.amzDate, scope, sha256(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${i.secretKey}`, date), i.region), i.service), 'aws4_request');
  return `AWS4-HMAC-SHA256 Credential=${i.accessKey}/${scope}, SignedHeaders=${names.join(';')}, Signature=${createHmac('sha256', key).update(toSign).digest('hex')}`;
}

type Env = Record<string, string | undefined>;
export const MEDIA_ENV = ['CORA_S3_ENDPOINT', 'CORA_S3_BUCKET', 'CORA_S3_ACCESS_KEY', 'CORA_S3_SECRET_KEY', 'CORA_S3_PUBLIC_BASE'] as const;
const TYPES: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', mp4: 'video/mp4', mov: 'video/quicktime' };
export function mediaConfig(env: Env = process.env) { const missing = MEDIA_ENV.filter(k => !env[k]?.trim()); return { configured: !missing.length, missing }; }

/** Uploads bytes and returns the public HTTPS URL Instagram will fetch. Only JPEG, MP4 and MOV are accepted (Instagram's publishable types). */
export async function putPublic(bytes: Uint8Array, ext: string, env: Env = process.env, transport: typeof fetch = fetch, now = new Date()) {
  const c = mediaConfig(env); if (!c.configured) throw Object.assign(new Error(`공개 저장소 설정이 없습니다: ${c.missing.join(', ')}`), { status: 503 });
  const type = TYPES[ext.toLowerCase()]; if (!type) throw new Error('JPEG, MP4, MOV 파일만 공개 저장소에 올립니다.');
  if (!bytes.length || bytes.length > 300 * 1024 * 1024) throw new Error('파일 크기는 1바이트~300MB입니다.');
  const endpoint = new URL(env.CORA_S3_ENDPOINT!); if (endpoint.protocol !== 'https:') throw new Error('저장소 주소는 https여야 합니다.');
  const pub = new URL(env.CORA_S3_PUBLIC_BASE!); if (pub.protocol !== 'https:') throw new Error('공개 주소는 https여야 합니다.');
  const key = `cora/${now.toISOString().slice(0, 10)}/${randomUUID()}.${ext.toLowerCase()}`;
  const url = `${endpoint.origin}/${env.CORA_S3_BUCKET}/${key}`;
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const payloadHash = sha256(bytes);
  const headers: Record<string, string> = { host: endpoint.host, 'content-type': type, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  const authorization = signV4({ method: 'PUT', url, headers, payloadHash, accessKey: env.CORA_S3_ACCESS_KEY!, secretKey: env.CORA_S3_SECRET_KEY!, region: env.CORA_S3_REGION || 'auto', service: 's3', amzDate });
  const { host: _host, ...sendHeaders } = headers; void _host;
  const r = await transport(url, { method: 'PUT', headers: { ...sendHeaders, Authorization: authorization }, body: bytes, redirect: 'error', signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw Object.assign(new Error(`공개 저장소 업로드 실패(HTTP ${r.status})`), { status: 502 });
  return { key, url: `${pub.origin}${pub.pathname.replace(/\/$/, '')}/${key}`, contentType: type, size: bytes.length };
}
