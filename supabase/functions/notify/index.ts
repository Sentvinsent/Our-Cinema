// Наше кіно — sends a phone notification to your partner when you add or delete a title.
// Called by the database trigger public.films_notify() (see supabase/notifications.sql), which signs each
// call with a shared secret. Keys live in public.app_secrets, readable only with the service role.
// Each subscription remembers its device's language (uk / en), and the message is written in it.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined; // Supabase background tasks
const UNDO_WAIT_MS = 12_000; // a little longer than the site's 8-second «Скасувати» message

type Row = Record<string, any> | null;
type Lang = "uk" | "en";
const NAMES: Record<Lang, Record<string, string>> = { uk: { Aleks: "Алекс", Alina: "Аліна" }, en: { Aleks: "Aleks", Alina: "Alina" } };
const said = (who: string, m: string, f: string) => (who === "Alina" ? f : m); // Ukrainian past tense agrees with gender
const titleOf = (r: Row, lang: Lang) => (r && (lang === "en" ? r.name_en || r.name_ua : r.name_ua || r.name_en)) || (lang === "en" ? "Untitled" : "Без назви");

function describe(lang: Lang, type: string, actor: string, rec: Row, old: Row) {
  const en = lang === "en", W = NAMES[lang][actor] ?? actor;
  if (type === "INSERT" && rec) {
    const what = rec.media_type === "tv" ? (en ? "a series" : "серіал") : (en ? "a film" : "фільм");
    return { title: en ? `${W} added ${what}` : `${W} ${said(actor, "додав", "додала")} ${what}`, body: titleOf(rec, lang), tab: "proposed" };
  }
  if (type === "DELETE") return { title: en ? `${W} removed from the list` : `${W} ${said(actor, "видалив", "видалила")} зі списку`, body: titleOf(old, lang), tab: "" };
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
  // «Скасувати» after a delete puts the old row back (same id, old created_at): that's not a new title
  if (type === "INSERT" && record?.created_at && Date.now() - Date.parse(record.created_at) > 60_000) return Response.json({ sent: 0, skipped: "restore" });

  const send = async () => {
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
    return { sent, skipped, of: subs?.length ?? 0 };
  };

  // A delete waits out the site's 8-second «Скасувати» window; if the title is back by then, nobody is pinged.
  if (type === "DELETE") {
    const job = (async () => {
      await new Promise((r) => setTimeout(r, UNDO_WAIT_MS));
      const id = old_record?.id;
      if (id) { const { data } = await sb.from("films").select("id").eq("id", id).maybeSingle(); if (data) return; }
      await send();
    })().catch((e) => console.error("delayed push failed", String(e)));
    if (typeof EdgeRuntime !== "undefined") { EdgeRuntime.waitUntil(job); return Response.json({ queued: true }); }
    await job;
    return Response.json({ delayed: true });
  }
  return Response.json(await send());
});
