// expansion.test.mjs — 소스 확장 파서 회귀 (2026-11-21 실측 fixture 기반):
//   drivendata(섹션 상태) · aicrowd(카드 배지·상금) · devto(캠프 피드) ·
//   onoffmix(링크 창 기반 — article 경계 비의존) · greeting(openings JSON, 무신사+컬리)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseDrivendataList } from '../parsers/drivendata.mjs';
import { parseAicrowdList } from '../parsers/aicrowd.mjs';
import { parseDevtoList, parseDevtoApi } from '../parsers/devto.mjs';
import { parseOnoffmixList } from '../parsers/onoffmix.mjs';
import { parseGreetingList } from '../parsers/greeting.mjs';

const FIX = (f) => fs.readFileSync(path.join(import.meta.dirname, 'fixtures', f), 'utf8');

test('drivendata: panel-competition-title 제목·슬러그·중복 제거', () => {
  const r = parseDrivendataList(FIX('drivendata-list.html'));
  assert.equal(r.count, 3);
  const first = r.items[0];
  assert.equal(first.slug, 'literacy-speech-modeling');
  assert.equal(first.title, 'Where the Wild Features Are');
  assert.match(first.url, /competitions\/\d+\/literacy-speech-modeling\//);
  // 섹션 헤더가 없는 슬라이스에서는 status가 null — 전체 페이지에서만 판정된다
  assert.equal(first.status, null);
  // 섹션 매핑: 전체 문서에서 상태가 붙는다
  const withSection = parseDrivendataList('<h2>Completed competitions</h2>' + FIX('drivendata-list.html'));
  assert.equal(withSection.items[0].status, 'completed');
  assert.equal(parseDrivendataList('<html></html>').count, 0);
});

test('aicrowd: 카드 제목·배지 상태·상금', () => {
  const r = parseAicrowdList(FIX('aicrowd-list.html'));
  assert.equal(r.count, 3);
  const first = r.items[0];
  assert.equal(first.slug, 'arc-white-box-estimation-challenge-2026');
  assert.equal(first.title, 'ARC White-Box Estimation Challenge 2026');
  assert.equal(first.status, 'Phase 2: Completed');
  assert.match(first.url, /aicrowd\.com\/challenges\//);
  assert.equal(parseAicrowdList('<html></html>').count, 0);
});

test('devto: 해커톤 캠프 링크(설정 링크 제외) + API 아티클', () => {
  const r = parseDevtoList(FIX('devto-list.html'));
  assert.ok(r.count >= 1, 'fixture에 아티클 1개 이상');
  assert.ok(r.items.every((i) => i.slug !== 'settings'));
  assert.match(r.items[0].url, /^https:\/\/dev\.to\/hackathons\//);
  const api = parseDevtoApi(JSON.stringify([{ slug: 'a', title: 'T', url: 'https://dev.to/a', published_at: '2026-11-21T00:00:00Z', tag_list: ['hackathon'] }]));
  assert.equal(api.count, 1);
  assert.equal(api.items[0].published, '2026-11-21');
  assert.deepEqual(parseDevtoApi('{"error":1}').items, [], '배열 아님 → 빈 + note');
});

test('onoffmix: 링크 창 기반 파싱 — article 닫는 태그가 없어도 항목이 나온다', () => {
  const r = parseOnoffmixList(FIX('onoffmix-list.html'));
  assert.equal(r.count, 3);
  const first = r.items[0];
  assert.equal(first.id, 350318);
  assert.match(first.title, /게임콘텐츠제작/);
  assert.equal(first.ended, true, 'end_layer → 종료');
  assert.equal(first.url, 'https://onoffmix.com/event/350318');
  assert.equal(parseOnoffmixList('<html></html>').count, 0);
});

test('greeting: openings JSON(openingId·title·마감) — 무신사·컬리 슬라이스 혼합', () => {
  const r = parseGreetingList(FIX('greeting-list.html'));
  assert.ok(r.count >= 5, `fixture 5개 이상 (${r.count})`);
  const agent = r.items.find((i) => i.openingId === 245220);
  assert.ok(agent, '무신사 AI Agent 전형 245220');
  assert.equal(agent.title, '[AI Agent 전형] Product Engineer (Retention)');
  assert.equal(agent.url, '/ko/o/245220');
  assert.equal(agent.dday, null, '상시');
  const kurly = r.items.find((i) => i.openingId === 210881);
  assert.equal(kurly.title, '주니어 뷰티 MD', '컬리 openings JSON');
  // 마감 있는 공고: dueDate/dday 추출
  const withDue = parseGreetingList('"openingId":99,"title":"마감있는공고","openDate":"2026-11-01T00:00:00Z","dueDate":"2026-12-01T00:00:00Z","deadlineDDay":10');
  assert.equal(withDue.items[0].dueDate, '2026-12-01');
  assert.equal(withDue.items[0].dday, 10);
  assert.equal(parseGreetingList('<html></html>').count, 0);
});
