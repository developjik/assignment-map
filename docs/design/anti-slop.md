# UI 개발 "AI 티" 제거 스킬 전수 조사

조사일: 2026-10-24 · 원문 파일 32개 수집 완료 (본 폴더)

---

## 0. 왜 AI UI는 뻔한가 (근거)

- **배포 수렴(distributional convergence)**: 모델은 학습데이터의 통계적 중앙값을 출력한다. 방향 지시가 없으면 "모두에게 안전한" 선택(Inter, 보라 그라디언트, 중앙 히어로)으로 수렴 — Anthropic 공식 설명 (claude.com/blog/improving-frontend-design-through-skills, 2025-11-12)
- **측정 근거**: Slop Patterns가 4,725개 Show HN 런치 페이지(2016~2026)를 분석 → AI 시대 디자인 텔 보유율 2016년 2/310건(0.6%) → 2026년 **47%**. Product Hunt 상위 런치도 **54%**. 기본 결함은 오히려 감소(72%→37%) — 페이지는 더 "정확"해졌지만 같은 생김새로 수렴
- **커뮤니티 근거**: unslop-ui는 47개 서브레딧 320만 포스트 + "왜 AI 사이트가 다 똑같나" 스레드 125개의 3,033개 댓글을 마이닝해 규칙을 뽑음
- **벤더 간 공통 결론** (모든 소스 일치): "generic 피하기" 같은 일반론은 디폴트 하나를 다른 디폴트로 바꿀 뿐. **구체적 패턴을 이름으로 금지하고, 구체적 대안을 주고, 출력을 검사해야 한다**

---

## 1. 공식 스킬 (제일 먼저 적용되는 것들)

### 1-1. Anthropic `frontend-design` (공식 · anthropics/skills + claude-code 플러그인)
파일: `anthropic-frontend-design.md`, `claude-code-plugin-frontend-design.md`

- 페르소나 부여: "클리셰 제안을 거절당해본 클라이언트를 둔 디자인 스튜디오 디자인 리드"로 역할 설정
- **AI 디자인 클리셰 5개 클러스터를 명시적으로 금지**:
  1. 크림 배경(#F4F1EA 부근) + 고대비 세리프 + 테라코타 악센트(#D97757 부근 — Claude 자체 브랜드색이라 오히려 텔)
  2. 근사 흑 배경 + 애시드그린/버밀리온 악센트 1개
  3. SaaS 카드 키트: 내용을 동일 라운드 카드로 분할, 위계 무시한 단일 border-radius, 전부 동일한 rgba(0,0,0,.1) 섀도, 그라디언트 워시
  4. 브로드시트 모방: 헤어라인 룰 + zero radius + 신문식 다단 (주제와 무관하게 관성적으로 선택)
  5. 템플릿 크롬: 자간 벌린 ALL-CAPS eyebrow 라벨, middle-dot(`A · B · C`) 메타 문자열, `WORD — fragment` 라벨, #111 근사 흑, 소형 데이터 라벨용 모노스페이스, 링크 텍스트에 붙는 `→`
- **"디폴트 테스트"**: 어떤 부분이든 "유사한 프롬프트로 돌려도 똑같이 나오는 결과"면 → 주제 특화 선택이 아니라 디폴트 → 다시 설계
- 타이포 텔 금지: 제목에서 한 단어만 색/이탤릭/볼드 처리, ALL-CAPS 라벨, 내용 위 불필요한 라벨
- 넘버링(01/02/03)은 내용이 실제 시퀀스일 때만
- **모션**: 비사용자 트리거 모션은 절제 — 섹션마다 fade-slide-up, 카드마다 hover 전환은 "생성 페이지의 공통 디폴트". 페이지 로드 시퀀스 같은 "오케스트레이션된 순간 1개"가 산포된 효과보다 낫다
- 행 길이 <80자, 세리프 본문은 행간 더 넉넉히
- **카피도 디자인**: 스톡 카피는 디자인을 템플릿처럼 만든다. 주제의 실제 내용으로 작성
- **프로세스 2-pass**: ① 브리프 기반 설계 플랜(색 4-6 hex 토큰 / 서체 역할 / ASCII 와이어프레임 / 원칙) → ② 플랜을 브리프 대비 비평 → 빌드 → **스크린샷 찍고 셀프 크리틱**("a picture is worth 1000 tokens")
- 절제 원칙: 대담함은 한 곳에만. "샤넬 — 액세서리 하나를 빼고 나라" / 시도한 것을 기록해 다음 패스에서 새로운 것을 시도

### 1-2. Anthropic 블로그의 ~400토큰 스킬 프롬프트 (`frontend_aesthetics`)
바로 복붙 가능한 최소 버전:

```
You tend to converge toward generic, "on distribution" outputs. In frontend design, this creates
what users call the "AI slop" aesthetic. Avoid this: make creative, distinctive frontends that
surprise and delight.

Focus on:
- Typography: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like
  Arial and Inter; opt instead for distinctive choices that elevate the frontend's aesthetics.
- Color & Theme: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors
  with sharp accents outperform timid, evenly-distributed palettes. Draw from IDE themes and
  cultural aesthetics for inspiration.
- Motion: Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML.
  Use Motion library for React when available. Focus on high-impact moments: one well-orchestrated
  page load with staggered reveals (animation-delay) creates more delight than scattered
  micro-interactions.
- Backgrounds: Create atmosphere and depth rather than defaulting to solid colors. Layer CSS
  gradients, use geometric patterns, or add contextual effects that match the overall aesthetic.

Avoid generic AI-generated aesthetics:
- Overused font families (Inter, Roboto, Arial, system fonts)
- Clichéd color schemes (particularly purple gradients on white backgrounds)
- Predictable layouts and component patterns
- Cookie-cutter design that lacks context-specific character

Interpret creatively and make unexpected choices that feel genuinely designed for the context.
Vary between light and dark themes, different fonts, different aesthetics. You still tend to
converge on common choices (Space Grotesk, for example) across generations. Avoid this: it is
critical that you think outside the box!
```

포인트: (1) 문제를 먼저 설명해 보정, (2) 타이포/색/모션/배경 4축 타겟 지시, (3) 마지막에 "Space Grotesk로 수렴하는 것조차 경계" — **교정된 수렴(local maximum)까지 차단**. 좋은 폰트 예시: 코드=JetBrains Mono/Fira Code/Space Grotesk, 에디토리얼=Playfair Display/Crimson Pro, 테크니컬=IBM Plex, 개성=Bricolage Grotesque/Newsreader. 대비 원칙: weight 극단(100/200 vs 800/900), 크기 점프 3x+

### 1-3. Vercel `web-design-guidelines` + Web Interface Guidelines
파일: `vercel-web-design-guidelines-skill.md`, `vercel-web-interface-guidelines-AGENTS.md`

- 100+ 규칙, 8카테고리 (접근성/포커스/폼/애니메이션/타이포/이미지/터치/i18n/다크모드) — slop 방지보다 **크래프트 플로어**(품질 하한선) 용도
- 설치: `npx skills add vercel-labs/agent-skills --skill web-design-guidelines` · AGENTS.md 다운로드 제공
- 에이전트에게 "Review my UI"로 트리거되는 검토 스킬 형태

### 1-4. JetBrains/skills
파일: `jetbrains-frontend-design.md`, `jetbrains-antfu-web-design-guidelines.md`, `jetbrains-ui-website-style.md`

- `frontend-design` 독자 버전 + antfu 포크의 web-design-guidelines(검토 시 Vercel 원문을 fetch해 최신 룰 적용하는 경량 패턴) + `ui-website-style`(프로젝트 디자인 시스템을 스킬로 봉인한 예시 — "디자인 시스템 자체를 스킬로 만들어 일관성 강제"하는 접근의 좋은 표본)

### 1-5. 기타 공식 자료
- Claude Cookbook: `platform.claude.com/cookbook/coding-prompting-for-frontend-aesthetics`
- Anthropic `web-artifacts-builder` 스킬: 단일 HTML 한계를 벗어나 React+Tailwind+shadcn+Parcel 번들로 품질 상한 올리기 (slop 방지용은 아니지만 아티팩트 품질용 스킬)

---

## 2. 대형 커뮤니티 스킬

### 2-1. taste-skill ★101,676 (2026-02 생성, 최다 스타)
파일: `taste-skill-skills__taste-skill__SKILL.md` (38KB) — v2 "the anti-slop frontend skill"

- **247개 큐레이션 갤러리 사이트(One Page Love, Awwwards SOTD) 연구**에서 증류
- 핵심 메커니즘 4개:
  1. **방향 덱(dirs deck)**: 모델이 스스로 룩을 정하면 항상 카테고리 디폴트를 고르므로, `scripts/draw.mjs`가 연구된 20개 방향 중 **3장을 딜링**하고 그중 주제의 아이디어를 옮기는 하나를 강제 선택 → 이후 서체 시스템/팔레트/히어로/섹션 구성도 같은 라이브러리에서 딜
  2. **아이디어는 주제에서**: "최고 사이트와 잊히는 사이트를 가른 건 스타일링이 아니라 그 것 자체에서 온 컨셉"
  3. **하우스 스타일(장식 없는 규칙)을 실브라우저로 검사** — `scripts/inspect.mjs`로 희망이 아니라 검증
  4. **만든 것을 본다**: 3개 폭 스크린샷 + 배심원 루브릭 → 수정 → 다시 봄 (look-and-fix 루프)
- **페이지 vs 앱 스크린 분리**: 랜딩/마케팅은 "the run" 10단계(브리프→논거→딜→아이디어→카피→빌드→게이트→관찰→모션→보고), 대시보드/어드민/인박스는 `references/app-screens.md`의 별도 룰
- 중요한 경고: **장식을 제거하는 건 반쪽** — 라벨/룰/카드를 빼앗긴 페이지는 밋밋해지고, 텔이 있어도 내실 있는 페이지가 무(空)페이지를 이긴다. 대신 타입을 크게, 컬러 필드 전체, 이 주제 세계의 실제 사진으로 메워라
- 유사 스킬: `senlindesign/taste-skill`(★422), `h3nryprod01/design-taste`(★80), `Ga14ctic/awwwards-skill`(★14), `DonkeyKing01/tasteful-ui-skill`(★23), `peterhadorn/webdesign-agency-skills`(★43), `stevembarclay/pencilplaybook`(★52)

### 2-2. hallmark (Nutlope)
파일: `hallmark/hallmark-SKILL.md` + references 6종 (fonts/craft/direction/gates/design-md/patterns)

- "made, not generated" — 3층 구조: **The Floor(불가침 하드룰) / 방향 딜링 / 게이트 검사**
- The Floor 발췌 (번호는 내부 패턴 코드): 모든 색·폰트는 `:root` 토큰 경유(48), `transition: all` 금지·width/height/top/left 애니메이션 금지(10a), 로마자 제목 속 이탤릭 한 단어 금지(38i), `overflow-x: clip`(34), 이미지 그리드 `minmax(0,1fr)`(50), 모든 인터랙티브 `:focus-visible`(26a), 모든 애니메이션 reduced-motion 폴백(27), **발명된 지표·테스티모니얼·로고월 금지(46a)**, **eyebrow·자간 벌린 대문자 라벨 금지(54,67)**, middle-dot 메타·링크 붙은 화살표·장식 상태점 금지(63), 보라→파랑 그라디언트·카드 속 카드·이모지 아이콘·손그린 브라우저 창 금지(2a,4,30a,47a), 히어로 3요소 1280x800 무스크롤 가시(44b)
- references가 압권: `gates.md`(39KB 검사 게이트), `macrostructures/` 21종 레이아웃 블루프린트(bento/manifesto/letter/index-first...), `genres/`, `themes/`, `craft.md`(Type/Colour/Surfaces/Motion/Copy/Finish)

### 2-3. Impeccable (Paul Bakaus / impeccable.style)
파일: `impeccable-SKILL.md`

- 목표 선언: "safe, timid, measured"에서 **"out-of-distribution craft"**로 — 수상 경력 디자인 디렉터로서 작업
- **bounded passes 원칙**: 무한 셀프QA 금지. 빌드 → 데스크톱+모바일 한 배치로 검사 → 결함 일괄 수정 → 최대 1회 확인 후 종료 (셀프 QA 루프는 사용자 돈 낭비)
- `impeccable.style`: 에이전트 **훅** — UI 코드 수정을 감지하면 gradient text, glow, overflow, 디자인시스템 드리프트 등을 에디터/Claude Code/Cursor/Copilot에 실시간 피드백

### 2-4. unslop-ui (iamneilroberts)
파일: `unslop-ui-neilroberts.md`

- 근거 기반: 47 서브레딧 320만 포스트(2020-2026) + 125개 "왜 다 똑같나" 스레드 3,033 댓글에서 실제로 사람들이 지목하는 것만 규칙화
- 지목된 디폴트 스택: Next.js + Tailwind + shadcn/ui + 동일 스타터 레이아웃 + 동일 팔레트 → "학습데이터의 평균"
- 해법의 한 문장: **"모델에게 디자인을 즉흥시키지 마라. 구체적이고 비디폴트인 선택을 하게 해라, 실제 레퍼런스에 고정해서"**
- `references/tells.md`(증거+코드레벨 감지+수정), `references/good-defaults.md`(대안 디폴트)

### 2-5. no-ai-slop + TELLS 카탈로그 (claudiusararu)
파일: `no-ai-slop-claudiusararu.md`, `tells-catalog-claudiusararu.md` (27KB, **~100개 텔 · 9카테고리**)

- 2레이어: **Layer 1 상시 안티텔**(디폴트 폰트 금지 — Inter/Geist/"Space Grotesk+Instrument Serif+Inter" 트리오까지, gradient-clipped 텍스트 금지, 실제 weight 위계, 제목 자연 줄바꿈 — 수동 `<br>`·`text-balance` 만용 금지, 고아 단어/4줄 제목 금지) + **Layer 2 선택된 스타일 디렉션 적용**
- TELLS.md 9카테고리: Typography/Color/Backgrounds/Layout/Components/Imagery/Icons/Copy/Motion

### 2-6. no-slop-ui (LeoStehlik) — "Normal" 학파
파일: `no-slop-ui-leostehlik.md` + banned-patterns + colour-palettes + review-checklist

- 철학: impressive/dramatic이 아니라 **normal**. "Linear. Raycast. Stripe. GitHub. — 주목하려 들지 않는다, 그냥 작동한다"
- 수치화된 기준: 사이드바 240-260px 고정+1px 보더, 카드 radius 8-12px max, 섀도 `0 2px 8px rgba(0,0,0,0.08)` max, 버튼 radius 6-10px, 스페이싱 4/8/12/16/24/32 스케일, 트랜지션 100-200ms opacity/color만
- 하드룰 15: 글래스모피즘·장식 그라디언트·20px+ 라운딩·eyebrow 라벨·대시보드 속 히어로·장식 카피·**KPI 카드 그리드 디폴트 금지**·공간 채우기용 가짜 차트 금지·hover transform 금지·`Segoe UI/Trebuchet MS/Arial` 금지·nav 배지(실데이터 아닌) 금지·pill 버튼 남발 금지·24px+ 블러 섀도 금지·정렬 혼용 금지
- shadcn은 "있는 그대로" — 디폴트를 함부로 오버라이드 금지 (커스텀 스타일링 자체가 드리프트)
- **리뷰 체크리스트 + PASS/REVISE/ESCALATE 판정**: 규칙이 접근성/요구사항과 충돌하면 상위 요구 보존하고 트레이드오프 기록

### 2-7. ux-design (Nima-Edelkhani)
파일: `claude-ux-design-skill-nima.md`

- **"각각은 방어 가능한 선택, 쌓이면 지문(fingerprint)"**: Inter 16px + Tailwind blue(#3B82F6) + 3카드 + gradient-text 히어로 + Lucide 아이콘 뿌리기 + 8px 그리드 꽉 채움 + 균등 시각 무게 + "Build faster. Ship smarter." 카피
- Step 1 강제: 마크업 전에 미학 방향 **하나를 이름으로 커밋** (Editorial / Swiss-minimal / Modern-warm / Technical-mono...), 파일 최상단 주석으로 선언, **절대 평균 내지 말 것** — 방향마다 서체 페어링까지 제시

### 2-8. 그 외 커뮤니티
- `critiquing-visual-design` (Prasad-D-Ware): Expo 아티클 기반 8원칙 루브릭 루프 (아래 §4)
- `design-review-skill` (AslanMazhidov): Playwright MCP로 데스크톱/태블릿/모바일 캡처 → 타이포/대비/리듬/위계 감사 → 구체적 CSS 수정안
- `Impertio-Studio/Frontend-Design-Claude-Skill-Package`: 프론트엔드 결정론 스킬 36개 패키지

---

## 3. 패턴 라이브러리 · 린터 (기계적 감지 계열)

### 3-1. Slop Patterns (Precious Studio, 2026-09-23 v1.1.1) — 이 분야의 학술 데이터셋
파일: `slop-patterns/patterns.json`(531 레코드), `taxonomy.json`, `check-ui` 스킬, cursor 룰

- **235개 패턴 · 16그룹**, 전부 수동 검증, 각 패턴 = {보이는 것, 왜 AI가 만드는가, 누가 다치는가, 대안} + 영구 ID (예: `A1 The Unchosen Gradient` — #6366F1→#8B5CF6, Tailwind indigo-500(2019)에서 유래, `A36 pulsing dot`, `A63 emoji bullets`)
- MCP 서버(`sloppatterns.com/mcp`, 키 불필요) — 에이전트가 `check_design`으로 코드 검사 → 패턴 코드와 수정안 반환 → 클린까지 재검사
- 사용 규칙이 좋음: "요소를 지우지 말고 **실제 대안을 골라라**", "클린 결과는 기계적 텔만 커버 — 풀 디자인 리뷰가 아님", "'AI가 만들었다'고 말하지 말고 'AI 시대 패턴을 보인다'고 말하라"
- slop 정의: **"아무도 결정하지 않은 것(nobody decided)을 출시한 것"** — 트레이스 가능한 역사(indigo-500 → 수천 사이트 복제)

### 3-2. slop-lint (Plainwork Digital)
- 16체크 = 일반룩 텔 12 + 크래프트 오류 4: `purple-gradient`, `gradient-text`, `theme-palette`(스톡 에디터 테마색), `overused-font`, `glass-glow`, `card-grid`, `emoji-icons`, `eyebrow-label`(두 번째로 강한 텔), `stock-copy`, `radius-everywhere`, `fade-up-reveal`, `centered-hero` + `no-focus-style`, `no-reduced-motion`, `no-viewport`, `img-no-alt`
- 규칙 파일용 프롬프트 제공: "작성 전 DESIGN.md·look.css 읽기 → 그 색/폰트/컴포넌트만 사용 → 금지 목록(카드 그리드, 장식 이모지, eyebrow, 그라디언트, glass/glow, 단일 대형 radius, 스크롤 fade-in, 스톡 문구) → 끝나면 `node tools/slop-lint.mjs .` 전부 수정"
- "체크리스트는 가장 강한 텔을 제거할 뿐, 디자인을 좋게 만들지는 않는다" — 한계도 정직하게 명시
- 관련: Looksheet(원룩 5종+DESIGN.md 유료 키트), 무료 DESIGN.md 템플릿, Tailwind AI 디폴트 클래스 목록

### 3-3. 기타
- **pixelslop**: npm 스킬 패키지, 34KB AI slop 패턴 카탈로그 (`pixelslop-ai-slop-patterns.md`)
- **ai-slop-library** (clements23): 문장/구두점/구조 텔의 머신리더블 라이브러리 (카피 쪽)
- **ai-slop-files** (amazingcreationsltd): Claude가 자기 슬롭을 기술한 문서 모음

---

## 4. 셀프 비평 루프 — "에이전트에게 눈을 달아주기" 계열

공통 전제 (Expo): **"AI 에이전트는 UI를 코드로는 추론하지만 그림으로는 보지 못한다(no eyes). 눈을 주는 방법은 스크린샷을 다시 먹이는 것뿐."**

| 스킬/도구 | 루프 |
|---|---|
| `design-loop` (tonymfer) | 섹션별(`<header>/<main>/<section>` 랜드마크 감지) 스크린샷 → **안티-slop 5기준 채점** → 상위 이슈 수정 → 자동 반복. 4단 피라미드: lint(코드만 즉시, "시각 이슈 80%는 코드에서 감지") → score(스크린샷 5초 채점) → fix(30초) → loop(풀 반복). Tailwind 토큰/shadcn/Radix 등 자동 감지해 기존 토큰 존중 |
| `critiquing-visual-design` (Prasad) | render → 스크린샷 → **8대 원칙 루브릭 비평** → redesign → 반복. 8원칙: Contrast/Hierarchy/Alignment/Proximity/Repetition/Balance/White space/Unity (Expo "How to apply professional design principles in AI app development") |
| `design-review-skill` (AslanMazhidov) | Playwright MCP로 3폭 캡처 → 타이포·대비·리듬·위계 감사 → CSS 수정안 제시 |
| Anthropic 공식 | frontend-design 스킬 자체에 "스크린샷 찍어 셀프 크리틱" 내장 |
| Impeccable | 무한 루프 대신 **bounded passes**(1회 배치 검사+수정+1회 확인) — 비용 통제 |
| Steve Kinney (강의) | visual regression을 피드백 루프로 — 에이전트 자기테스트 일반론 |

---

## 5. 룰 파일 · 워크플로우 패턴

- **3계층 분리** (AWS Builder 정리): `AGENTS.md`(프로젝트 전역) / `SKILL.md`(과업별 온디맨드) / `DESIGN.md`(디자인 소스 오브 트루스) — Cursor는 `.cursor/rules/*.mdc` + glob 스코핑
- **Plainwork 프롬프트 템플릿**이 최소 완성형: 읽을 파일 지정 → 사용 가능한 것 제한 → 금지 목록 → 마지막에 린터 실행 명령
- **getdesign.md**: 유명 사이트들의 디자인 시스템을 DESIGN.md로 추출해둔 모음 — "에이전트에게 물려줄 뼈대"
- **한국어 워크플로우** (브런치 @acc9b16b9f0f430/240, 5단계): ①뼈대(Design MD) → ②톤(눈누 한글 폰트) → ③눈높이(Dribbble·21st.dev 레퍼런스 캡처) → ④정확한 지시(**"개선 아이디어를 제안하게 하고, 승인한 항목만 순차 수정"** — 한 번에 다 바꾸면 폭주) → ⑤생기(실이미지 등)
- **레퍼런스 주입**: 잘 만든 사이트 스크린샷을 주고 deconstruct→적용 (OpenAI Codex 공식 유스케이스에도 있음)
- **Expo의 DIY 상한**: "레퍼런스 캡처→AI가 디자인 해체→항목화→적용"은 되지만 유일성은 없다 — 8원칙 어휘로 비평·반복해야 polish에 도달

---

## 6. 전 소스 교집합: 반패턴 톱 리스트

빈도 = 언급한 소스 수 (공식2 + 커뮤니티8 + 라이브러리3 + 루프4 기준)

| 반패턴 | 빈도 | 비고 |
|---|---|---|
| Inter/Roboto/Geist 등 디폴트 폰트 | 만장일치 | "아무도 고르지 않을 때 나오는 것" |
| 보라→파랑(indigo→violet) 그라디언트 | 만장일치 | Tailwind indigo-500 유래, A1 |
| 그라디언트 클립 텍스트 | 다수 | 강조는 크기·weight·서체로 |
| 중앙정렬 히어로 + eyebrow(대문자 소라벨) | 만장일치 | eyebrow는 2번째로 강한 텔 |
| 아이콘+제목+2문장 동일 카드 3개 그리드 | 만장일치 | "가장 강한 텔" |
| 이모지를 아이콘/불릿으로 | 다수 | A63 |
| 글래스모피즘/glow | 다수 | |
| 전 요소 동일 대형 radius, pill 남발 | 다수 | radius 정책 문서화가 해법 |
| 모든 섹션 fade-up 스크롤 리빌 | 다수 | 모션은 오케스트레이션 1회 |
| 스톡 카피 ("Seamless/Supercharge/Unlock") | 다수 | 카피=디자인 |
| 가짜 지표/테스티모니얼/로고월 | 다수 | hallmark 46a로 금지 |
| shadcn/Tailwind 디폴트 값 그대로 | 다수 | #3B82F6, indigo-500 |
| 클로드 룩(cream+세리프+terracotta #D97757) | 공식 | 벤더 브랜드색 모방도 텔 |
| "Space Grotesk로 수렴" | 공식 | 안티 디폴트도 새 디폴트가 됨 |
| KPI 카드 그리드 디폴트 대시보드 | 커뮤니티 | no-slop-ui |
| 손그린 브라우저/OS 창 목업 | 커뮤니티 | hallmark 47a |

---

## 7. 전 소스 교집합: 해법 원칙 8개

1. **일반론 금지, 패턴을 이름으로 금지** — "generic 피하기"는 안 통하고 "A1 그라디언트 금지"는 통한다 (모든 벤더·커뮤니티 합의)
2. **방향을 하나 정해 커밋** — Editorial/Swiss/warm/mono... 중 하나를 이름으로 선언, 절대 평균 금지. 자율로 두면 딜링(3장 뽑기 강제)이라도
3. **아이디어는 주제에서** — 산업·소재·언어가 비주얼 소스. 유사 프롬프트로 재현 가능한 결과는 다시 설계
4. **카피도 디자인** — 스톡 문구·가짜 지표가 텔. 실제 내용, 실제 수치
5. **에이전트에 눈** — 스크린샷→루브릭 비평→수정 루프. 단, bounded(1-2회)로 비용 통제
6. **토큰/DESIGN.md 선행** — 프리스타일 금지, 모든 색·폰트는 선언된 토큰 경유
7. **기계 검증 통과** — slop-lint/MCP check_design/훅으로 클린 확인 후 제출
8. **크래프트 플로어 유지** — focus-visible, reduced-motion, 반응형, alt는 스타일과 무관한 하한선 (slop 제거가 접근성 희생이 되지 않게)

---

## 8. 수집 파일 목록 (artifacts/ui-anti-slop-skills/)

**공식**: anthropic-frontend-design.md · claude-code-plugin-frontend-design.md · jetbrains-frontend-design.md · jetbrains-antfu-web-design-guidelines.md · jetbrains-ui-website-style.md · vercel-web-design-guidelines-skill.md · vercel-web-interface-guidelines-AGENTS.md
**대형 커뮤니티**: taste-skill(★101.7k) · hallmark/SKILL+refs 6종 · impeccable · unslop-ui · no-ai-slop+TELLS(~100) · no-slop-ui 4종 · ux-design · awwwards · tasteful-ui · design-taste
**루프**: design-loop(score/lint) · critiquing-visual-design · design-review-aslanmazhidov
**라이브러리**: slop-patterns/(patterns.json 531레코드·taxonomy·check-ui 스킬·cursor 룰) · pixelslop 카탈로그

## 9. 주요 링크

- Anthropic 블로그: https://claude.com/blog/improving-frontend-design-through-skills
- Anthropic 스킬: https://github.com/anthropics/skills (skills/frontend-design) · 플러그인: https://github.com/anthropics/claude-code/tree/main/plugins/frontend-design
- taste-skill: https://github.com/Leonxlnx/taste-skill
- hallmark: https://github.com/Nutlope/hallmark
- Impeccable: https://impeccable.style (+/slop, /docs/hooks)
- Slop Patterns: https://sloppatterns.com · 라이브러리: https://github.com/pavithralamahewa/slop-patterns · MCP: https://sloppatterns.com/mcp
- slop-lint/16체크: https://plainworkdigital.com/d20261013a2/why-ai-websites-look-the-same
- unslop-ui: https://github.com/iamneilroberts/claude-skills · no-ai-slop: https://github.com/claudiusararu/unslop-ui-skill
- no-slop-ui: https://github.com/LeoStehlik/no-slop-ui · ux-design: https://github.com/Nima-Edelkhani/claude-ux-design-skill
- Vercel: https://vercel.com/design/guidelines · https://github.com/vercel-labs/agent-skills
- design-loop: https://github.com/tonymfer/design-loop · 8원칙: https://expo.dev/blog/how-to-apply-professional-design-principles-in-ai-app-development
- JetBrains skills: https://github.com/JetBrains/skills
- 한국어 5단계: https://brunch.co.kr/@acc9b16b9f0f430/240 · getdesign.md: https://getdesign.md/
