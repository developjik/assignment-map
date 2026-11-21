// coldscan.test.mjs — 콜드스탠바이 순수 로직 회귀 (스펙 2026-11-21):
//   1) trackedKeys: wevity id∪url ix · devpost 호스트 · daker 패밀리(daker-api 변형 포함)
//   2) 원장 save/load 라운드트립 + schema 가드
//   3) diffCandidates: 원장에 없는 것만 새 후보 — 1,200개 미채택 항목 재오판 방지(실측 계기)
//   4) absorbIntoLedger: 기추적(채택분)도 원장에 흡수
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { trackedKeys, diffCandidates, absorbIntoLedger, loadLedger, saveLedger, LEDGER_PATH, kstToday } from '../coldscan.mjs';

test('trackedKeys: wevity id∪url ix · devpost 호스트 · daker 패밀리', () => {
  const events = [
    { id: 'wevity:111843-hallym', url: 'https://www.wevity.com/?c=find&s=1&gbn=view&gp=1&ix=111843' },
    { id: 'ko-0005', url: 'https://blog.naver.com/ppas/1' },                    // url에 ix 없음
    { id: 'global-0039', source: 'devpost-api', url: 'https://kiroween.devpost.com/' },
    { id: 'ko-0035', source: 'daker-api', title: '제주 AI·빅데이터 챌린지', url: 'https://daker.ai/hackathon/jeju-ai' },
    { id: 'wevity-urlonly', url: 'https://www.wevity.com/?c=find&s=1&gbn=view&ix=111674' },  // id에 wevity 없어도 url ix로 추적
  ];
  const t = trackedKeys(events);
  assert.deepEqual([...t.wevityIxs].sort(), [111674, 111843], 'id ∪ url 합집합(11-16 스니펫 규칙)');
  assert.deepEqual([...t.devpostUrls], ['https://kiroween.devpost.com'], 'trailing slash 정규화');
  assert.ok(t.dakerTitles.has('제주 AI·빅데이터 챌린지'), 'daker-api 변형 → daker 패밀리');
  assert.deepEqual([...t.dakerSlugs], ['jeju-ai']);
});

test('원장 save/load 라운드트립 + schema 가드', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-cold-'));
  const file = path.join(dir, '_ledger.json');
  const ledger = { wevityIxs: new Set([1, 2]), devpostUrls: new Set(['https://a.devpost.com']), dakerTitles: new Set(['대회']), dakerSlugs: new Set(['slug']), hnIds: new Set(['50338728']) };
  saveLedger(file, ledger);
  const back = loadLedger(file);
  assert.deepEqual([...back.wevityIxs], [1, 2]);
  assert.deepEqual([...back.hnIds], ['50338728']);
  fs.writeFileSync(file, JSON.stringify({ schema_version: 99, wevityIxs: [] }));
  assert.equal(loadLedger(file), null, 'schema 불일치 원장은 부트스트랩 재수행');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('diffCandidates: 원장에 없는 것만 새 후보 — 미채택 1,200건 재오판 방지', () => {
  const ledger = { wevityIxs: new Set([111843]), devpostUrls: new Set(['https://old.devpost.com']), dakerTitles: new Set(['기존 대회']), dakerSlugs: new Set([]), hnIds: new Set(['50338728']) };
  const parsed = {
    wevity: { items: [
      { ix: 111843, title: '이미 관측' },
      { ix: 112999, title: '새 등장', dday: 'D-9', badge: '접수중', organ: '주최' },
    ] },
    devpost: { items: [
      { id: 1, title: '옛 것', url: 'https://old.devpost.com/' },
      { id: 2, title: '새 해커톤', url: 'https://new-one.devpost.com', period: 'Nov 30 - Dec 07, 2026', prize: '$1k', org: 'Org', inviteOnly: false },
    ] },
    daker: { items: [
      { id: 'a', title: '기존 대회', slug: 'old' },
      { id: 'b', title: '신규 챌린지', slug: 'new-ch', registration_deadline: '2026-12-01', prize: 500, organizer: '제주' },
    ] },
    hn: { latest: { id: '50338728', title: "Ask HN: Who is hiring? (November 2026)", month: 'November' } },
  };
  const d = diffCandidates(ledger, parsed);
  assert.equal(d.wevity.length, 1);
  assert.equal(d.wevity[0].ix, 112999);
  assert.match(d.wevity[0].url, /ix=112999/);
  assert.equal(d.devpost.length, 1);
  assert.equal(d.devpost[0].url, 'https://new-one.devpost.com');
  assert.equal(d.daker.length, 1);
  assert.equal(d.daker[0].url, 'https://daker.ai/hackathon/new-ch');
  assert.equal(d.hn.length, 0, '같은 달 스레드는 재후보화하지 않는다');
  // 다음 달 스레드는 후보가 된다
  const d2 = diffCandidates(ledger, { ...parsed, hn: { latest: { id: '50999999', title: 'Ask HN: Who is hiring? (December 2026)', month: 'December' } } });
  assert.equal(d2.hn.length, 1);
  assert.match(d2.hn[0].url, /item\?id=50999999/);
});

test('absorbIntoLedger: 이번 관측 + 기추적(채택분)을 모두 흡수', () => {
  const ledger = { wevityIxs: new Set(), devpostUrls: new Set(), dakerTitles: new Set(), dakerSlugs: new Set(), hnIds: new Set() };
  const tracked = { wevityIxs: new Set([111843]), devpostUrls: new Set(['https://a.devpost.com']), dakerTitles: new Set(['채택 대회']), dakerSlugs: new Set(['adopted']) };
  const parsed = { wevity: { items: [{ ix: 113000 }] }, devpost: { items: [{ url: 'https://b.devpost.com/' }] }, daker: { items: [{ title: '미채택 대회', slug: 'seen' }] }, hn: { latest: { id: '50338728' } } };
  absorbIntoLedger(ledger, tracked, parsed);
  assert.deepEqual([...ledger.wevityIxs].sort(), [111843, 113000]);
  assert.deepEqual([...ledger.devpostUrls].sort(), ['https://a.devpost.com', 'https://b.devpost.com']);
  assert.ok(ledger.dakerTitles.has('채택 대회') && ledger.dakerTitles.has('미채택 대회'));
  assert.deepEqual([...ledger.hnIds], ['50338728']);
});

test('kstToday: KST 달력일 YYYY-MM-DD 형식', () => {
  assert.match(kstToday(), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(typeof LEDGER_PATH(), 'string');
});

test('전멸 가드: 4소스 전부 fail일 때만 참 (부분 실패·정상은 거짓)', async () => {
  const { allSourcesFailed } = await import('../coldscan.mjs');
  const fail = (n) => Object.fromEntries(['wevity', 'devpost', 'daker', 'hn'].map((k, i) => [k, i < n ? `fail: HTTP 403` : `ok 100`]));
  assert.equal(allSourcesFailed(fail(4)), true, '전멸은 참');
  assert.equal(allSourcesFailed(fail(3)), false, '부분 실패는 정상 운영');
  assert.equal(allSourcesFailed(fail(0)), false, '전멸 아니면 거짓');
  assert.equal(allSourcesFailed({}), false, '빈 상태(이론상 없음)도 거짓');
});
