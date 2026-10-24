#!/usr/bin/env node
// merge.mjs — run 스냅샷(runs/YYYY-MM-DD.json)을 data/*에 병합. 네트워크 없음, 결정론적.
// 사용: node collector/merge.mjs runs/2026-10-24.json
import fs from 'node:fs';
import path from 'node:path';

const repo = path.resolve(import.meta.dirname, '..');
const runPath = process.argv[2];
if (!runPath) { console.error('usage: node collector/merge.mjs runs/YYYY-MM-DD.json'); process.exit(2); }
const run = JSON.parse(fs.readFileSync(runPath, 'utf8'));
const date = run.date || path.basename(runPath, '.json');
const read = f => JSON.parse(fs.readFileSync(path.join(repo, 'data', f), 'utf8'));
const write = (f, obj) => fs.writeFileSync(path.join(repo, 'data', f), JSON.stringify(obj, null, 2) + '\n');
const dayDiff = (from, to) => Math.round((new Date(to) - new Date(from)) / 864e5);

const cadence = (deadlines, today) => {
  const ds = deadlines.filter(Boolean).sort()[0];
  if (!ds) return 'weekly';
  const d = dayDiff(today, ds);
  if (d < 0) return 'archive_candidate';
  if (d <= 14) return 'daily';
  return 'weekly';
};
const S = { date, new_postings: [], policy_changed: [], deadline_changed: [], status_changed: [], new_events: [], event_status_changed: [], event_deadline_changed: [], updated_postings: 0, updated_events: 0, sources: run.sources || [], notes: run.notes || '' };

// ---- postings ----
const postings = read('postings.json');
const pById = new Map(postings.map(p => [p.id, p]));
for (const inc of run.postings || []) {
  if (!inc.id) continue;
  const ex = pById.get(inc.id);
  if (!ex) {
    pById.set(inc.id, { ...inc, first_seen: date, last_seen: date, last_checked: date,
      check_cadence: cadence([inc.deadline], date), review: inc.review || 'auto',
      history: [{ date, event: 'created', ai_policy: inc.ai_policy }] });
    S.new_postings.push(inc.id); continue;
  }
  const hist = [...(ex.history || [])];
  if (inc.ai_policy && inc.ai_policy !== ex.ai_policy) {
    hist.push({ date, event: 'policy_changed', from: ex.ai_policy, to: inc.ai_policy, evidence: (inc.evidence || [])[0]?.quote || '' });
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
  if (inc.evidence?.length) ex.evidence = inc.evidence;
  if (inc.url) ex.url = inc.url;
  S.updated_postings++;
}
const mergedPostings = [...pById.values()];
for (const p of mergedPostings) p.check_cadence = (p.status === 'closed' || p.status === 'gone' || p.status === 'no_hiring') ? 'none' : cadence([p.deadline], date);
write('postings.json', mergedPostings);

// ---- events ----
const events = read('events.json');
const eById = new Map(events.map(e => [e.id, e]));
for (const inc of run.events || []) {
  if (!inc.id) continue;
  const ex = eById.get(inc.id);
  if (!ex) {
    eById.set(inc.id, { ...inc, first_seen: date, last_checked: date,
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
  for (const f of ['result_date', 'prize', 'title', 'url', 'evidence'])
    if (inc[f] !== undefined && inc[f] !== null) ex[f] = inc[f];
  ex.history = hist; ex.last_checked = date;
  S.updated_events++;
}
const mergedEvents = [...eById.values()];
for (const e of mergedEvents) e.check_cadence = e.status === 'closed' ? 'none' : cadence([e.apply_deadline, e.submit_deadline], date);
write('events.json', mergedEvents);

// ---- changelog / meta ----
const cl = read('changelog.json');
cl.events = cl.events.filter(c => c.date !== date);
cl.events.push({ date, ...S,
  summary: `+${S.new_postings.length}공고 +${S.new_events.length}이벤트 · 정책변경 ${S.policy_changed.length} · 상태변경 ${S.status_changed.length + S.event_status_changed.length} · 마감변경 ${S.deadline_changed.length + S.event_deadline_changed.length}` });
cl.events.sort((a, b) => a.date < b.date ? -1 : 1);
write('changelog.json', cl);

const meta = read('meta.json');
meta.last_run = date;
meta.counts = { platforms: meta.counts.platforms, postings: mergedPostings.length, news: meta.counts.news, events: mergedEvents.length };
meta.events_breakdown = {
  status: Object.fromEntries([...new Set(mergedEvents.map(e => e.status))].map(s => [s, mergedEvents.filter(e => e.status === s).length])),
  hiring_link: mergedEvents.filter(e => e.hiring_link).length,
};
write('meta.json', meta);

console.log(JSON.stringify(S, null, 2));
