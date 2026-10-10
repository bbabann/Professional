# 류서환 Portfolio

HTML/CSS 정적 사이트 (shadcn 톤, 텍스트 중심). Notion 데이터베이스의 글을 빌드 시 HTML로 변환해 게시합니다.

## 구조
- `index.html` / `writing.html` / `article.html` / `project.html` — 페이지와 템플릿 (`<!--posts-->`, `<!--title-->` 등 마커 사이가 빌드 때 치환됨)
- `style.css`, `script.js` — 디자인 토큰, 분할 패널(좌 1 : 우 2)
- `scripts/notion.mjs` — Notion API 호출 + 블록 → HTML 변환
- `scripts/build.mjs` — `dist/` 생성 (정적 파일 복사 + 글 페이지/목록 생성)
- `.github/workflows/deploy.yml` — 30분마다/수동/푸시 시 빌드 후 GitHub Pages 배포

## Notion 설정
1. https://www.notion.so/profile/integrations 에서 **내부 통합(Internal integration)**을 만들고 토큰을 복사.
2. 글용 **데이터베이스**를 만들고 속성을 아래와 같이 맞춤 (이름 정확히):

   | 속성 | 타입 | 설명 |
   |---|---|---|
   | (제목) | Title | 글 제목 (이름은 무관) |
   | `Slug` | Text | 주소에 쓰일 영문 이름. 비우면 제목으로 자동 생성 |
   | `Date` | Date | 게시일 (최신순 정렬) |
   | `Tags` | Multi-select | 태그 |
   | `Published` | Checkbox | **체크된 글만 게시** |
   | `Summary` | Text | (선택) 요약 → meta description |

3. 데이터베이스 페이지 우측 상단 `···` → **연결(Connections)** → 만든 통합 추가.
4. 데이터베이스 ID 복사: 주소 `notion.so/<워크스페이스>/<DATABASE_ID>?v=...` 의 `<DATABASE_ID>` 32자.

## GitHub 설정 (1회)
1. 저장소 Settings → Secrets and variables → Actions → **New repository secret**
   - `NOTION_TOKEN`, `NOTION_DATABASE_ID`
2. Settings → Pages → Source를 **GitHub Actions**로 변경.
3. 스케줄 실행은 저장소의 **기본 브랜치**에서만 동작함 (현재 기본 브랜치: `claude/cool-cori-phxzqz`. 나중에 `main`으로 옮기면 워크플로의 `branches`도 맞춰 둘 것).
4. Actions 탭 → "Build & Deploy" → **Run workflow** 로 첫 배포.

이후 Notion에서 `Published`를 체크하면 최대 30분 안에 사이트에 반영됩니다. 바로 반영하려면 Actions에서 Run workflow.

## 로컬에서 확인
```bash
# 토큰 없이: placeholder 그대로 dist/ 생성
node scripts/build.mjs
# Notion 글 포함
NOTION_TOKEN=secret_xxx NOTION_DATABASE_ID=xxxx node scripts/build.mjs
```
`dist/index.html`을 브라우저로 열면 됩니다. 토큰은 절대 커밋하지 마세요 (`.env`는 `.gitignore`됨).

## 지원하는 Notion 블록
문단, 제목(1~3), 글머리/번호 목록(중첩), 체크리스트, 인용, 콜아웃, 코드, 구분선, 토글, 이미지(빌드 시 내려받아 저장 — Notion 파일 URL은 1시간 후 만료됨), 북마크. 그 외 블록은 건너뛰고 빌드 로그에 경고를 남깁니다.

## 폰트
`<html data-font="pretendard|suite">` 로 전환 (비교용). 헤드라인만 Newsreader.
