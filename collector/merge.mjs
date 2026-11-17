#!/usr/bin/env node
// merge.mjs — run 스냅샷(runs/YYYY-MM-DD.json)을 data/*에 병합. 네트워크 없음, 결정론적.
// 사용: node collector/merge.mjs runs/2026-10-24.json
import fs from 'node:fs';
import path from 'node:path';
import { asEvidence, asStringArray } from './evidence.mjs';
import { dedupePostings, dedupeEvents, metaNote } from './dedupe.mjs';

const repo = path.resolve(import.meta.dirname, '..');
const runPath = process.argv[2];
if (!runPath) { console.error('usage: node collector/merge.mjs runs/YYYY-MM-DD.json'); process.exit(2); }
const run = JSON.parse(fs.readFileSync(runPath, 'utf8'));
const date = run.date || path.basename(runPath, '.json');
const read = f => JSON.parse(fs.readFileSync(path.join(repo, 'data', f), 'utf8'));
// 반쪽 쓰기 방지(F5): 임시 파일에 쓴 뒤 바꿔치기한다 — 쓰기 도중 크래시로 data/*.json 이
// 잘린 채 남는 경로(changelog 반쪽 쓰기)를 원자적으로 막는다.
const write = (f, obj) => {
  const tmp = path.join(repo, 'data', `.${f}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n');
  fs.renameSync(tmp, path.join(repo, 'data', f));
};
const dayDiff = (from, to) => Math.round((new Date(to) - new Date(from)) / 864e5);

// postings 의 evidence 는 { quote, field } 객체 배열, events 는 문자열 배열 (collector/evidence.mjs)
const QUOTE_OBJECTS = { quoteObjects: true };
const postingFields = inc => ({
  ...inc,
  evidence: asEvidence(inc.evidence, QUOTE_OBJECTS),
  positions: asStringArray(inc.positions),
  ...(inc.urls_research !== undefined ? { urls_research: asStringArray(inc.urls_research) } : {}),
  ...(inc.tags !== undefined ? { tags: asStringArray(inc.tags) } : {}),
});
// strings/단일 값 evidence 가 들어와도 저장 전에 배열로 — 원천 차단
const eventFields = inc => ({
  ...inc,
  evidence: asEvidence(inc.evidence),
  ...(inc.tags !== undefined ? { tags: asStringArray(inc.tags) } : {}),
});

const cadence = (deadlines, today) => {
  const ds = deadlines.filter(Boolean).sort()[0];
  if (!ds) return 'weekly';
  const d = dayDiff(today, ds);
  if (d < 0) return 'archive_candidate';
  if (d <= 14) return 'daily';
  return 'weekly';
};
const S = { date, new_postings: [], policy_changed: [], deadline_changed: [], status_changed: [], new_events: [], event_status_changed: [], event_deadline_changed: [], updated_postings: 0, updated_events: 0, merged_postings: [], merged_events: [], sources: run.sources || [], notes: run.notes || '' };

// 병합 표시가 붙은 id 로 갱신이 들어오면 대표행에게 적용한다(merge 가 dedupe 를 매번
// 다시 계산하므로, 숨겨진 중복 행이 스크린 대표행보다 새로워지는 일을 막는다)
const resolveTarget = (byId, id) => {
  const direct = byId.get(id);
  if (!direct || !direct.merged_into) return direct;
  return byId.get(direct.merged_into) || direct;
};

// ---- postings ----
const postings = read('postings.json');
const pById = new Map(postings.map(p => [p.id, p]));
for (const inc of run.postings || []) {
  if (!inc.id) continue;
  const ex = resolveTarget(pById, inc.id);
  const fields = postingFields(inc);
  if (!ex) {
    pById.set(inc.id, { ...fields, first_seen: date, last_seen: date, last_checked: date,
      check_cadence: cadence([inc.deadline], date), review: inc.review || 'auto',
      history: [{ date, event: 'created', ai_policy: inc.ai_policy }] });
    S.new_postings.push(inc.id); continue;
  }
  const hist = [...(ex.history || [])];
  if (inc.ai_policy && inc.ai_policy !== ex.ai_policy) {
    hist.push({ date, event: 'policy_changed', from: ex.ai_policy, to: inc.ai_policy, evidence: fields.evidence[0]?.quote || '' });
    ex.ai_policy = inc.ai_policy; S.policy_changed.push(ex.id);
  }
  if (inc.deadline && inc.deadline !== ex.deadline) {
    hist.push({ date, event: 'deadline_changed', from: ex.deadline, to: inc.deadline });
    ex.deadline = inc.deadline; S.deadline_changed.push(ex.id);
  }
  if (inc.status && inc.status !== ex.status) {
    hist.push({ date, event: 'status_changed', from: ex.status, to: inc.status });
    ex.status = inc.status; S.status_changed.push(ex.id);
  }
  ex.history = hist; ex.last_seen = date; ex.last_checked = date;
  if (fields.evidence.length) ex.evidence = fields.evidence;
  if (inc.positions !== undefined) ex.positions = fields.positions;
  if (inc.url) ex.url = inc.url;
  S.updated_postings++;
}
const mergedPostings = [...pById.values()];
// 기존 레코드에 남아 있는 문자열 evidence 도 이번 병합에서 배열로 정리한다(멱등)
for (const p of mergedPostings) {
  p.evidence = asEvidence(p.evidence, QUOTE_OBJECTS);
  p.positions = asStringArray(p.positions);
  if (p.urls_research !== undefined) p.urls_research = asStringArray(p.urls_research);
  if (p.tags !== undefined) p.tags = asStringArray(p.tags);
}
for (const p of mergedPostings) p.check_cadence = (p.status === 'closed' || p.status === 'gone' || p.status === 'no_hiring') ? 'none' : cadence([p.deadline], date);
// 교차 소스·재게시 중복 제거(스펙 1-2) — 병합 로직은 merge 안에 산다: 매일 루틴이 이 파일을 쓴다.
// changelog 에는 이번에 새로 붙은 병합 표시만 남긴다(F5): 이미 병합된 그룹이 매일
// '중복병합'으로 재기록되는 노이즈를 끊는다.
const newMerges = (rows, dedupe) => {
  const marksBefore = new Map(rows.map((r) => [r.id, r.merged_into || null]));
  const fresh = [];
  for (const g of dedupe(rows))
    for (const d of g.dups) if (marksBefore.get(d) !== g.rep) fresh.push(`${d}->${g.rep}`);
  return fresh;
};
S.merged_postings = newMerges(mergedPostings, dedupePostings);
write('postings.json', mergedPostings);

// ---- events ----
const events = read('events.json');
const eById = new Map(events.map(e => [e.id, e]));
for (const inc of run.events || []) {
  if (!inc.id) continue;
  const ex = resolveTarget(eById, inc.id);
  const fields = eventFields(inc);
  if (!ex) {
    eById.set(inc.id, { ...fields, first_seen: date, last_checked: date,
      check_cadence: cadence([inc.apply_deadline, inc.submit_deadline], date), review: inc.review || 'auto',
      history: [{ date, event: 'created', status: inc.status }] });
    S.new_events.push(inc.id); continue;
  }
  const hist = [...(ex.history || [])];
  if (inc.status && inc.status !== ex.status) {
    hist.push({ date, event: 'status_changed', from: ex.status, to: inc.status });
    ex.status = inc.status; S.event_status_changed.push(ex.id);
  }
  if (inc.hiring_link !== undefined && inc.hiring_link !== ex.hiring_link) {
    hist.push({ date, event: 'hiring_link_changed', from: ex.hiring_link, to: inc.hiring_link });
    ex.hiring_link = inc.hiring_link;
  }
  for (const f of ['apply_deadline', 'submit_deadline'])
    if (inc[f] && inc[f] !== ex[f]) {
      hist.push({ date, event: 'deadline_changed', field: f, from: ex[f], to: inc[f] });
      ex[f] = inc[f]; S.event_deadline_changed.push(ex.id);
    }
  for (const f of ['result_date', 'prize', 'title', 'url'])
    if (inc[f] !== undefined && inc[f] !== null) ex[f] = inc[f];
  if (fields.evidence.length) ex.evidence = fields.evidence;
  ex.history = hist; ex.last_checked = date;
  S.updated_events++;
}
const mergedEvents = [...eById.values()];
for (const e of mergedEvents) e.evidence = asEvidence(e.evidence);   // 레거시 문자열 정리(멱등)
for (const e of mergedEvents) e.check_cadence = e.status === 'closed' ? 'none' : cadence([e.apply_deadline, e.submit_deadline], date);
S.merged_events = newMerges(mergedEvents, dedupeEvents);
write('events.json', mergedEvents);

// ---- changelog / meta ----
const cl = read('changelog.json');
// 같은 날짜 재병합은 발견·변경 기록을 지우지 않는다(멱등) — 첫 병합의 new/changed 목록을 이어 받는다
const prevSameDay = cl.events.find(c => c.date === date) || null;
const unionIds = (prev, now) => [...new Set([...(prev || []), ...(now || [])])];
if (prevSameDay) {
  for (const f of ['new_postings', 'new_events', 'policy_changed', 'deadline_changed', 'status_changed', 'event_status_changed', 'event_deadline_changed', 'merged_postings', 'merged_events'])
    S[f] = unionIds(prevSameDay[f], S[f]);
  // 카운터는 정보성 — 재실행이 첫 병합의 실측을 덮어쓰지 않게 한다
  S.updated_postings = prevSameDay.updated_postings ?? S.updated_postings;
  S.updated_events = prevSameDay.updated_events ?? S.updated_events;
  // sources·notes 는 같은 날 재병합에서 유실되지 않게 이어 받는다(F5) — 첫 런의 감사
  // 기록이 빈 run 파일의 재실행으로 지워지는 공백을 막는다.
  for (const s of prevSameDay.sources || [])
    if (!S.sources.some((x) => x.id === s.id)) S.sources.push(s);
  if (!S.notes && prevSameDay.notes) S.notes = prevSameDay.notes;
}
cl.events = cl.events.filter(c => c.date !== date);
cl.events.push({ date, ...S,
  summary: `+${S.new_postings.length}공고 +${S.new_events.length}이벤트 · 정책변경 ${S.policy_changed.length} · 상태변경 ${S.status_changed.length + S.event_status_changed.length} · 마감변경 ${S.deadline_changed.length + S.event_deadline_changed.length} · 중복병합 ${S.merged_postings.length + S.merged_events.length}` });
cl.events.sort((a, b) => a.date < b.date ? -1 : 1);
write('changelog.json', cl);

const meta = read('meta.json');
meta.last_run = date;
meta.counts = { platforms: meta.counts.platforms, postings: mergedPostings.length, news: meta.counts.news, events: mergedEvents.length };
meta.note = metaNote(date, meta.seed_date);   // 허위 상태 고침(스펙 1-3) — last_run 에서 파생
meta.events_breakdown = {
  status: Object.fromEntries([...new Set(mergedEvents.map(e => e.status))].map(s => [s, mergedEvents.filter(e => e.status === s).length])),
  hiring_link: mergedEvents.filter(e => e.hiring_link).length,
};
write('meta.json', meta);

console.log(JSON.stringify(S, null, 2));
