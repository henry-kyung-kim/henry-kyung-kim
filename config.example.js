// 이 파일을 config.js로 복사한 뒤 값을 채워서 실제 배포 위치(index.html과 같은 경로)에 올리세요.
// config.js는 보통 .gitignore로 제외하고 배포 서버에만 두는 파일입니다.
window.HARU_CONFIG = {
  SUPABASE_URL: "https://xxxxxxxxxxxx.supabase.co",
  SUPABASE_ANON_KEY: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",

  // 알림(Web Push) 기능용 VAPID 공개키.
  // 생성 방법: npx web-push generate-vapid-keys
  // 여기에는 공개키만 넣습니다 (개인키는 Supabase Edge Function secret으로만 보관).
  VAPID_PUBLIC_KEY: ""
};
