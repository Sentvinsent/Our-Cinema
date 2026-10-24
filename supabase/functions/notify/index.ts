// Наше кіно — sends a phone notification to your partner when you add, vote, rate or finish something.
// Called by the database trigger public.films_notify() (see supabase/notifications.sql), which signs each
// call with a shared secret. Keys live in public.app_secrets, readable only with the service role.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

type Row = Record<string, any> | null;
const NAME: Record<string, string> = { Aleks: "Алекс", Alina: "Аліна" };
const said = (who: string, m: string, f: string) => (who === "Alina" ? f : m); // past tense agrees with gender
const titleOf = (r: Row) => (r && (r.name_ua || r.name_en)) || "Без назви";
const forWhom = (col: string) => (col.startsWith("aleks") ? "Алекса" : "Аліну");

function describe(type: string, actor: string, rec: Row, old: Row) {
  const W = NAME[actor] ?? actor;
  if (type === "INSERT" && rec) {
    return { title: `${W} ${said(actor, "додав", "додала")} ${rec.media_type === "tv" ? "серіал" : "фільм"}`, body: titleOf(rec), tab: "proposed" };
  }
  if (type === "DELETE") return { title: `${W} ${said(actor, "видалив", "видалила")} зі списку`, body: titleOf(old), tab: "" };
  if (!rec || !old) return null;
  if (!old.watched && rec.watched) return { title: `${W} ${said(actor, "позначив", "позначила")} переглянутим`, body: titleOf(rec), tab: "watched" };
  for (const col of ["aleks", "alina"]) {
    if ((old[col] || "") === (rec[col] || "") || !rec[col]) continue;
    const other = col !== actor.toLowerCase() ? ` за ${forWhom(col)}` : "";
    const agreed = rec.aleks === "yes" && rec.alina === "yes" && !rec.watched;
    return {
      title: `${W} ${said(actor, "проголосував", "проголосувала")}${other} «${rec[col] === "yes" ? "Так" : "Ні"}»`,
      body: titleOf(rec) + (agreed ? " — тепер у «Погоджених»" : ""),
      tab: agreed ? "agreed" : "proposed",
    };
  }
  for (const col of ["aleks_rating", "alina_rating"]) {
    if (old[col] === rec[col] || !rec[col]) continue;
    const other = col !== `${actor.toLowerCase()}_rating` ? ` (за ${forWhom(col)})` : "";
    return { title: `${W} ${said(actor, "оцінив", "оцінила")} на ${rec[col]}/10${other}`, body: titleOf(rec), tab: "watched" };
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: sec } = await sb.from("app_secrets").select("key,value").in("key", ["hook_secret", "vapid_public", "vapid_private"]);
  const S = Object.fromEntries((sec ?? []).map((r) => [r.key, r.value]));
  if (!S.hook_secret || req.headers.get("x-hook-secret") !== S.hook_secret) return new Response("forbidden", { status: 403 });

  const { type, actor, record, old_record } = await req.json();
  const msg = actor ? describe(type, actor, record, old_record) : null;
  if (!msg) return Response.json({ sent: 0, skipped: true });

  const { data: subs } = await sb.from("push_subs").select("endpoint,p256dh,auth").neq("member", actor);
  webpush.setVapidDetails("https://sentvinsent.github.io/Our-Cinema/", S.vapid_public, S.vapid_private);
  const payload = JSON.stringify({ ...msg, tag: (record ?? old_record)?.id ?? undefined });
  let sent = 0;
  await Promise.all((subs ?? []).map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400, urgency: "normal" });
      sent++;
    } catch (e: any) {
      // 404/410: the browser dropped this subscription — forget it
      if (e?.statusCode === 404 || e?.statusCode === 410) await sb.from("push_subs").delete().eq("endpoint", s.endpoint);
      else console.error("push failed", e?.statusCode, e?.body ?? String(e));
    }
  }));
  return Response.json({ sent, of: subs?.length ?? 0 });
});
