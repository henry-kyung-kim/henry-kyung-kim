# 8단계. 일정 알림(Web Push) 켜기

`배포가이드.md`의 7단계까지 마친(Netlify에 배포하고 admin 계정도 만든) 상태를
전제로 이어지는 가이드입니다. 프로젝트 참조 ID는 config.js에 있는 값 기준으로
`iyykrwowcxfmxntrwydo` 입니다 (URL의 `https://iyykrwowcxfmxntrwydo.supabase.co` 부분).

먼저 알아둘 점: 앱을 완전히 닫아도 오는 알림은 브라우저의 로컬 타이머가 아니라
**Web Push**로만 가능합니다. Supabase가 정해진 시각에 사용자 기기로 푸시 메시지를
보내주는 구조라서, DB 테이블 + Edge Function + 1분마다 자동 실행(cron) 설정이
추가로 필요합니다.

- Android(Chrome 등): 일반 웹에서도 동작
- iPhone(Safari): iOS 16.4 이상 + 반드시 **홈 화면에 추가**해서 그 아이콘으로 실행한
  상태에서 알림을 켜야 동작 (일반 Safari 탭에서는 iOS가 푸시를 지원하지 않음)

---

## 0. 이번에 추가된 파일

| 파일 | 역할 | Netlify에 올릴지 |
|---|---|---|
| `index.html` | 일정 등록/수정 폼에 알림 select(6종) 추가, 설정 탭에 "알림" 카드 추가 | ✅ (기존 파일 교체) |
| `manifest.json`, `sw.js` | PWA 설치 + 푸시 수신용 서비스워커 | ✅ |
| `config.js` | 기존 값 그대로 + `VAPID_PUBLIC_KEY` 필드 추가 | ✅ (기존 파일 교체) |
| `supabase-setup-notifications.sql` | `push_subscriptions`/`sent_reminders` 테이블 생성 | ❌ (SQL Editor에서만 실행) |
| `supabase-setup-cron.sql` | 1분마다 함수 호출하는 cron 예약 | ❌ (SQL Editor에서만 실행, 또는 Cron Jobs 화면 사용) |
| `supabase/functions/send-reminders/index.ts` | 알림 판단·발송 로직 | ❌ (Supabase CLI로 배포, Netlify 폴더엔 넣지 마세요) |

**주의**: `haru-plan` 폴더(Netlify 업로드용)에는 `supabase/` 폴더를 포함하지 마세요.
Edge Function 소스에 비밀값은 없지만, 굳이 공개 웹에 노출할 필요는 없습니다.

## 1. VAPID 키 생성

Web Push는 서버가 자신임을 증명하는 VAPID 키 쌍이 필요합니다. Node.js가 설치된
PC에서:

```bash
npx web-push generate-vapid-keys
```

Public Key / Private Key 두 값이 출력됩니다. 재사용하는 값이니 안전한 곳에 따로
저장해두세요(비밀번호 관리자 등). 특히 Private Key는 절대 노출되면 안 됩니다.

## 2. config.js에 공개키 채우기

`config.js`를 메모장으로 열어 마지막 줄을 채웁니다:

```js
window.HARU_CONFIG = {
  SUPABASE_URL: "https://iyykrwowcxfmxntrwydo.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_EImviIT6Bz1ppZBZF35Tyw_bOa4wPr1",
  VAPID_PUBLIC_KEY: "위에서 생성한 Public Key"
};
```

## 3. Supabase 테이블 생성

Supabase 대시보드 → **SQL Editor** → New query → `supabase-setup-notifications.sql`
내용 전체를 붙여넣고 **Run**. `push_subscriptions`(기기별 구독 정보)와
`sent_reminders`(중복 발송 방지 기록) 두 테이블이 생깁니다.

## 4. Edge Function 배포

로컬 PC에 Supabase CLI 설치가 필요합니다 (`npm i -g supabase` 또는
`brew install supabase/tap/supabase`). 이 저장소의 `supabase/functions/send-reminders`
폴더가 있는 위치에서:

```bash
supabase login
supabase link --project-ref iyykrwowcxfmxntrwydo

# CRON_SECRET은 아무 긴 임의 문자열이나 직접 만들어도 됩니다. 예:
openssl rand -hex 32

# 함수 시크릿 등록 (VAPID 개인키와 위에서 만든 CRON_SECRET을 여기에만 저장)
supabase secrets set \
  VAPID_PUBLIC_KEY="위에서 생성한 Public Key" \
  VAPID_PRIVATE_KEY="위에서 생성한 Private Key" \
  VAPID_SUBJECT="mailto:ghmir928@gmail.com" \
  CRON_SECRET="위에서 만든 임의 문자열"

# 함수 배포 (--no-verify-jwt 필수: 최근 Supabase의 새 publishable/secret 키
# 체계에서도 cron이 문제없이 호출하도록, 자체 CRON_SECRET으로 인증합니다)
supabase functions deploy send-reminders --no-verify-jwt
```

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`는 Supabase가 Edge Function에 자동으로
주입하므로 따로 설정하지 않아도 됩니다.

## 5. 1분마다 자동 실행되도록 예약

**방법 A — 대시보드 UI (쉬움)**
Supabase 대시보드 → Database → Cron Jobs → 새 작업 생성 → Type: HTTP Request →
매 분(`* * * * *`) 아래 주소로 POST 호출하도록 설정:
- URL: `https://iyykrwowcxfmxntrwydo.supabase.co/functions/v1/send-reminders`
- Header: `Authorization: Bearer <4단계에서 만든 CRON_SECRET>`

**방법 B — SQL 직접 실행**
`supabase-setup-cron.sql`을 열어 `<PROJECT_REF>`(=`iyykrwowcxfmxntrwydo`)와
`<CRON_SECRET>`을 채운 뒤 SQL Editor에서 실행.

## 6. Netlify 재배포

`index.html`, `manifest.json`, `sw.js`, `config.js`가 포함된 `haru-plan` 폴더를
Netlify → Deploys에 다시 드래그해서 올리면 갱신됩니다.

## 7. 동작 확인

1. 배포된 링크 새로고침 → 로그인 → 설정 탭 → "알림" 카드에서 **알림 켜기** 클릭
   → 브라우저 알림 권한 허용
2. 오늘 날짜에, 지금 시각보다 몇 분 뒤로 시작 시간을 잡은 일정을 만들고 알림을
   "시작 시간"으로 설정
3. 설정한 시각이 되면(최대 1분 오차) 알림이 와야 합니다. 안 오면:
   - Supabase 대시보드 → Edge Functions → `send-reminders` → Logs에서 에러 확인
   - `push_subscriptions` 테이블에 구독 행이 실제로 생겼는지 확인
   - Database → Cron Jobs가 정상적으로 매 분 실행되고 있는지 확인

## 8. iPhone에서 켜기

1. Safari로 사이트 접속 → 공유 버튼 → **홈 화면에 추가**
2. 홈 화면의 아이콘으로 앱 실행 (Safari 탭이 아니라 설치된 아이콘으로!)
3. 로그인 → 설정 탭 → 알림 켜기
4. iOS 16.4 미만 기기는 Web Push 자체를 지원하지 않아 알림을 켤 수 없습니다.

---

## 알아두면 좋은 점

- **시간대 고정**: Edge Function은 모든 일정 시각을 KST(UTC+9)로 해석합니다. 해외에서
  쓰는 사용자가 생기면 사용자별 시간대 저장이 추가로 필요합니다.
- **정확도**: cron이 몇 분 밀리거나 한두 번 건너뛰어도 최근 5분 이내 알림은 놓치지
  않고 발송하는 여유(catch-up) 로직이 들어있습니다. 다만 APNs/FCM 등 플랫폼별 푸시
  전달 자체도 몇 초~수십 초 지연될 수 있습니다.
- **프라이버시**: 원래 앱은 관리자도 남의 일정을 못 보게 설계돼 있는데, 알림을 정확한
  시각에 보내려면 서버(Edge Function)는 승인된 모든 사용자의 일정을 자동으로
  훑어야 합니다(사람이 열람하는 게 아니라 시각만 비교). 차단된 계정의 일정은
  건너뜁니다.
- **아이콘**: `manifest.json`의 아이콘은 SVG 데이터 URI 임시값입니다. 실제 운영 시
  192×192, 512×512 PNG 아이콘 파일로 교체하는 걸 권장합니다(Android 설치 배너 품질).
- **비용**: Edge Function이 1분마다 실행되니 무료 플랜의 함수 호출/DB 요청 한도를
  가끔 확인해보세요. 지인 규모 사용자 수라면 보통 문제 없는 수준입니다.
