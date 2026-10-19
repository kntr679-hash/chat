// Supabase Edge Function(プッシュ通知を送る係)
// Secrets に必要なもの: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT / PUSH_SECRET
// Verify JWT は「オフ」にして、代わりに PUSH_SECRET(合言葉)で守ります。
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT")!,
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);
const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const SECRET = Deno.env.get("PUSH_SECRET")!;

// deno-lint-ignore no-explicit-any
const nickOf = (pf: any[] | null, n: string) =>
  pf?.find((p) => p.name === n)?.nick ?? String(n).split("#")[0];

// owner の端末すべてに送る。いまアプリを開いて見ている端末(25秒以内に報告あり)には送らない
async function sendTo(owner: string, payload: unknown) {
  const { data: subs } = await sb.from("push_subs")
    .select("endpoint, sub, fg_at").eq("owner_name", owner);
  const targets = (subs ?? []).filter(
    (s) => !(s.fg_at && Date.now() - new Date(s.fg_at).getTime() < 25000),
  );
  await Promise.all(targets.map(async (s) => {
    try {
      await webpush.sendNotification(s.sub, JSON.stringify(payload));
    } catch (e) {
      // 期限切れの端末は、登録から消す
      if (e.statusCode === 404 || e.statusCode === 410) {
        await sb.from("push_subs").delete().eq("endpoint", s.endpoint);
      }
    }
  }));
}

const urlFor = (me: string, you: string) =>
  "./?me=" + encodeURIComponent(me) + "&you=" + encodeURIComponent(you);

Deno.serve(async (req) => {
  if (req.headers.get("x-push-secret") !== SECRET) {
    return new Response("forbidden", { status: 403 });
  }
  const body = await req.json();

  if (body.type === "message" || body.type === "call") {
    const m = body.record;

    // フレンドからのときだけ通知する(受け取る人が、送った人をフレンドに入れている)
    const { data: isFriend } = await sb.from("friends").select("owner_name")
      .eq("owner_name", m.to_name).eq("friend_name", m.from_name).limit(1);
    if (!isFriend?.length) return new Response("not friend");

    const { data: pf } = await sb.from("profiles")
      .select("name, nick").in("name", [m.from_name, m.to_name]);
    const from = nickOf(pf, m.from_name);
    const to = nickOf(pf, m.to_name);

    if (body.type === "message") {
      await sendTo(m.to_name, {
        title: from,
        body: m.image_url ? "📷 画像" : String(m.body).slice(0, 80),
        tag: m.from_name,
        url: urlFor(to, from),
      });
    } else {
      await sendTo(m.to_name, {
        title: from + (m.data && m.data.video ? " からビデオ着信" : " から着信"),
        body: "タップして応答",
        tag: "call:" + m.call_id,
        call: true,
        url: urlFor(to, from),
      });
    }
  } else if (body.type === "online") {
    // 「その人をフレンドに入れている人」に、オンラインになったことを知らせる
    const { data: fr } = await sb.from("friends")
      .select("owner_name").eq("friend_name", body.name);
    const owners = (fr ?? []).map((r) => r.owner_name as string);
    if (owners.length) {
      const { data: pf } = await sb.from("profiles")
        .select("name, nick").in("name", owners);
      for (const o of owners) {
        await sendTo(o, {
          title: body.nick + " がオンラインになりました",
          body: "タップしてチャットを開く",
          tag: "online:" + body.name,
          url: urlFor(nickOf(pf, o), body.nick),
        });
      }
    }
  }
  return new Response("ok");
});
