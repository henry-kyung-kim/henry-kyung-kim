// ============================================================
// 하루한장 설정 — Supabase 프로젝트 정보를 여기에 붙여넣으세요.
// 위치: Supabase 대시보드 → Project Settings → API
//  - Project URL  → SUPABASE_URL
//  - anon public  → SUPABASE_ANON_KEY
// (anon 키는 공개되어도 되는 키입니다. 데이터 접근은 RLS가 막아줍니다.)
//
// VAPID_PUBLIC_KEY: 일정 알림(Web Push) 기능용 공개키.
//  생성: npx web-push generate-vapid-keys  (자세한 절차는 PUSH_NOTIFICATIONS.md 참고)
//  여기에는 공개키만 넣습니다 — 개인키는 Supabase Edge Function secret으로만 보관하세요.
// ============================================================
window.HARU_CONFIG = {
  SUPABASE_URL: "https://iyykrwowcxfmxntrwydo.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_EImviIT6Bz1ppZBZF35Tyw_bOa4wPr1",
  VAPID_PUBLIC_KEY: ""
};
