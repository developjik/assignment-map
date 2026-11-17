#!/usr/bin/env node
// normalize.mjs — 기존 data/*.json 의 evidence·배열 필드를 merge.mjs 와 같은 규칙으로 정리한다.
// 수집기가 문자열 evidence 를 남긴 회차를 되돌릴 때 쓴다(멱등 — 이미 배열이면 아무것도 바꾸지 않는다).
//
// 사용:
//   node collector/normalize.mjs           # 고치고 무엇을 고쳤는지 출력
//   node collector/normalize.mjs --check   # 고칠 게 남아 있으면 exit 1 (CI 게이트용)
import fs from 'node:fs';
import path from 'node:path';
import { asEvidence, asStringArray } from './evidence.mjs';
import { dedupePostings, dedupeEvents, metaNote } from './dedupe.mjs';

const repo = path.resolve(import.meta.dirname, '..');
const check = process.argv.includes('--check');
const load = f => JSON.parse(fs.readFileSync(path.join(repo, 'data', f), 'utf8'));
const raw = f => fs.readFileSync(path.join(repo, 'data', f), 'utf8');
const save = (f, obj) => fs.writeFileSync(path.join(repo, 'data', f), JSON.stringify(obj, null, 2) + '\n');

let dirty = 0;
const report = (file, id, field, before, after) => {
  dirty++;
  console.log(` - ${file} ${id} ${field}: ${JSON.stringify(before).slice(0, 80)} → ${JSON.stringify(after).slice(0, 80)}`);
};

for (const [file, evidenceOpts] of [['postings.json', { quoteObjects: true }], ['events.json', {}]]) {
  const before = raw(file);
  const rows = JSON.parse(before);
  for (const row of rows) {
    const ev = asEvidence(row.evidence, evidenceOpts);
    if (JSON.stringify(ev) !== JSON.stringify(row.evidence)) report(file, row.id, 'evidence', row.evidence, ev);
    row.evidence = ev;
    for (const field of ['positions', 'urls_research', 'tags']) {
      if (row[field] === undefined) continue;
      const arr = asStringArray(row[field]);
      if (JSON.stringify(arr) !== JSON.stringify(row[field])) report(file, row.id, field, row[field], arr);
      row[field] = arr;
    }
    // 원문을 찾지 못한 시드 조사 기록(스펙 1-3) — null 대신 명시적 seed 표기.
    // 웹·피드·쇼츠는 'seed' 를 링크가 아니라 '원문 미확보' 로 해석한다.
    if (file === 'postings.json' && /^seed-/.test(row.id) && row.url == null) {
      report(file, row.id, 'url', row.url, 'seed');
      row.url = 'seed';
    }
  }
  // 교차 소스·재게시 중복 표시(스펙 1-2) — merge.mjs 와 같은 규칙으로 기존 데이터에 멱등 적용
  const marksBefore = new Map(rows.map((r) => [r.id, r.merged_into || null]));
  const repsBefore = new Map(rows.map((r) => [r.id, r.duplicates || null]));
  const groups = file === 'postings.json' ? dedupePostings(rows) : dedupeEvents(rows);
  for (const g of groups) {
    const changed = g.dups.some((d) => marksBefore.get(d) !== g.rep) ||
      JSON.stringify(repsBefore.get(g.rep) || null) !== JSON.stringify(g.dups);
    if (changed) report(file, g.rep, 'duplicates', '', g.dups);
  }
  const after = JSON.stringify(rows, null, 2) + '\n';
  if (!check && after !== before) save(file, rows);
}

// meta note 규칙(스펙 1-3) — 'P1 seed. daily routine not started' 허위 상태를 last_run 기준으로 고친다
{
  const before = raw('meta.json');
  const meta = JSON.parse(before);
  const note = metaNote(meta.last_run, meta.seed_date);
  if (meta.note !== note) {
    report('meta.json', 'note', 'note', meta.note, note);
    meta.note = note;
    const after = JSON.stringify(meta, null, 2) + '\n';
    if (!check && after !== before) save('meta.json', meta);
  }
}

if (check) {
  if (dirty) { console.error(`NORMALIZE CHECK FAIL — ${dirty}개 필드가 아직 정규화되지 않았다`); process.exit(1); }
  console.log('NORMALIZE CHECK OK — 정규화할 필드 없음');
} else if (dirty) {
  console.log(`NORMALIZE OK — ${dirty}개 필드 정리`);
} else {
  console.log('NORMALIZE OK — 바꿀 필드 없음');
}
