# 단조 생산성 · 가스원단위 관리 웹앱

현장에서 매월 작성하는 엑셀 파일만 업로드하면 생산량과 가스검침량을 자동으로 집계하고, 라인별 목표/실적과 시간당 생산량, 가스원단위를 한 화면에서 확인하는 운영용 웹앱입니다.

## 핵심 기능

- 생산량집계표 엑셀 업로드
- 호기별 가스검침량 엑셀 업로드
- 업로드 전 시트/컬럼 매핑 미리보기
- 라인별 연간 목표 vs 실적
- 제품별/재질별 시간당 생산량
- 태상 vs 태웅 가스원단위 비교
- 운영자용 샘플 엑셀 다운로드
- 관리자용 역할 관리

## 기술 스택

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- Supabase Postgres, Auth, RLS
- Recharts
- SheetJS `xlsx`

## 화면 구성

1. 업로드 화면
   - 엑셀 드래그앤드롭
   - 시트/컬럼 매핑 미리보기
   - 검증 후 적재
   - 샘플 엑셀 다운로드

2. 생산성 대시보드
   - 라인별 연간 목표 vs 실적
   - 달성률
   - 3개년 추세
   - 월별 변동

3. 시간당 생산량
   - 제품별/재질별 톤/h
   - 두산 벤치마크 비교
   - 금형강 25, 크랭크축 26, 쉘 10, 로터 7

4. 가스원단위
   - 태상 vs 태웅 비교
   - 가열로별 원단위
   - Product Mix별 원단위
   - 고지/자체 토글

5. 역할 관리
   - 관리자 전용
   - 사용자 역할 수정
   - 마지막 admin 계정 보호

## 공용 모드

이 앱은 로그인 없이도 기본 화면을 바로 사용할 수 있습니다.

- 업로드와 조회는 공용 모드로 동작합니다.
- 로그인은 관리자 역할 관리가 필요할 때만 사용하면 됩니다.
- Supabase Auth가 설정되어 있어도, 세션이 없으면 게스트 모드로 열립니다.

## 권한

- `viewer`: 조회만 가능
- `operator`: 조회 + 엑셀 업로드/적재 가능
- `admin`: operator 권한 + 사용자 역할 관리 가능

## 첫 admin 지정

Supabase Auth를 사용할 경우, 첫 admin은 SQL Editor에서 한 번만 지정하면 됩니다.

```sql
update public.profiles
set role = 'admin'
where email = 'admin@company.com';
```

이후부터는 관리자 계정으로 로그인해서 운영자를 `operator`로 바꾸는 방식으로 관리하면 됩니다.

## 운영자용 템플릿 다운로드

업로드 화면 상단에서 다음 샘플 파일을 다운로드할 수 있습니다.

- 생산량집계표 템플릿
- 가스검침량 템플릿

템플릿 라우트:

- `/api/templates/production`
- `/api/templates/gas`

## 데이터 모델

### production

- `ym`
- `line` (`P5`, `P8`, `P15`, `RM`)
- `product`
- `material`
- `weight_ton`
- `work_hours`
- `plan_ton`

### gas_reading

- `ym`
- `furnace_no`
- `line`
- `usage_m3`
- `basis` (`고지` / `자체`)

### 가열로 → 라인 매핑

- `P15`: 6, 16, 17, 18, 19, 20
- `P5`: 1, 2, 3, 4, 5
- `P8`: 14, 15
- `RM`: 7 ~ 13

### 파생값

- 시간당 생산량 = `weight_ton / work_hours`
- 가스원단위 = `라인가스 / 라인생산톤`

모든 계산식은 화면에서 분자/분모를 함께 보여주도록 구성했습니다.

## 로컬 실행

### 1. 설치

```bash
npm install
```

### 2. 환경 변수 설정

프로젝트 루트의 `.env.local`에 아래 값을 넣습니다.

```bash
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

선택 사항:

```bash
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

이 앱은 다음 별칭도 읽습니다.

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_SERVICE_ROLE_KEY`

`SUPABASE_SERVICE_ROLE_KEY`는 서버 전용입니다. 클라이언트에 노출하면 안 됩니다.

### 3. 개발 서버

```bash
npm run dev
```

브라우저에서 `http://localhost:3000`으로 접속합니다.

### 4. 검증

```bash
npm run lint
npm run build
```

## Supabase 설정

1. Supabase 프로젝트를 생성합니다.
2. `supabase/schema.sql`을 실행해 테이블, RLS, 트리거, 함수, 인덱스를 만듭니다.
3. Auth에서 이메일/비밀번호 로그인을 활성화합니다.
4. 첫 admin 계정을 SQL Editor에서 지정합니다.
5. 운영 환경에는 서버 전용 `SUPABASE_SERVICE_ROLE_KEY`를 추가합니다.

## 배포

Vercel 배포 시 최소한 다음 환경 변수를 등록하세요.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

공용 모드에서 Supabase에 저장하고 싶다면 `SUPABASE_SERVICE_ROLE_KEY`가 필요합니다. 이 키가 없으면 앱은 로컬 저장소로 fallback합니다.

## 업로드 규격

### 생산량집계표

권장 컬럼:

- `ym`
- `line`
- `product`
- `material`
- `weight_ton`
- `work_hours`
- `plan_ton`

### 가스검침량

권장 컬럼:

- `ym`
- `furnace_no`
- `line`
- `usage_m3`
- `basis`

## 업로드 실패 시

- 어떤 시트가 문제인지 확인합니다.
- 날짜 형식이 `YYYY-MM`인지 확인합니다.
- 숫자 칸에 문자가 섞이지 않았는지 확인합니다.
- `line` 값이 `P5`, `P8`, `P15`, `RM` 중 하나인지 확인합니다.
- 가스 데이터는 호기 번호와 라인 매핑이 맞는지 확인합니다.

## 문제 해결

- 로그인 화면이 꼭 필요해 보이면
  - Supabase Auth 환경 변수가 설정되어 있는지 확인하세요.
  - 게스트 모드로 쓰려면 로그인 없이 `/`로 바로 들어가면 됩니다.
- 업로드 후 데이터가 안 보이면
  - `SUPABASE_SERVICE_ROLE_KEY`가 있는지 확인하세요.
  - 없으면 로컬 저장소로 fallback합니다.
- 역할 관리 탭이 안 보이면
  - `admin` 계정으로 로그인했는지 확인하세요.

## 라우트

- 대시보드: `/`
- 로그인 보조 화면: `/login`
- 업로드 API: `/api/import`
- 템플릿 다운로드: `/api/templates/production`, `/api/templates/gas`

