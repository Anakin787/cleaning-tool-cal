# 우리들의 모임

모임 일정 관리 및 투표 앱 (React + Firebase)

## 실행 방법

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:5173` (또는 터미널에 표시된 포트)로 접속하세요.

## Firebase 설정

1. [Firebase Console](https://console.firebase.google.com)에서 프로젝트 생성
2. Authentication에서 **익명 로그인** 활성화
3. Firestore 데이터베이스 생성
4. `src/config.ts`에 Firebase 설정 값 입력:

```ts
export const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef",
};
```

## Firestore 보안 규칙

`schedules`와 `polls` 컬렉션에 대한 읽기/쓰기 규칙을 설정해야 합니다.
경로: `artifacts/{appId}/public/data/schedules`, `artifacts/{appId}/public/data/polls`

## GitHub Pages 배포

`main` 브랜치에 push하면 GitHub Actions가 자동으로 빌드 후 GitHub Pages에 배포합니다.

**최초 1회 설정**: GitHub 저장소 → Settings → Pages → Build and deployment  
Source를 **GitHub Actions**로 선택하세요.

배포 완료 후 접속 URL: `https://anakin787.github.io/cleaning-tool-cal/`
