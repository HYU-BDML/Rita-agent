import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signV4, putPublic, mediaConfig } from '../lib/cora/media-store';
import { InstagramAdapter, validateInstagramInput } from '../lib/cora/publishing/instagram';

test('SigV4 signer matches the AWS documented example (GET object with Range)', () => {
  const auth = signV4({ method: 'GET', url: 'https://examplebucket.s3.amazonaws.com/test.txt', payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    headers: { host: 'examplebucket.s3.amazonaws.com', range: 'bytes=0-9', 'x-amz-content-sha256': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'x-amz-date': '20130524T000000Z' },
    accessKey: 'AKIAIOSFODNN7EXAMPLE', secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', region: 'us-east-1', service: 's3', amzDate: '20130524T000000Z' });
  assert.equal(auth, 'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41');
});

test('Public media upload: signed PUT to the bucket, public URL returned, only JPEG/MP4/MOV, missing settings named', async () => {
  const env = { CORA_S3_ENDPOINT: 'https://acc123.r2.cloudflarestorage.com', CORA_S3_BUCKET: 'cora-media', CORA_S3_ACCESS_KEY: 'AK', CORA_S3_SECRET_KEY: 'SK', CORA_S3_PUBLIC_BASE: 'https://media.example.test' };
  let seen: { url: string; init: RequestInit } | null = null;
  const ok = (async (url: string, init: RequestInit) => { seen = { url, init }; return new Response('', { status: 200 }); }) as unknown as typeof fetch;
  const r = await putPublic(new Uint8Array([1, 2, 3]), 'mp4', env, ok, new Date('2026-10-03T12:00:00Z'));
  assert.match(r.url, /^https:\/\/media\.example\.test\/cora\/2026-10-03\/[0-9a-f-]{36}\.mp4$/); assert.equal(r.contentType, 'video/mp4');
  const s = seen as unknown as { url: string; init: RequestInit }; assert.equal(s.init.method, 'PUT'); assert.match(s.url, /^https:\/\/acc123\.r2\.cloudflarestorage\.com\/cora-media\/cora\/2026-10-03\//);
  const h = s.init.headers as Record<string, string>; assert.match(h.Authorization, /^AWS4-HMAC-SHA256 Credential=AK\/20261003\/auto\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(h).includes('SK'), 'secret never sent');
  await assert.rejects(putPublic(new Uint8Array([1]), 'png', env, ok), /JPEG, MP4, MOV/);
  await assert.rejects(putPublic(new Uint8Array([1]), 'jpg', env, (async () => new Response('', { status: 403 })) as unknown as typeof fetch), /HTTP 403/);
  assert.deepEqual(mediaConfig({}).missing.length, 5);
  await assert.rejects(putPublic(new Uint8Array([1]), 'jpg', {}, ok), /CORA_S3_ENDPOINT/);
});

test('Instagram Reels: one public MP4/MOV, no images, REELS container; processing stays submitted until FINISHED', async () => {
  const base = { igUserId: '1784', caption: '릴스 캡션', imageUrls: [] as string[] };
  assert.ok(validateInstagramInput({ ...base, videoUrl: 'https://media.example.test/a.mp4' }));
  assert.throws(() => validateInstagramInput({ ...base, videoUrl: 'https://media.example.test/a.gif' }), /MP4 또는 MOV/);
  assert.throws(() => validateInstagramInput({ ...base, videoUrl: 'http://media.example.test/a.mp4' }), /공개 HTTPS/);
  assert.throws(() => validateInstagramInput({ ...base, imageUrls: ['https://x.test/a.jpg'], videoUrl: 'https://media.example.test/a.mp4' }), /영상 하나만/);
  const calls: { url: string; body: string }[] = []; let status = 'IN_PROGRESS';
  const t = (async (url: string, init: RequestInit) => { calls.push({ url, body: String(init.body ?? '') }); const u = new URL(url);
    if (u.pathname.endsWith('/media')) return new Response(JSON.stringify({ id: '555' }), { status: 200 });
    if (u.pathname.endsWith('/555')) return new Response(JSON.stringify({ status_code: status }), { status: 200 });
    if (u.pathname.endsWith('/media_publish')) return new Response(JSON.stringify({ id: '777' }), { status: 200 });
    if (u.pathname.endsWith('/777')) return new Response(JSON.stringify({ permalink: 'https://www.instagram.com/reel/abc/' }), { status: 200 });
    return new Response('{}', { status: 404 }); }) as unknown as typeof fetch;
  const a = new InstagramAdapter('T', t);
  const sub = await a.submit({ ...base, videoUrl: 'https://media.example.test/a.mp4' });
  assert.deepEqual(sub, { state: 'submitted', submissionId: '1784_555' });
  const form = new URLSearchParams(calls[0].body); assert.equal(form.get('media_type'), 'REELS'); assert.equal(form.get('video_url'), 'https://media.example.test/a.mp4');
  assert.equal((await a.status('1784_555')).state, 'submitted', 'video still processing');
  status = 'FINISHED'; const done = await a.status('1784_555'); assert.equal(done.state, 'published'); assert.equal(done.publicUrl, 'https://www.instagram.com/reel/abc/');
});
