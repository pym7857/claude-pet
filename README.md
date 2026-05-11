# claude-pet

Claude Code 이벤트에 반응하는 데스크탑 펫. 픽셀 아트 얼굴 두 개(평범/놀람).
사용자의 YES/NO 입력을 기다릴 때(=Notification 훅 발화) 놀란 표정으로 바뀐다.

## 동작

- Claude Code 훅이 이벤트 발생 시 `hooks/on-event.js` 호출
- 핸들러는 이벤트의 `cwd`가 `config.json`의 화이트리스트에 포함될 때만 상태를 기록
- 상태 파일: `~/.claude/hooks/claude-pet/state.json`
- Electron 렌더러가 이 파일을 폴링하면서 얼굴을 전환

## 설치

```bash
npm install
node scripts/gen-assets.js          # 픽셀 아트 PNG 생성 (이미 만들어둠)
node scripts/install-hooks.js       # ~/.claude/settings.json 에 훅 등록
npm start                           # 펫 띄우기
```

> VSCode 통합 터미널에서 띄울 때는 `ELECTRON_RUN_AS_NODE`가 상속되어 GUI 모드가 안 뜬다.
> `npm start` 스크립트가 이를 해제하도록 설정되어 있으니 그대로 쓰면 됨.
> 직접 `electron .`으로 띄울 거면 `ELECTRON_RUN_AS_NODE= electron .`처럼 해제해야 함.

훅 제거:

```bash
node scripts/install-hooks.js --uninstall
```

## 설정 (`config.json`)

```json
{
  "projects": ["/Users/me/Desktop/some-project"],
  "petPosition": "bottom-right",
  "petSize": 160,
  "pollIntervalMs": 500
}
```

- `projects`: 추적할 프로젝트 절대 경로 화이트리스트. 하위 디렉토리도 매칭됨.
- `petPosition`: `bottom-right` | `bottom-left` | `top-right` | `top-left`

## 표정이 바뀌는 조건

| 상황 | 표정 |
|---|---|
| Claude가 권한/입력 대기 (Notification) — YES/NO 응답 기다리는 중 | **놀람** |
| 그 외 모든 상황 | 평범 |

## 픽셀 아트 교체

`assets/normal.png`, `assets/surprised.png`를 원하는 PNG로 갈아끼우면 됨. 정사각형 권장, 픽셀 아트는 `image-rendering: pixelated`로 렌더링됨.

## 폴더 구조

```
claude-pet/
├── main.js              # Electron 메인
├── preload.js           # state/config 노출
├── config.json          # 화이트리스트
├── assets/              # PNG 두 개
├── renderer/            # 펫 UI
├── hooks/on-event.js    # Claude Code 훅 핸들러
└── scripts/
    ├── gen-assets.js    # 픽셀 아트 PNG 생성기
    └── install-hooks.js # ~/.claude/settings.json 설치/제거
```
