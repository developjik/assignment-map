#!/usr/bin/env node
// validate.mjs — 골든케이스 + 스키마 무결성 검증. exit 0이어야 커밋 허용(잠금 장치).
import fs from 'node:fs';
import path from 'node:path';
const repo = path.resolve(import.meta.dirname, '..');
const read = f => JSON.parse(fs.readFileSync(path.join(repo, 'data', f), 'utf8'));
const gc = JSON.parse(fs.readFileSync(path.join(repo, 'collector', 'golden_cases.json'), 'utf8'));
let fails = [];
const check = (name, cond, msg) => { if (!cond) fails.push(`${name}: ${msg}`); };

const postings = read('postings.json'), events = read('events.json'), meta = read('meta.json');

// 스키마 무결성
const pIds = new Set(), eIds = new Set();
for (const p of postings) {
  check('postings', !!p.id && !!p.company && !!p.ai_policy, `필수필드 누락 ${p.id || JSON.stringify(p).slice(0, 60)}`);
  if (pIds.has(p.id)) fails.push(`postings: 중복 id ${p.id}`); pIds.add(p.id);
}
for (const e of events) {
  check('events', !!e.id && !!e.type && !!e.status && !!e.ai_usage, `필수필드 누락 ${e.id || '?'}`);
  if (eIds.has(e.id)) fails.push(`events: 중복 id ${e.id}`); eIds.add(e.id);
}
check('meta', meta.counts.postings === postings.length, `postings 수 불일치 meta=${meta.counts.postings} 실제=${postings.length}`);
check('meta', meta.counts.events === events.length, `events 수 불일치 meta=${meta.counts.events} 실제=${events.length}`);

// 골든케이스
for (const c of gc.postings || []) {
  const p = postings.find(x => x.id === c.id);
  if (!p) { fails.push(`GOLDEN ${c.id}: 데이터에서 실종 — 커밋 금지`); continue; }
  const E = c.expect;
  if (E.company_includes) check(`GOLDEN ${c.id}`, p.company.includes(E.company_includes), `company=${p.company}`);
  if (E.ai_policy) check(`GOLDEN ${c.id}`, p.ai_policy === E.ai_policy, `ai_policy=${p.ai_policy} (기대 ${E.ai_policy})`);
}
for (const c of gc.events || []) {
  const e = events.find(x => x.id === c.id);
  if (!e) { fails.push(`GOLDEN ${c.id}: 데이터에서 실종 — 커밋 금지`); continue; }
  const E = c.expect;
  if (E.title_includes) check(`GOLDEN ${c.id}`, (e.title || '').includes(E.title_includes), `title=${e.title}`);
  if (E.ai_usage) check(`GOLDEN ${c.id}`, e.ai_usage === E.ai_usage, `ai_usage=${e.ai_usage} (기대 ${E.ai_usage})`);
  if (E.hiring_link !== undefined) check(`GOLDEN ${c.id}`, e.hiring_link === E.hiring_link, `hiring_link=${e.hiring_link}`);
}

const goldenTotal = (gc.postings?.length || 0) + (gc.events?.length || 0);
if (fails.length) {
  console.error(`VALIDATE FAIL (${fails.length}) — 커밋 잠금`);
  for (const f of fails) console.error(' -', f);
  process.exit(1);
}
console.log(`VALIDATE OK — 골든케이스 ${goldenTotal}/${goldenTotal} · postings ${postings.length} · events ${events.length} · 무결성 통과`);
