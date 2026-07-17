# 일정 알림(Web Push) 기능 배포 가이드

`배포가이드.md`로 Supabase 프로젝트를 이미 만들어 `config.js`에 URL/anon 키를
넣어둔 상태를 전제로 합니다. 이 문서는 "일정 알림" 기능을 추가로 켜는 절차만 다룹니다.

먼저 알아둘 점: 앱을 완전히 닫아도 오는 알림은 브라우저의 로컬 타이머가 아니라
**Web Push**로만 가능합니다. 즉 서버(Supabase)가 정해진 시각에 사용자 기기로
푸시 메시지를 보내주는 구조가 필요하고, 그래서 아래처럼 DB 테이블 + Edge Function +
정기 실행(cron) 설정이 함께 필요합니다.

- Android(Chrome 등): 일반 웹에서도 동작
- iPhone(Safari): iOS 16.4 이상 + 반드시 **홈 화면에 추가**해서 그 아이콘으로 실행한
  상태에서 알림을 켜야 동작 (일반 Safari 탭에서는 iOS가 푸시를 지원하지 않음)

---

## 0. 이번 작업으로 저장소에 추가된 파일

- `index.html` — 일정 등록/수정 폼에 알림 select(6종) 추가, 설정 탭에 "알림" 카드 추가
- `manifest.json`, `sw.js` — PWA 설치 및 푸시 수신용 서비스워커
- `config.example.js` — `VAPID_PUBLIC_KEY` 필드가 추가된 설정 예시
- `supabase/sql/001_push_notifications.sql` — `push_subscriptions`, `sent_reminders` 테이블
- `supabase/sql/002_schedule_cron.sql` — 1분마다 Edge Function을 호출하는 cron 예약
- `supabase/functions/send-reminders/index.ts` — 실제 알림을 판단·발송하는 Edge Function

이 파일들을 실제 운영 저장소/배포 위치로 옮겨서 아래 단계를 진행하세요.

## 1. VAPID 키 생성

Web Push는 서버가 자신임을 증명하는 VAPID 키 쌍이 필요합니다.

```bash
npx web-push generate-vapid-keys
```

Public Key / Private Key 두 값이 출력됩니다. 이 둘은 재사용하는 값이니 안전한 곳에
따로 저장해두세요(비밀번호 관리자 등). 특히 Private Key는 절대 노출되면 안 됩니다.

## 2. 프론트엔드에 공개키 등록

배포 중인 `config.js`(레포의 `config.example.js` 참고)에 한 줄 추가:

```js
window.HARU_CONFIG = {
  SUPABASE_URL: "...",
  SUPABASE_ANON_KEY: "...",
  VAPID_PUBLIC_KEY: "위에서 생성한 Public Key"
};
```

`manifest.json`, `sw.js`도 `index.html`과 같은 경로에 함께 올려주세요.

## 3. Supabase 테이블 생성

Supabase 대시보드 → SQL Editor에서 `supabase/sql/001_push_notifications.sql` 내용을
그대로 실행합니다. `push_subscriptions`(기기별 구독 정보)와 `sent_reminders`(중복 발송
방지 기록) 두 테이블이 생깁니다.

## 4. Edge Function 배포

로컬에 Supabase CLI가 있어야 합니다 (`npm i -g supabase` 또는 `brew install supabase/tap/supabase`).

```bash
supabase login
supabase link --project-ref <프로젝트 참조 ID>

# 함수 시크릿 등록 (VAPID 개인키는 여기에만 저장됨)
supabase secrets set \
  VAPID_PUBLIC_KEY="위에서 생성한 Public Key" \
  VAPID_PRIVATE_KEY="위에서 생성한 Private Key" \
  VAPID_SUBJECT="mailto:본인이메일@example.com"

# 함수 배포
supabase functions deploy send-reminders
```

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`는 Supabase가 Edge Function에 자동으로
주입하므로 따로 설정하지 않아도 됩니다.

## 5. 1분마다 자동 실행되도록 예약

두 가지 방법 중 편한 쪽을 쓰세요.

**방법 A — 대시보드 UI (쉬움)**
Supabase 대시보드 → Database → Cron Jobs → 새 작업 생성 →
`send-reminders` 함수를 매 분(`* * * * *`) 호출하도록 설정.

**방법 B — SQL 직접 실행**
`supabase/sql/002_schedule_cron.sql`을 열어 `<PROJECT_REF>`와 `<SERVICE_ROLE_KEY>`
(Settings → API → service_role)를 채운 뒤 SQL Editor에서 실행.

## 6. 동작 확인

1. `index.html`을 새로고침하고 로그인 → 설정 탭 → "알림" 카드에서 **알림 켜기** 클릭
   → 브라우저 알림 권한 허용
2. 오늘 날짜에, 지금 시각보다 몇 분 뒤로 시작 시간을 잡은 일정을 만들고 알림을
   "시작 시간"으로 설정
3. 설정한 시각이 되면(최대 1분 오차) 알림이 와야 합니다. 안 오면:
   - Supabase 대시보드 → Edge Functions → `send-reminders` → Logs에서 에러 확인
   - `push_subscriptions` 테이블에 구독 행이 실제로 생겼는지 확인
   - Cron Jobs가 정상적으로 매 분 실행되고 있는지 확인

## 7. iPhone에서 켜기

1. Safari로 사이트 접속 → 공유 버튼 → **홈 화면에 추가**
2. 홈 화면의 아이콘으로 앱 실행 (Safari 탭이 아니라 설치된 아이콘으로!)
3. 로그인 → 설정 탭 → 알림 켜기
4. iOS 16.4 미만 기기는 Web Push 자체를 지원하지 않아 알림을 켤 수 없습니다.

---

## 알아두면 좋은 제약사항

- **시간대 고정**: Edge Function은 모든 일정 시각을 KST(UTC+9)로 해석합니다. 해외에서
  쓰는 사용자가 생기면 사용자별 시간대 저장이 추가로 필요합니다.
- **정확도**: cron이 매 분 실행되고, 실행이 몇 분 밀리거나 한두 번 건너뛰어도 최근
  5분 이내 알림은 놓치지 않고 발송하도록 여유(catch-up) 로직이 들어있습니다. 다만
  APNs/FCM 등 각 플랫폼의 푸시 전달 자체도 몇 초~수십 초 지연될 수 있습니다.
- **아이콘**: `manifest.json`의 아이콘은 SVG 데이터 URI 임시값입니다. 실제 배포 시
  192×192, 512×512 PNG 아이콘 파일로 교체하는 걸 권장합니다(Android 설치 배너 품질에 영향).
- **비용**: Edge Function이 1분마다 실행되므로 Supabase 무료 플랜의 함수 호출/DB
  요청 한도를 확인해보세요. 사용자 수가 많지 않다면 보통 문제 없는 수준입니다.
