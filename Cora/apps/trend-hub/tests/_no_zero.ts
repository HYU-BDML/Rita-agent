import fs from 'node:fs';
import { grammarsWithEvidence } from '../lib/core/grammar';
const db = JSON.parse(fs.readFileSync('data/db.json', 'utf8'));
const gs = grammarsWithEvidence(db.candidates ?? [], db.posts ?? [], '2026-09-24T00:00:00Z');
const bad = gs.flatMap((g) => g.evidence.filter((e) => e.accounts === 0).map((e) => `${g.name}/${e.subject}`));
console.log(bad.length ? '✘ 계정 0곳 카드: ' + bad.join(', ') : '✔ 계정 0곳 카드 없음');
console.log('근거 합', gs.reduce((n, g) => n + g.evidence.length, 0), '· 방식별', gs.map((g) => g.evidence.length).join('/'));
