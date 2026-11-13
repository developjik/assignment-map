# web/ — 과제지도 사이트

React 18 + Rollup 3 (순수 JS 툴체인, 네이티브 바이너리 없음 — 임베디드/CI 어디서나 동일 빌드).

- 디자인: dark-terminal 단일 방향. 토큰은 src/styles.css `:root`. 원칙: docs/design/anti-slop.md
- 데이터: 빌드 타임에 ../data/*.json 번들 (vite 아니므로 fs 제약 없음)
- 빌드: `npm run build` = slop-lint 16체크 → rollup + terser → dist/ (커밋+타임스탬프 캐시 버스팅 자동)
- 피드: `scripts/generate-feeds.mjs`가 dist/feed.xml(RSS 2.0)과 dist/feed.json(JSON Feed)을 생성. 빌드에 포함되며 `npm run feeds`로 단독 실행 가능
- 캘린더: `src/lib/ics.js`가 RFC 5545 VCALENDAR를 문자열로 만들어 Blob으로 내려받는다 (서버 없음, 75옥텟 폴딩·TEXT 이스케이프 처리). `downloadStarredIcs()`는 별표한 건만 모아 `assignment-map-starred.ics` 하나로 저장한다
- 관심(별표): `src/lib/starred.js`가 `localStorage['am-starred']`에 ID 배열을 두고 커스텀 이벤트·storage 이벤트로 화면 간 동기화
- 딥링크: `src/lib/hash.js`가 해시를 읽고 **병합해서** 쓴다(`history.replaceState`). 탭·검색어는 App이, 필터는 Opportunities가 자기 키만 갱신한다
- 검색: `src/lib/data.js`가 행마다 `hay`(제목·기업/주최·상금·직군/기술 키워드 소문자 인덱스)를 만들어 두고, 표는 공백 AND로 좁힌다
- 정책 변경: `data/changelog.json`의 policy_changed와 각 레코드 history를 합쳐 `policyChanges`로 노출 (표 배지 + 변경 로그 뷰)
- 이모지 대신 인라인 SVG, `border-radius` 4px 이하, 중앙정렬 없음
- 2-Pane: `views/Opportunities.jsx`가 `matchMedia('(min-width: 1200px)')`를 구독해 넓은 화면에서만 우측 패널(`components/DetailPane.jsx`)을 붙인다. 패널이 열리면 `.workspace.pane-on`이 되어 유형·확인 컬럼을 패널에 넘기고 근거 폭을 35%까지 늘린다. 좁은 화면은 같은 상태(`openRow`)로 아코디언을 그린다
- 미니파이: terser 적용 (dist assets/app.js 약 740KB)
- 렌더: ReactDOM.render 동기 렌더 사용 (임베디드 브라우저에서 createRoot 동시성 커밋 무음 스톨 관측, 2026-10-24. 재전환 검토 필요)
- 확인: `npm run preview` → http://127.0.0.1:4173
