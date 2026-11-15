# 원판돌리기 사이트 — GitHub·Render 배포 안내

이 폴더는 사용자용 원판돌리기 페이지와 관리자용 설정 페이지를 포함한 Node.js 서버 프로젝트입니다.

## 페이지

- 사용자 페이지: `/`
- 관리자 페이지: `/admin`
- 설정 API: `/api/settings`

## GitHub 업로드

1. GitHub에서 새 저장소를 만듭니다. 예: `roulettehub`
2. 이 폴더 안의 파일과 `public` 폴더를 저장소에 업로드합니다.
3. `node_modules`, `.env`, 비밀번호가 들어간 파일은 업로드하지 않습니다.

## Render 배포

Render에서 **New + → Web Service → GitHub 저장소 연결**을 선택합니다.

다음 값을 사용하면 됩니다.

- Runtime: Node
- Build Command: `npm ci`
- Start Command: `npm start`
- Plan: Free

저장 설정을 유지하려면 Render 서비스의 **Environment**에 다음 환경변수를 등록해야 합니다.

```text
DATABASE_URL=mysql://사용자명:비밀번호@호스트:3306/데이터베이스명
```

`DATABASE_URL`을 등록하지 않으면 사이트는 실행되지만 관리자 설정이 서버 메모리에만 저장되어 재시작 시 사라질 수 있습니다.

## 주의사항

Render Free Web Service는 일정 시간 요청이 없으면 잠들 수 있고, 다시 접속할 때 기동 시간이 발생할 수 있습니다. 로컬 파일에 저장하는 방식은 재시작 때 유지되지 않으므로 관리자 설정은 반드시 외부 MySQL/MariaDB에 저장해야 합니다.

`DATABASE_URL`에는 실제 비밀번호를 넣은 파일을 GitHub에 올리지 마세요. 비밀번호는 Render Dashboard의 Environment에서 직접 입력하세요.
