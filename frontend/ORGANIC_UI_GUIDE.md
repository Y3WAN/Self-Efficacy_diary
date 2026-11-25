# Organic Curvilinear UI 적용·제거 가이드

디자인 브랜치 `codex/organic-curvilinear-ui`의 구현 커밋 `4d8da00`을 기준으로 작성했습니다. 파일 경로는 `frontend/` 기준입니다.

## 기존 화면에 적용되는 방식

`src/main.jsx`가 `index.css` 다음에 `organic.css`를 한 번 가져옵니다. `organic.css`의 선택자가 기존 클래스나 HTML 요소와 일치할 때 곡선이 적용됩니다. 예를 들어 `.chart-card`, `.today-card`, `.btn`, 입력칸은 이미 연결되어 있어 화면마다 코드를 추가할 필요가 없습니다.

카드는 안쪽 사각형에서 텍스트와 여백을 배치하고, `::after`가 그 뒤에서 바깥 윤곽과 배경을 그립니다. 이 장식 요소에는 `pointer-events: none`이 적용돼 클릭과 입력은 원래 요소가 받습니다. `container-type: inline-size`로 카드 너비를 읽을 수 있게 하고, `--panel-bend`로 긴 변의 굴곡을 계산합니다. 버튼과 입력칸은 크기에 따라 휘되 짧은 옆면의 굴곡에는 상한을 둡니다.

텍스트 밑줄과 구분선은 기본 CSS 규칙을 사용합니다. 그래프와 점수 막대의 좌표와 길이는 데이터가 결정합니다. `border-shape`를 지원하지 않는 브라우저에서는 기본 스타일과 일부 요소의 비대칭 `border-radius`가 적용됩니다.

## 새 컨테이너에 적용하기

| 상황 | 적용 방법 |
| --- | --- |
| 기존과 같은 카드나 버튼 | 기존 컴포넌트나 클래스 조합을 재사용합니다. 일반 카드에는 `.chart-card`, 강조 버튼에는 `.btn.btn--primary`를 쓸 수 있습니다. |
| 새 이름을 가진 카드 | `organic.css`에서 새 클래스에 `--organic-contour`를 지정하고, 카드의 `::after`를 만드는 공통 선택자 목록에도 추가합니다. 같은 모양의 브라우저 대체 표시가 필요하면 파일 아래의 `border-radius` 목록에도 추가합니다. |
| 새 이름을 가진 버튼이나 배지 | 버튼에는 `--contour-button`이나 `--contour-petal`, 작은 원형 요소에는 `--contour-pebble`을 선택합니다. 전체 카드용 `::after` 목록에는 넣을 필요가 없습니다. |
| 새 입력칸 | 체크박스와 라디오 버튼을 제외한 `input`, `textarea`, `select`는 기본 선택자가 잡습니다. 배경색과 입력 여백은 컴포넌트의 기본 스타일에서 정합니다. |

### 예시 · 나의 미션 탑

`MissionStack.jsx`의 바깥쪽 요소인 `.stack-card`는 아래 세 군데에 연결돼 있습니다. 새 전용 카드를 추가할 때 이 구성을 예시로 쓸 수 있습니다.

1. `--contour-card`를 지정하는 카드 그룹에 `.stack-card`를 추가합니다.
2. `::after`를 생성하는 `#root :where(...)` 카드 목록에도 `.stack-card`를 넣습니다.
3. 기존 탑의 그림자 세기에 맞춰 `--surface-shadow: var(--shadow-sm)`을 쓰는 그룹에 연결합니다. 파일 마지막의 카드 목록은 `border-shape`가 없을 때 대체 모서리를 적용합니다.

탑의 필터와 책, 상태 배지는 버튼과 같은 작은 곡선 그룹을 씁니다. 책의 길이와 배치는 `MissionStack.jsx`의 `bookShape()`가 담당합니다.

배경이나 테두리가 다른 새 카드라면 `--surface-background`, `--surface-border`, `--surface-shadow`로 장식층의 표시를 맞춥니다. 값은 해당 카드의 기본 스타일을 기준으로 정합니다.

## 디자인을 제거하기

### main에 병합하기 전

- 디자인을 보류하려면 작업 브랜치를 보관하고 PR이 열려 있다면 닫습니다. 브랜치 삭제는 작업 내역까지 정리할 때 선택하는 별도 작업입니다.
- 디자인 브랜치에서 이 변경만 빼려면 GitHub Desktop에서 `codex/organic-curvilinear-ui`를 선택합니다. **History**에서 `4d8da00`을 우클릭하고 **Revert Changes in Commit**을 선택합니다. 만들어진 취소 커밋을 검토하고, 원격 브랜치에도 반영할 때 푸시합니다. [GitHub Desktop 커밋 되돌리기](https://docs.github.com/en/desktop/managing-commits/reverting-a-commit-in-github-desktop)

### main에 병합한 뒤

`main`의 **History**에서 디자인을 도입한 커밋의 변경 내역을 열고, 해당 커밋을 되돌리는 새 커밋을 만듭니다. 일반 병합으로 원래 커밋이 남아 있으면 `4d8da00`을 찾습니다. Squash merge 또는 rebase merge로 들어갔다면 `main`에 실제로 들어간 커밋을 찾습니다. 한 커밋에 보존하려는 변경도 들어 있으면 아래 표의 디자인 변경 부분만 되돌립니다. 특히 `src/index.css`에는 `main`의 미션 탑 스타일도 들어 있으므로 디자인에서 바꾼 두 줄을 기준으로 검토합니다.

### 파일별 원복 범위

| 파일 | 원복 내용 |
| --- | --- |
| `src/main.jsx` | `import './organic.css'` 한 줄 제거 |
| `src/organic.css` | 곡선, 카드 장식층, 관련 보조 규칙을 담은 파일 제거 |
| `src/index.css` | `--card-padding`을 `clamp(14px, 3.6vw, 22px)`로, 입력칸 공통 `padding`을 `10px 13px`로 복원 |
| `src/App.jsx` | 토스트의 `className: "app-toast"`를 제거하고 `style.borderRadius`를 `"12px"`로 복원 |
| `src/components/Icon.jsx` | 디자인 커밋에서 바뀐 메뉴·새싹·사용자·정보·트로피·경고 아이콘 경로 복원 |
| `public/favicon.svg` | 디자인 커밋에서 바뀐 브라우저 탭 아이콘 복원 |
| `src/pages/AboutPage.jsx` | 디자인 가이드의 카드 여백과 모서리 설명 복원 |

곡선 외곽만 잠시 끄는 테스트에는 `src/main.jsx`의 import 한 줄을 빼면 됩니다. 토스트, 아이콘, 파비콘, 여백도 이전 상태로 돌리려면 표의 나머지 변경을 함께 복원합니다.

## 확인 방법

`frontend`에서 `npm run build`를 실행합니다. `npm run dev`로 홈을 열고, 좁은 화면과 넓은 화면에서 카드 여백과 버튼 모양을 확인합니다. 입력칸의 키보드 포커스와 일기 카드의 메뉴도 함께 확인하면 카드 장식이나 여백 변경이 사용을 방해하는지 판단할 수 있습니다.
