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
// 반쪽 쓰기 방지(F5): merge.mjs 와 같은 원자 쓰기 — 쓰기 도중 죽어도 data/*.json 이 잘린 채 남지 않는다.
const save = (f, obj) => {
  const tmp = path.join(repo, 'data', `.${f}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n');
  fs.renameSync(tmp, path.join(repo, 'data', f));
};

let dirty = 0;
const report = (file, id, field, before, after) => {
  dirty++;
  // 키가 없는(undefined) 레코드를 고칠 때도 크래시하지 않게 문자열로 내린다(F5) —
  // 보고 도중 죽으면 데이터는 고쳤는데 감사 로그가 반쪽으로 남는다.
  const shown = (v) => JSON.stringify(v ?? null);
  console.log(` - ${file} ${id} ${field}: ${shown(before).slice(0, 80)} → ${shown(after).slice(0, 80)}`);
};

const newMergesBy = { 'postings.json': [], 'events.json': [] };
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
  const policyBefore = new Map(rows.map((r) => [r.id, r.ai_policy]));   // 승격(F2) 가시화용
  const marksBefore = new Map(rows.map((r) => [r.id, r.merged_into || null]));
  const repsBefore = new Map(rows.map((r) => [r.id, r.duplicates || null]));
  const groups = file === 'postings.json' ? dedupePostings(rows) : dedupeEvents(rows);
  for (const g of groups) {
    const fresh = g.dups.filter((d) => marksBefore.get(d) !== g.rep);
    const changed = fresh.length > 0 ||
      JSON.stringify(repsBefore.get(g.rep) || null) !== JSON.stringify(g.dups);
    if (changed) report(file, g.rep, 'duplicates', '', g.dups);
    for (const d of fresh) newMergesBy[file].push(`${d}->${g.rep}`);
  }
  for (const r of rows)
    if (policyBefore.get(r.id) !== r.ai_policy)
      report(file, r.id, 'ai_policy', policyBefore.get(r.id), r.ai_policy);   // dup 승격도 콘솔에 보이게
  const after = JSON.stringify(rows, null, 2) + '\n';
  if (!check && after !== before) save(file, rows);
}

// normalize 경유 병합의 감사 기록(F5) — 새로 붙은 병합 표시를 changelog merged_* 에 남긴다.
// 날짜는 데이터의 마지막 런(meta.last_run): 병합 표시가 데이터에 반영된 시점의 런이다.
if (newMergesBy['postings.json'].length || newMergesBy['events.json'].length) {
  const cl = JSON.parse(raw('changelog.json'));
  const date = JSON.parse(raw('meta.json')).last_run || '';
  let entry = cl.events.find((c) => c.date === date);
  if (!entry) {
    entry = { date, new_postings: [], policy_changed: [], deadline_changed: [], status_changed: [],
      new_events: [], event_status_changed: [], event_deadline_changed: [], merged_postings: [], merged_events: [], sources: [], notes: '' };
    cl.events.push(entry);
  }
  entry.merged_postings = [...new Set([...(entry.merged_postings || []), ...newMergesBy['postings.json']])];
  entry.merged_events = [...new Set([...(entry.merged_events || []), ...newMergesBy['events.json']])];
  const cnt = (a) => (a || []).length;
  entry.summary = `+${cnt(entry.new_postings)}공고 +${cnt(entry.new_events)}이벤트 · 정책변경 ${cnt(entry.policy_changed)} · 상태변경 ${cnt(entry.status_changed) + cnt(entry.event_status_changed)} · 마감변경 ${cnt(entry.deadline_changed) + cnt(entry.event_deadline_changed)} · 중복병합 ${cnt(entry.merged_postings) + cnt(entry.merged_events)}`;
  cl.events.sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!check) save('changelog.json', cl);
  console.log(` - changelog.json ${date} merged_*: normalize 경유 병합 ${newMergesBy['postings.json'].length + newMergesBy['events.json'].length}건 감사 기록`);
  dirty++;
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
