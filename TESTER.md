# 사말이 미션 평가 운영

기존 React 프런트엔드의 `/tester` 화면과 FastAPI의 `/api/tester`를 사용합니다. 프런트엔드의 `VITE_API_URL`은 API 주소를 가리켜야 합니다. API에는 기존 PostgreSQL의 `DATABASE_URL`, `JWT_SECRET`, 일기 분석과 공통 미션 생성에 쓰는 `GROQ_API_KEY`를 설정합니다. 백엔드 첫 기동 시 평가용 테이블 세 개가 생성됩니다.

## 공통 미션 준비와 초대

백엔드가 테이블을 만든 뒤, 같은 환경 설정을 사용하는 `backend` 디렉터리에서 실행합니다.

```powershell
python -m scripts.tester_round prepare
python -m scripts.tester_round invite --count 2 --frontend-url https://사말이-프런트엔드-주소
```

`prepare`는 지정된 영어 발표 일기를 기존 AI 생성기에 넣습니다. 공통 미션 ID `english-presentation-v1`에 처음 저장한 결과가 이후 모든 테스터에게 표시됩니다. 다시 실행하면 저장된 미션을 출력합니다.

`invite`는 익명 참가자 ID와 개인별 링크를 출력합니다. 한 사람에게 링크 하나를 전달합니다. 기존 앱 계정의 ELO를 쓰려는 참가자가 동의하면 해당 참가자의 링크를 만들 때 `--app-user-id <사용자 ID>`를 지정합니다. 이 경우 분석 화면은 그 계정의 현재 레이팅을 읽습니다. 연결된 계정이 없는 참가자에게는 기본 레이팅 1,000이 표시됩니다.

## 평가 확인

```powershell
python -m scripts.tester_round results
```

출력에는 참가자 ID, 미션 ID, 상황 적합성(`relevance`), 명확성(`clarity`), 실행 가능성(`feasibility`), 선택 의견과 제출 시각이 포함됩니다. 같은 링크에서 재제출해도 최초 응답이 유지됩니다. URL 조각(`#invite=…`)에 담긴 초대 토큰은 DB에 해시로 저장됩니다.

일기 본문은 기존 Groq 분석 호출에 사용됩니다. 운영 DB에는 참가자의 분석 완료 시점만 저장합니다. 채점 전에 페이지를 새로고침하면 일기 작성 단계부터 다시 시작하고, 채점 후에는 완료 화면이 표시됩니다.

## 두 테스터 검증

```powershell
python -m pip install -r requirements.txt aiosqlite
python -m unittest -v test_tester_round
```

테스트는 실제 FastAPI 라우터와 임시 SQLite DB를 사용합니다. Groq의 HTTP 응답은 테스트 데이터로 대체합니다. 참가자별 원문 근거와 ELO, 동일한 공통 일기와 미션, 별도 평가 저장 및 재제출을 확인합니다.
