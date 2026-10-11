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
   | `Summary` | Text | (선택) 요약 → 글은 meta description, 프로젝트는 목록의 한 줄 설명 |
   | `Type` | Select | `Work` = 프로젝트(홈 Work 섹션), 비우거나 `Article` = 글(Writing) |
   | `Role` | Text | (선택) 프로젝트에서 맡은 역할 → 목록과 상세에 표시 |

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

## 인터랙션 (Notion에서 쓰는 법)
- **Before/After 슬라이더**: 이미지 블록 2개를 연달아 넣고 캡션을 `@compare As-is`, `@compare To-be`로 작성 (`@compare` 뒤 글자가 라벨. 비우면 As-is / To-be). 마우스·터치 드래그, 키보드 ←/→ 지원.
- **임베드**: Notion에서 `/embed`(또는 `/video`)로 링크를 넣으면 iframe으로 표시. Figma 프로토타입·YouTube·Vimeo는 자동으로 임베드 주소로 변환. `https` 링크만 지원. (북마크로 붙이면 일반 링크로만 나옴)

## 자주 쓰는 명령어 (맥 터미널)
```bash
# 1회 설정: GitHub CLI 설치 및 로그인
brew install gh
gh auth login

# 배포 실행 (Notion 글 수정 후 바로 반영하고 싶을 때)
gh workflow run deploy.yml -R bbabann/Professional

# 진행 상황 보기
gh run watch -R bbabann/Professional

# 권한 에러가 날 때
gh auth refresh -s workflow

# 짧은 이름으로 줄이기 (이후 터미널에서 deploy 만 입력)
echo "alias deploy='gh workflow run deploy.yml -R bbabann/Professional'" >> ~/.zshrc && source ~/.zshrc
```
- 코드 변경을 푸시하면 자동 배포되므로 위 명령은 **Notion 글을 고쳤을 때**만 필요.
- 브라우저로 할 때: https://github.com/bbabann/Professional/actions/workflows/deploy.yml → Run workflow
- 터미널 기록 검색: `Ctrl+R` 후 `workflow` 입력

## 형광펜 + 코멘트 팝업
Notion 글에서 문구를 **노란 배경색**(텍스트 색 메뉴의 `Yellow background`)으로 칠하면 사이트에서 형광펜으로 표시되고, 그 **문단에 달린 코멘트**가 마우스를 따라다니는 팝업으로 나옵니다 (터치 기기는 탭하면 열고 닫음).
- Notion API는 코멘트가 달린 **문구**를 알려주지 않고 **문단(블록)**만 알려주기 때문에, 문구 위치는 노란 배경색으로 찾습니다. 코멘트를 달 문구에 노란 배경을 같이 칠해 주세요.
- 필요한 설정: Notion 통합(integration)의 **Read comments** 권한을 켜야 합니다 (없으면 형광펜만 표시되고 빌드 로그에 안내가 남음).
- 한 문단에 형광펜 구간이 하나면 그 문단의 코멘트를 모두 보여주고, 여러 개면 **코멘트를 단 순서 = 왼쪽부터 순서**로 연결합니다.
- 팝업은 -5도 기울어진 카드로 나옵니다 (`style.css`의 `.note-tip`의 `rotate(-5deg)`에서 각도 변경).
- 코멘트에 **이미지를 첨부**하면 팝업에 이미지로 표시되고, 이미지 사방에 4px 여백이 들어갑니다 (`.note-img`의 `padding`). 이미지는 빌드 때 내려받아 저장합니다. (코멘트의 `attachments` 필드는 이미지 첨부가 있을 때만 오는 것으로 알고 있으나, 실제 Notion 응답으로는 아직 확인하지 못함)
- 같은 스레드의 답글은 한 팝업에 이어서 표시됩니다. 해결(resolved)된 코멘트는 API가 주지 않아 표시되지 않습니다.
- 형광펜(노란 배경)이 있는 문단의 코멘트만 공개되므로, 형광펜이 없는 문단의 내부 메모는 노출되지 않습니다. **노란 배경을 칠한 문단의 코멘트는 모두 공개된다**는 점에 주의하세요.

## 폰트
`<html data-font="pretendard|suite">` 로 전환 (비교용). 헤드라인만 Newsreader.
