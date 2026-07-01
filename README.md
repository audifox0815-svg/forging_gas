# 단조 생산성 · 가스원단위 관리 웹앱

현장에서 매월 작성하는 엑셀 파일만 업로드하면 생산량과 가스검침량을 자동으로 집계하고, 라인별 목표/실적과 시간당 생산량, 가스원단위를 한 화면에서 확인하는 운영용 웹앱입니다.

## 무엇을 할 수 있나요

- 생산량집계표 엑셀 업로드
- 호기별 가스검침량 엑셀 업로드
- 업로드 전 시트/컬럼 매핑 미리보기
- 셀 단위 검증 실패 원인 표시
- 라인별 연간 목표 vs 실적 대시보드
- 제품별/재질별 시간당 생산량 비교
- 태상 vs 태웅 가스원단위 비교
- 가열로별, Product Mix별 원단위 분석
- Supabase Auth를 이용한 운영자 로그인

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
   - 단위 기준 토글: 고지 / 자체

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

모든 계산식은 화면에서 분자/분모가 함께 보이도록 설계했습니다. 단위가 맞지 않으면 경고 배지를 띄웁니다.

## 로컬 실행

### 1. 설치

```bash
npm install
```

### 2. 환경 변수 준비

프로젝트 루트에 `.env.local`을 만들고 아래 값을 넣습니다.

```bash
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

선택적으로 아래 별칭도 사용할 수 있습니다.

```bash
SUPABASE_URL=your-supabase-url
SUPABASE_PUBLISHABLE_KEY=your-publishable-key
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

주의:

- `SUPABASE_SERVICE_ROLE_KEY`는 서버 전용입니다.
- 절대로 클라이언트 코드나 브라우저에 노출하지 마세요.
- 이미 `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`를 쓰고 있다면 그대로 넣어도 됩니다.
- 이 앱은 Next.js 서버에서 `NEXT_PUBLIC_*`, `SUPABASE_*`, `VITE_*`를 모두 읽도록 맞춰 두었습니다.
- `SUPABASE_SERVICE_ROLE_KEY`는 선택 사항입니다. Supabase Auth로 운영할 때는 공개 URL + 공개 키만으로도 배포가 가능합니다.

### 3. 개발 서버 실행

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
2. `supabase/schema.sql`을 실행해 테이블과 RLS 정책을 만듭니다.
3. Auth에서 이메일/비밀번호 로그인을 활성화합니다.
4. 운영자 계정을 생성합니다.
5. 서비스 롤 키는 서버 환경 변수로만 넣습니다.

`import_log` 테이블에는 파일명, 적재 시간, 건수, 경고 사항, 생성자 정보가 저장됩니다.

## 역할과 권한

- `viewer`: 대시보드 조회만 가능
- `operator`: 조회 + 엑셀 업로드/적재 가능
- `admin`: operator 권한 + 사용자 역할 관리 가능

새로 가입한 계정은 기본적으로 `viewer`입니다. 첫 관리자 계정은 Supabase SQL Editor에서 직접 승격하세요.

```sql
update public.profiles
set role = 'admin'
where email = 'admin@company.com';
```

이후부터는 관리자 계정으로 로그인해서 운영자를 `operator`로 바꾸는 방식으로 관리하면 됩니다.

## 업로드 파일 규격

### 생산량집계표

권장 컬럼:

- `ym`
- `line`
- `product`
- `material`
- `weight_ton`
- `work_hours`
- `plan_ton`

### 호기별 가스검침량

권장 컬럼:

- `ym`
- `furnace_no`
- `line`
- `usage_m3`
- `basis`

### 업로드 실패 시

- 어떤 시트가 문제인지 표시합니다.
- 어떤 셀이 비어 있는지 표시합니다.
- 숫자 타입이 필요한 칸에 문자열이 들어오면 알려줍니다.
- 라인/호기 매핑이 맞지 않으면 경고를 띄웁니다.

## 샘플 데이터 만들기

테스트용 엑셀 파일이 필요하면 아래 스크립트를 사용할 수 있습니다.

```bash
node scripts/make-sample-workbooks.js
```

## 운영 모드

이 앱은 환경 변수가 없으면 데모 모드로 동작합니다.

- 로그인 화면에서는 데모 모드를 안내합니다.
- 홈 화면에서는 로컬 저장소를 사용해 집계 결과를 유지합니다.
- Supabase Auth를 연결하면 실제 사용자 로그인으로 전환됩니다.

## 문제 해결

- 로그인 화면이 바로 보이고 입력 폼이 안 나오면
  - Supabase Auth 환경 변수가 설정되어 있는지 확인하세요.
- 업로드 후 데이터가 안 보이면
  - 적재가 성공했는지, 그리고 같은 라인의 `ym` 값이 맞는지 확인하세요.
- 원단위 수치가 이상하면
  - 분자와 분모, 그리고 적용 기준(`고지` / `자체`)을 함께 확인하세요.

## 배포

Vercel 배포를 전제로 합니다.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

이 3개를 Vercel 환경 변수에 등록한 뒤 배포하세요.

## 참고

- 업로드 API: `/api/import`
- 로그인 화면: `/login`
- 기본 대시보드: `/`
