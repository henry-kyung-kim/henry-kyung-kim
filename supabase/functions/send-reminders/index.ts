// 하루한장 — 일정 알림 발송 Edge Function.
// pg_cron으로 1분마다 호출되어, 지금 발송해야 할 알림을 찾아 Web Push로 보낸다.
//
// 필요한 환경변수(secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (예: mailto:you@example.com)
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 는 Supabase가 자동으로 주입한다.
//
// 시간대: 이 앱은 한국 사용자를 대상으로 하므로 일정 날짜/시간을 KST(UTC+9) 고정으로
// 해석한다. 사용자별 시간대를 저장하지 않으므로, 해외에서 접속하는 사용자가 있다면
// 이 부분을 planner_state에 시간대를 추가로 저장하도록 확장해야 한다.

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:example@example.com";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const ALARM_OFFSET_MIN: Record<string, number> = {
  start: 0,
  "10m": 10,
  "30m": 30,
  "1h": 60,
  "1d": 24 * 60,
};
const ALARM_LABEL: Record<string, string> = {
  start: "지금 시작하는 일정이에요",
  "10m": "10분 후 시작",
  "30m": "30분 후 시작",
  "1h": "1시간 후 시작",
  "1d": "내일 예정된 일정이에요",
};

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
// 크론 실행이 몇 분 밀리거나 한 번 건너뛰어도 알림을 놓치지 않도록 두는 여유 범위(분)
const CATCHUP_WINDOW_MIN = 5;

function kstWallTimeToUtcMs(dateStr: string, timeStr: string): number | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  const tm = /^(\d{2}):(\d{2})$/.exec(timeStr);
  if (!dm || !tm) return null;
  const utcMsIfKst = Date.UTC(+dm[1], +dm[2] - 1, +dm[3], +tm[1], +tm[2], 0);
  return utcMsIfKst - KST_OFFSET_MS;
}

interface DueItem {
  user_id: string;
  event_id: string;
  alarm: string;
  title: string;
  timeStr: string;
}

Deno.serve(async (_req) => {
  try {
    const nowMinute = Math.floor(Date.now() / 60000);

    const { data: rows, error } = await supabase
      .from("planner_state")
      .select("user_id, data");
    if (error) throw error;

    const due: DueItem[] = [];
    for (const row of rows ?? []) {
      const events = row?.data?.events;
      if (!events || typeof events !== "object") continue;
      for (const dateStr of Object.keys(events)) {
        const list = events[dateStr];
        if (!Array.isArray(list)) continue;
        for (const ev of list) {
          if (!ev || !ev.start || !ev.alarm || ev.alarm === "none") continue;
          const offsetMin = ALARM_OFFSET_MIN[ev.alarm];
          if (offsetMin === undefined) continue;
          const eventUtcMs = kstWallTimeToUtcMs(dateStr, ev.start);
          if (eventUtcMs === null) continue;
          const triggerMinute = Math.floor((eventUtcMs - offsetMin * 60000) / 60000);
          if (triggerMinute <= nowMinute && triggerMinute > nowMinute - CATCHUP_WINDOW_MIN) {
            due.push({
              user_id: row.user_id,
              event_id: ev.id,
              alarm: ev.alarm,
              title: ev.title || "일정",
              timeStr: ev.start,
            });
          }
        }
      }
    }

    if (!due.length) {
      return json({ checked: rows?.length ?? 0, sent: 0 });
    }

    // 이미 보낸 알림은 다시 보내지 않음
    const { data: alreadySent } = await supabase
      .from("sent_reminders")
      .select("user_id,event_id,alarm")
      .in("event_id", due.map((d) => d.event_id));
    const sentSet = new Set((alreadySent ?? []).map((r) => `${r.user_id}:${r.event_id}:${r.alarm}`));
    const toSend = due.filter((d) => !sentSet.has(`${d.user_id}:${d.event_id}:${d.alarm}`));

    if (!toSend.length) {
      return json({ checked: rows?.length ?? 0, sent: 0 });
    }

    const userIds = [...new Set(toSend.map((d) => d.user_id))];
    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("user_id, endpoint, p256dh, auth")
      .in("user_id", userIds);

    const subsByUser = new Map<string, { endpoint: string; p256dh: string; auth: string }[]>();
    for (const s of subs ?? []) {
      if (!subsByUser.has(s.user_id)) subsByUser.set(s.user_id, []);
      subsByUser.get(s.user_id)!.push(s);
    }

    let sentCount = 0;
    const staleEndpoints: string[] = [];
    const sentRows: { user_id: string; event_id: string; alarm: string }[] = [];

    for (const item of toSend) {
      const userSubs = subsByUser.get(item.user_id) || [];
      if (userSubs.length) {
        const payload = JSON.stringify({
          title: "🔔 " + item.title,
          body: (ALARM_LABEL[item.alarm] || "") + " · " + item.timeStr,
          tag: "haru-" + item.event_id,
          url: "./index.html",
        });
        for (const s of userSubs) {
          try {
            await webpush.sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              payload,
            );
            sentCount++;
          } catch (err) {
            const statusCode = (err as { statusCode?: number })?.statusCode;
            if (statusCode === 404 || statusCode === 410) {
              staleEndpoints.push(s.endpoint);
            } else {
              console.error("push send failed", item.event_id, err);
            }
          }
        }
      }
      // 구독이 하나도 없어도(알림을 안 켠 사용자) 재시도하지 않도록 발송 기록은 남긴다
      sentRows.push({ user_id: item.user_id, event_id: item.event_id, alarm: item.alarm });
    }

    if (sentRows.length) {
      await supabase.from("sent_reminders").upsert(sentRows, { onConflict: "user_id,event_id,alarm" });
    }
    if (staleEndpoints.length) {
      await supabase.from("push_subscriptions").delete().in("endpoint", staleEndpoints);
    }

    return json({ checked: rows?.length ?? 0, due: due.length, sent: sentCount });
  } catch (err) {
    console.error(err);
    return json({ error: String((err as Error)?.message || err) }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
