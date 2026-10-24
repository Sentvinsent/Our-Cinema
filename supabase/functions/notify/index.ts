// Наше кіно — sends a phone notification to your partner when you add, vote, rate or finish something.
// Called by the database trigger public.films_notify() (see supabase/notifications.sql), which signs each
// call with a shared secret. Keys live in public.app_secrets, readable only with the service role.
// Each subscription remembers its device's language (uk / en), and the message is written in it.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

type Row = Record<string, any> | null;
type Lang = "uk" | "en";
const NAMES: Record<Lang, Record<string, string>> = { uk: { Aleks: "Алекс", Alina: "Аліна" }, en: { Aleks: "Aleks", Alina: "Alina" } };
const said = (who: string, m: string, f: string) => (who === "Alina" ? f : m); // Ukrainian past tense agrees with gender
const titleOf = (r: Row, lang: Lang) => (r && (lang === "en" ? r.name_en || r.name_ua : r.name_ua || r.name_en)) || (lang === "en" ? "Untitled" : "Без назви");

function describe(lang: Lang, type: string, actor: string, rec: Row, old: Row) {
  const en = lang === "en", W = NAMES[lang][actor] ?? actor;
  const forWhom = (col: string) => (col.startsWith("aleks") ? (en ? "Aleks" : "Алекса") : (en ? "Alina" : "Аліну"));
  if (type === "INSERT" && rec) {
    const what = rec.media_type === "tv" ? (en ? "a series" : "серіал") : (en ? "a film" : "фільм");
    return { title: en ? `${W} added ${what}` : `${W} ${said(actor, "додав", "додала")} ${what}`, body: titleOf(rec, lang), tab: "proposed" };
  }
  if (type === "DELETE") return { title: en ? `${W} removed from the list` : `${W} ${said(actor, "видалив", "видалила")} зі списку`, body: titleOf(old, lang), tab: "" };
  if (!rec || !old) return null;
  if (!old.watched && rec.watched) {
    return { title: en ? `${W} marked as watched` : `${W} ${said(actor, "позначив", "позначила")} переглянутим`, body: titleOf(rec, lang), tab: "watched" };
  }
  for (const col of ["aleks", "alina"]) {
    if ((old[col] || "") === (rec[col] || "") || !rec[col]) continue;
    const other = col !== actor.toLowerCase() ? (en ? ` for ${forWhom(col)}` : ` за ${forWhom(col)}`) : "";
    const yes = rec[col] === "yes", agreed = rec.aleks === "yes" && rec.alina === "yes" && !rec.watched;
    return {
      title: en ? `${W} voted “${yes ? "Yes" : "No"}”${other}` : `${W} ${said(actor, "проголосував", "проголосувала")}${other} «${yes ? "Так" : "Ні"}»`,
      body: titleOf(rec, lang) + (agreed ? (en ? " — now in Agreed" : " — тепер у «Погоджених»") : ""),
      tab: agreed ? "agreed" : "proposed",
    };
  }
  for (const col of ["aleks_rating", "alina_rating"]) {
    if (old[col] === rec[col] || !rec[col]) continue;
    const other = col !== `${actor.toLowerCase()}_rating` ? (en ? ` (for ${forWhom(col)})` : ` (за ${forWhom(col)})`) : "";
    return { title: en ? `${W} rated it ${rec[col]}/10${other}` : `${W} ${said(actor, "оцінив", "оцінила")} на ${rec[col]}/10${other}`, body: titleOf(rec, lang), tab: "watched" };
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
  if (!actor) return Response.json({ sent: 0, skipped: true });
  const { data: subs } = await sb.from("push_subs").select("endpoint,p256dh,auth,lang").neq("member", actor);
  webpush.setVapidDetails("https://sentvinsent.github.io/Our-Cinema/", S.vapid_public, S.vapid_private);
  let sent = 0, skipped = 0;
  await Promise.all((subs ?? []).map(async (s) => {
    const msg = describe(s.lang === "en" ? "en" : "uk", type, actor, record, old_record);
    if (!msg) { skipped++; return; }
    const payload = JSON.stringify({ ...msg, tag: (record ?? old_record)?.id ?? undefined });
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400, urgency: "normal" });
      sent++;
    } catch (e: any) {
      // 404/410: the browser dropped this subscription — forget it
      if (e?.statusCode === 404 || e?.statusCode === 410) await sb.from("push_subs").delete().eq("endpoint", s.endpoint);
      else console.error("push failed", e?.statusCode, e?.body ?? String(e));
    }
  }));
  return Response.json({ sent, skipped, of: subs?.length ?? 0 });
});
