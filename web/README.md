# web/ — 과제지도 사이트

React 18 + Rollup 3 (순수 JS 툴체인, 네이티브 바이너리 없음 — 임베디드/CI 어디서나 동일 빌드).

- 디자인: dark-terminal 단일 방향. 토큰은 src/styles.css `:root`. 원칙: docs/design/anti-slop.md
- 데이터: 빌드 타임에 ../data/*.json 번들 (vite 아니므로 fs 제약 없음)
- 빌드: `npm run build` = slop-lint 16체크 → rollup → dist/ (커밋+타임스탬프 캐시 버스팅 자동)
- 미니파이: v0.1 미적용 (1.4MB). 운영 배포 후 terser 도입 검토
- 렌더: ReactDOM.render 동기 렌더 사용 (임베디드 브라우저에서 createRoot 동시성 커밋 무음 스톨 관측, 2026-10-24. 재전환 검토 필요)
