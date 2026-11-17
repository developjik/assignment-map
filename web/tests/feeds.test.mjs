// generate-feeds — 중복 병합 행·seed url 표기가 피드로 새는지 (스펙 1-2·1-3)
// 실행: node --test web/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectFeedItems, renderRss, SITE } from '../scripts/generate-feeds.mjs';

const dataDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-feeds-'));
  const postings = [
    { id: 'p1', company: '열린기업', ai_policy: 'allowed', status: 'open', url: 'https://example.com/1', last_seen: '2026-11-17', evidence: [{ quote: '근거' }] },
    { id: 'p2', company: '숨은중복', ai_policy: 'allowed', status: 'open', url: 'https://example.com/2', last_seen: '2026-11-17', evidence: [{ quote: '근거' }], merged_into: 'p1' },
    { id: 'seed-kr-03', company: '시드기업', ai_policy: 'allowed', status: 'open', url: 'seed', last_seen: '2026-11-17', evidence: [{ quote: '근거' }] },
    { id: 'p4', company: '닫힌기업', ai_policy: 'allowed', status: 'closed', url: 'https://example.com/4', evidence: [{ quote: '근거' }] },
  ];
  const events = [
    { id: 'e1', type: 'contest', title: '열린 공모전', ai_usage: 'allowed', status: 'open', url: 'https://example.com/e1', last_checked: '2026-11-17', evidence: ['근거'] },
    { id: 'e2', type: 'contest', title: '숨은 중복 공모전', ai_usage: 'allowed', status: 'open', url: 'https://example.com/e2', last_checked: '2026-11-17', evidence: ['근거'], merged_into: 'e1' },
    { id: 'e3', type: 'contest', title: '금지 공모전', ai_usage: 'banned', status: 'open', url: 'https://example.com/e3', last_checked: '2026-11-17', evidence: ['근거'] },
  ];
  fs.writeFileSync(path.join(dir, 'postings.json'), JSON.stringify(postings));
  fs.writeFileSync(path.join(dir, 'events.json'), JSON.stringify(events));
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ last_run: '2026-11-17' }));
  return dir;
};

test('feeds: 중복 병합 행(merged_into)은 피드 항목에서 빠진다', () => {
  const { items } = collectFeedItems(dataDir());
  const ids = items.map((i) => i.id);
  assert.ok(ids.includes('posting:p1'), '대표행은 발행');
  assert.ok(!ids.includes('posting:p2'), '중복 병합된 채용은 미발행 (스펙 1-2)');
  assert.ok(ids.includes('event:e1'), '이벤트 대표행은 발행');
  assert.ok(!ids.includes('event:e2'), '중복 병합된 이벤트는 미발행 (스펙 1-2)');
  assert.ok(!ids.includes('event:e3'), 'banned 이벤트는 계속 미발행');
});

test('feeds: url "seed" 표기는 링크가 아니라 사이트로 흘린다 — 깨진 링크 0건 (스펙 1-3)', () => {
  const { items } = collectFeedItems(dataDir());
  const seed = items.find((i) => i.id === 'posting:seed-kr-03');
  assert.ok(seed, 'seed url 행도 발행은 된다');
  assert.equal(seed.url, SITE, 'seed 표기는 href 로 새지 않고 사이트로 대체');
  const xml = renderRss(items, { now: new Date('2026-11-17T03:00:00+09:00') });
  assert.ok(!xml.includes('href="seed"') && !xml.includes('<link>seed</link>'), 'feed.xml 에 seed 링크 없음');
  assert.ok(!/(href|link)>?\s*<\/(a|link)>/.test(xml.replace(/<link>https?:[^<]*<\/link>/g, '')), '빈 링크 없음');
});
