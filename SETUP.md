# 프로젝트 설정 가이드

## 1. Node.js 설치 (필수)

이 프로젝트는 **Node.js 18 이상**이 필요합니다. (권장: Node.js 20 LTS)

### Windows 설치 방법

1. [Node.js 공식 사이트](https://nodejs.org/ko) 접속
2. **LTS 버전** 다운로드 및 설치
3. 설치 후 **새 터미널**을 열고 아래 명령어로 확인:
   ```bash
   node -v   # v20.x.x 형태로 출력되면 성공
   npm -v    # 10.x.x 형태로 출력되면 성공
   ```

### nvm (Node Version Manager) 사용 시

```bash
nvm install
nvm use
```

---

## 2. 의존성 설치

Node.js 설치가 완료된 후:

```bash
npm install
```

---

## 3. 개발 서버 실행

```bash
npm run dev
```

브라우저에서 `http://localhost:5173` (또는 터미널에 표시된 포트)로 접속하세요.

---

## 4. Firebase 설정 (이미 완료됨)

`src/config.ts`에 Firebase 설정이 이미 입력되어 있습니다.  
다른 Firebase 프로젝트를 사용하려면 해당 파일을 수정하세요.

---

## 5. 빌드

```bash
npm run build
```

---

## 요약 - 처음 설정 시 순서

1. Node.js 설치
2. 터미널에서 `cd "c:\Users\seonb\Desktop\cleaning-tool-cal-main"`
3. `npm install`
4. `npm run dev`
