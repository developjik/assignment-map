#!/usr/bin/env node
// coldscan.mjs — 콜드스탠바이 fetch 스윕 (R3 첫 슬라이스, 2026-11-21).
// 노트북이 꺼진 날에도 발견 계층(fetch 가능 소스)이 GitHub Actions에서 돈다:
//   devpost-api · daker-api · wevity gp 전수 · hn-algolia(스레드 확인)
// 파서는 루틴과 같은 collector/parsers/*.mjs 순수 함수를 재사용한다(R1 아키텍처).
//
// 관측 원장(queue/_ledger.json — deploy 경로 밖, 미공개): 리스트의 대부분은 '이미 봤고 미채택'인 항목이다 —
// 기추적(events.json) 대조만으론 1,200개를 전부 '신규'로 오판한다(2026-11-21 실측).
// 원장은 coldscan이 관측한 모든 항목 키를 누적하고, 새 후보 = 파싱 결과 − 원장 − 기추적.
// 첫 실행(원장 없음)은 큐를 만들지 않고 원장 기준선만 잡는다(부트스트랩).
//
// 결과는 data/에 병합하지 않는다 — 새 후보만 queue/YYYY-MM-DD.json 에 남기고,
// 다음 Aside 루틴(ROUTINE_PROMPT §1.3)이 소비·판정·merge 한다. 브라우저가 필요한
// 잡코리아·점핏은 커버하지 않는다(공백일 유실분은 복구 런 lookback이 잡는다).
//
// 사용:
//   node collector/coldscan.mjs                 # 오늘(KST) 후보 스캔 → queue/YYYY-MM-DD.json (새 후보 있을 때만)
//   node collector/coldscan.mjs --date 2026-11-23 --dry   # 파일 없이 결과만 출력(로컬 검증)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDevpostOpen } from './parsers/devpost.mjs';
import { parseDakerList } from './parsers/daker.mjs';
import { parseWevityList } from './parsers/wevity.mjs';
import { parseHnWhoishiring } from './parsers/hn.mjs';
import { sourceFamily } from './sources_family.mjs';

const repo = path.resolve(import.meta.dirname, '..');

export const kstToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());

// 전멸 가드(2026-11-21): 4소스 전부 fail 이면 원장·큐를 쓰지 않고 exit 1 — Actions 빨간 불로
// 실패를 전파한다(부분 실패는 정상 운영: 소스별 차단·일시 오류). 완전 무응답은 네트워크·
// IP 차단·마크업 변경 동시 발생이므로 조용히 지나가면 안 된다.
export const COLDSCAN_SOURCES = ['wevity', 'devpost', 'daker', 'hn'];
export const allSourcesFailed = (statuses) =>
  COLDSCAN_SOURCES.every((k) => String(statuses[k] || '').startsWith('fail'));

const normUrl = (u) => String(u || '').replace(/\/+$/, '').toLowerCase();

/** events.json 전수에서 소스별 기추적 키를 뽑는다(순수 함수 — 테스트 대상). */
export function trackedKeys(events) {
  const wevityIxs = new Set(), devpostUrls = new Set(), dakerTitles = new Set(), dakerSlugs = new Set(), kaggleRefs = new Set();
  for (const e of events) {
    for (const m of String(e.id || '').matchAll(/wevity:(\d+)/g)) wevityIxs.add(Number(m[1]));
    for (const m of String(e.url || '').matchAll(/[?&]ix=(\d+)/g)) wevityIxs.add(Number(m[1]));
    const host = (() => { try { return new URL(e.url).host; } catch { return ''; } })();
    if (host === 'devpost.com' || host.endsWith('.devpost.com')) devpostUrls.add(normUrl(e.url));
    if (host === 'kaggle.com' || host === 'www.kaggle.com') kaggleRefs.add(normUrl(e.url));
    if (sourceFamily(e.source) === 'daker') {
      if (e.title) dakerTitles.add(String(e.title).trim());
      for (const m of String(e.url || '').matchAll(/hackathon\/([a-z0-9-]+)/gi)) dakerSlugs.add(m[1]);
    }
  }
  return { wevityIxs, devpostUrls, dakerTitles, dakerSlugs, kaggleRefs };
}

/** 관측 원장(JSON) — 키 집합 4종. 부트스트랩 판정에 schema_version 을 쓴다. */
export const LEDGER_PATH = () => path.join(repo, 'queue', '_ledger.json');
export const emptyLedger = () => ({ schema_version: 2, wevityIxs: [], devpostUrls: [], dakerTitles: [], dakerSlugs: [], hnIds: [], kaggleRefs: [] });
export const loadLedger = (file) => {
  try {
    const o = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (o.schema_version !== 2) return null;
    return { wevityIxs: new Set(o.wevityIxs), devpostUrls: new Set(o.devpostUrls), dakerTitles: new Set(o.dakerTitles), dakerSlugs: new Set(o.dakerSlugs), hnIds: new Set(o.hnIds), kaggleRefs: new Set(o.kaggleRefs || []) };
  } catch { return null; }
};
export const saveLedger = (file, ledger) => {
  const o = emptyLedger();
  for (const k of Object.keys(o).filter((x) => x !== 'schema_version')) o[k] = [...ledger[k]].sort((a, b) => String(a).localeCompare(String(b)));
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(o, null, 1) + '\n');
  fs.renameSync(tmp, file);
};

/** 소스별 파싱 결과 → 새 후보만(기추적·원장 제외). 순수 함수 — 테스트 대상. */
export function diffCandidates(seen, parsed) {
  const out = {};
  out.wevity = (parsed.wevity?.items || [])
    .filter((i) => !seen.wevityIxs.has(i.ix))
    .map((i) => ({ ix: i.ix, title: i.title, url: `https://wevity.com/?c=find&s=1&gbn=view&gp=1&ix=${i.ix}`, dday: i.dday, badge: i.badge, organ: i.organ }));
  out.devpost = (parsed.devpost?.items || [])
    .filter((i) => !seen.devpostUrls.has(normUrl(i.url)))
    .map((i) => ({ id: i.id, title: i.title, url: i.url, period: i.period, prize: i.prize, org: i.org, invite_only: !!i.inviteOnly }));
  out.daker = (parsed.daker?.items || [])
    .filter((i) => !seen.dakerTitles.has(String(i.title).trim()) && !seen.dakerSlugs.has(String(i.slug || '').trim()))
    .map((i) => ({ id: i.id, title: i.title, url: i.slug ? `https://daker.ai/hackathon/${i.slug}` : null, registration_deadline: i.registration_deadline, prize: i.prize, organizer: i.organizer }));
  const seenKaggle = seen.kaggleRefs || new Set();
  out.kaggle = (parsed.kaggle?.items || [])
    .filter((i) => !seenKaggle.has(String(i.ref)))
    .map((i) => ({ ref: i.ref, title: i.title, url: i.url, category: i.category, deadline: i.deadline, reward: i.reward }));
  out.hn = parsed.hn?.latest && !seen.hnIds.has(parsed.hn.latest.id)
    ? [{ thread_id: parsed.hn.latest.id, title: parsed.hn.latest.title, url: `https://news.ycombinator.com/item?id=${parsed.hn.latest.id}`, month: parsed.hn.latest.month }]
    : [];
  return out;
}

/** 이번 관측을 원장에 누적한다(제자리). */
export function absorbIntoLedger(ledger, tracked, parsed) {
  for (const i of parsed.wevity?.items || []) ledger.wevityIxs.add(i.ix);
  for (const i of parsed.devpost?.items || []) ledger.devpostUrls.add(normUrl(i.url));
  for (const i of parsed.daker?.items || []) { ledger.dakerTitles.add(String(i.title).trim()); if (i.slug) ledger.dakerSlugs.add(String(i.slug).trim()); }
  if (parsed.hn?.latest?.id) ledger.hnIds.add(parsed.hn.latest.id);
  ledger.kaggleRefs = ledger.kaggleRefs || new Set();
  for (const k of tracked.kaggleRefs || []) ledger.kaggleRefs.add(k);
  for (const i of parsed.kaggle?.items || []) ledger.kaggleRefs.add(String(i.ref));
  // 채택돼 events.json 에 들어간 항목도 원장에 — 이후 종결로 리스트에서 사라져도 무관.
  for (const ix of tracked.wevityIxs) ledger.wevityIxs.add(ix);
  for (const u of tracked.devpostUrls) ledger.devpostUrls.add(u);
  for (const t of tracked.dakerTitles) ledger.dakerTitles.add(t);
  for (const s of tracked.dakerSlugs) ledger.dakerSlugs.add(s);
}

const fetchText = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(25000), headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
};

async function sweep() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const dateIdx = args.indexOf('--date');
  const date = dateIdx !== -1 && args[dateIdx + 1] ? args[dateIdx + 1] : kstToday();
  const statuses = {};
  const parsed = {};

  // wevity gp 전수 — 빈 페이지까지(상한 90p). 매너: 페이지 사이 300ms.
  try {
    const items = []; let pages = 0;
    for (let gp = 1; gp <= 90; gp++) {
      const html = await fetchText(`https://www.wevity.com/?c=find&s=1&gp=${gp}`);
      const r = parseWevityList(html);
      pages++;
      if (!r.count) break;
      items.push(...r.items);
      await new Promise((ok) => setTimeout(ok, 300));
    }
    parsed.wevity = { items, pages };
    statuses.wevity = `ok ${items.length} ix / ${pages}p`;
  } catch (e) { statuses.wevity = `fail: ${e.message}`; }

  // devpost open 전수 — 8페이지 스윕.
  try {
    const items = []; let pages = 0;
    for (let page = 1; page <= 8; page++) {
      const body = await fetchText(`https://devpost.com/api/hackathons?status=open&page=${page}`);
      const r = parseDevpostOpen(body);
      pages++;
      if (!r.count) break;
      items.push(...r.items);
    }
    parsed.devpost = { items, pages };
    statuses.devpost = `ok ${items.length} / ${pages}p`;
  } catch (e) { statuses.devpost = `fail: ${e.message}`; }

  // daker public-list — 단일 요청.
  try {
    const body = await fetchText('https://daker.ai/api/hackathons/public-list?limit=50');
    parsed.daker = parseDakerList(body);
    statuses.daker = `ok ${parsed.daker.count}`;
  } catch (e) { statuses.daker = `fail: ${e.message}`; }

  // kaggle — 인증 env(GitHub secrets)가 있을 때만. 없으면 skip(전멸 가드 대상 아님).
  if (process.env.KAGGLE_USERNAME && process.env.KAGGLE_KEY) {
    try {
      const auth = Buffer.from(`${process.env.KAGGLE_USERNAME}:${process.env.KAGGLE_KEY}`).toString('base64');
      const rows = [];
      for (let page = 1; page <= 2; page++) {
        const res = await fetch(`https://www.kaggle.com/api/v1/competitions/list?page=${page}&sortBy=latestDeadline`, { headers: { authorization: `Basic ${auth}`, 'user-agent': 'assignment-map/1.0' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const r = await res.json();
        if (!Array.isArray(r) || !r.length) break;
        rows.push(...r);
      }
      parsed.kaggle = { items: rows.map((c) => ({ ref: c.ref ?? String(c.id ?? ''), title: c.titleNullable ?? c.title ?? null, url: c.urlNullable ?? c.url ?? null, category: c.categoryNullable ?? c.category ?? null })) };
      statuses.kaggle = `ok ${rows.length}`;
    } catch (e) { statuses.kaggle = `fail: ${e.message}`; }
  } else statuses.kaggle = 'skip: 인증 없음';

  // hn — 최신 스레드 확인만(전체 파싱은 루틴 T3).
  try {
    const body = await fetchText('https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=1');
    parsed.hn = parseHnWhoishiring(body);
    statuses.hn = parsed.hn.latest ? `ok thread ${parsed.hn.latest.id}` : 'ok (스레드 없음)';
  } catch (e) { statuses.hn = `fail: ${e.message}`; }

  // 전멸 가드 — 전 소스 실패면 아무 파일도 쓰지 않고 실패로 끝낸다(원장 오염 방지).
  if (allSourcesFailed(statuses)) {
    console.error(`COLDSCAN ${date} — 전 소스 실패(네트워크·IP 차단·응답 변경 의심): ${JSON.stringify(statuses)}`);
    process.exit(1);
  }

  const events = JSON.parse(fs.readFileSync(path.join(repo, 'data', 'events.json'), 'utf8'));
  const tracked = trackedKeys(events);
  const ledgerFile = LEDGER_PATH();
  let ledger = loadLedger(ledgerFile);

  // 부트스트랩: 원장이 없으면 오늘 관측을 기준선으로 잡고 큐는 만들지 않는다.
  if (!ledger) {
    ledger = { wevityIxs: new Set(), devpostUrls: new Set(), dakerTitles: new Set(), dakerSlugs: new Set(), hnIds: new Set() };
    absorbIntoLedger(ledger, tracked, parsed);
    if (!dry) saveLedger(ledgerFile, ledger);
    console.log(`COLDSCAN ${date} — 원장 기준선 초기화 ${JSON.stringify(statuses)} (wevity ${ledger.wevityIxs.size} · devpost ${ledger.devpostUrls.size} · daker ${ledger.dakerTitles.size} · hn ${ledger.hnIds.size})`);
    return;
  }

  const candidates = diffCandidates(ledger, parsed);
  const counts = Object.fromEntries(Object.entries(candidates).map(([k, v]) => [k, v.length]));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  absorbIntoLedger(ledger, tracked, parsed);
  if (!dry) saveLedger(ledgerFile, ledger);

  if (!total) {
    console.log(`COLDSCAN ${date} — 새 후보 0 (큐 미기록) · ${JSON.stringify(statuses)}`);
    return;
  }
  const result = { date, generated_by: 'collector/coldscan.mjs (fetch-candidates.yml)', statuses, counts, total_candidates: total, candidates };
  const out = JSON.stringify(result, null, 2) + '\n';
  if (dry) {
    console.log(`COLDSCAN ${date} (dry) — 새 후보 ${total} ${JSON.stringify(counts)}`);
    console.log(out.slice(0, 3000));
  } else {
    const queueDir = path.join(repo, 'queue');
    fs.mkdirSync(queueDir, { recursive: true });
    fs.writeFileSync(path.join(queueDir, `${date}.json`), out);
    console.log(`COLDSCAN ${date} — 새 후보 ${total} ${JSON.stringify(counts)} → queue/${date}.json`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  sweep().catch((e) => { console.error(`coldscan 실패: ${e.message}`); process.exit(1); });
}
