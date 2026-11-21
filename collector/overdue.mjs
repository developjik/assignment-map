#!/usr/bin/env node
// overdue.mjs — 재방문 케이던스 감사. "리스트 스윕으로 확인됐다"는 기록(run.checked)이
// last_checked 로 남는 순간부터, 이 스크립트가 '진짜 방치' 목록을 기계적으로 뽑아준다.
// 2026-11-21 실측 계기: open 공고 38건 중 31건(82%)이 케이던스 초과로 보였으나 실제로는
// 위비티 배지 스윕·잡코리아 검색 노출로 생존 확인 중 — 확인이 기록으로 안 남아 구분 불가였다.
//
// 사용:
//   node collector/overdue.mjs                     # 사람이 읽는 요약 (기준일 = meta.last_run)
//   node collector/overdue.mjs --today 2026-11-22  # 기준일 지정
//   node collector/overdue.mjs --json              # 전체 목록 JSON
//
// exit 0 고정(정보성). 리스트 커버 밖(detail-needed) 초과는 우선 재방문 대상이다.
import fs from 'node:fs';
import path from 'node:path';
import { sourceFamily, LIST_COVERED } from './sources_family.mjs';

const repo = path.resolve(import.meta.dirname, '..');
const read = f => JSON.parse(fs.readFileSync(path.join(repo, 'data', f), 'utf8'));
const args = process.argv.slice(2);
const todayFlag = args.indexOf('--today');
const today = todayFlag !== -1 && args[todayFlag + 1] ? args[todayFlag + 1] : read('meta.json').last_run;
const asJson = args.includes('--json');

const LIMIT = { daily: 1, every2d: 2, every3d: 3, weekly: 7 };   // archive_candidate 등 미지정 = 7
const dayDiff = (from, to) => Math.round((new Date(to) - new Date(from)) / 864e5);

const audit = rows => rows
  .filter(r => !r.merged_into && (r.check_cadence || 'none') !== 'none' && r.status !== 'closed' && r.status !== 'gone')
  .map(r => ({
    id: r.id,
    source: sourceFamily(r.source),
    cadence: r.check_cadence,
    days_unchecked: dayDiff(r.last_checked || r.first_seen || today, today),
    detail_needed: !LIST_COVERED.test(sourceFamily(r.source)),
    url: (!r.url || r.url === 'seed') ? null : r.url,
  }))
  .filter(r => r.days_unchecked > (LIMIT[r.cadence] ?? 7))
  .sort((a, b) => b.days_unchecked - a.days_unchecked || (b.detail_needed - a.detail_needed));

const postings = audit(read('postings.json'));
const events = audit(read('events.json'));
const tally = list => ({
  총: list.length,
  detail_needed: list.filter(x => x.detail_needed).length,
  list_covered: list.filter(x => !x.detail_needed).length,
});
const result = { today, postings: { ...tally(postings), items: postings }, events: { ...tally(events), items: events } };

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`OVERDUE 감사 (기준일 ${today}, meta.last_run 기본)`);
  console.log(`- postings: 초과 ${postings.length}건 (상세필요 ${tally(postings).detail_needed} · 리스트커버 ${tally(postings).list_covered})`);
  for (const p of postings.filter(x => x.detail_needed).slice(0, 12))
    console.log(`    [상세] ${p.id} ${p.cadence} ${p.days_unchecked}일째 ${p.url || ''}`);
  console.log(`- events  : 초과 ${events.length}건 (상세필요 ${tally(events).detail_needed} · 리스트커버 ${tally(events).list_covered})`);
  for (const e of events.filter(x => x.detail_needed).slice(0, 8))
    console.log(`    [상세] ${e.id} ${e.cadence} ${e.days_unchecked}일째 ${e.url || ''}`);
  const top = postings.filter(x => !x.detail_needed).slice(0, 5);
  if (top.length) console.log(`- 리스트커버 상위(스윕 결과 run.checked 로 기록하면 해소): ${top.map(p => `${p.id} ${p.days_unchecked}일`).join(' · ')}`);
  console.log('전체 목록은 --json');
}
