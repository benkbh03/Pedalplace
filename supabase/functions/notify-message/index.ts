// Supabase Edge Function: notify-message
// Deploy: supabase functions deploy notify-message
//
// Påkrævede secrets (Supabase Dashboard → Settings → Edge Functions → Secrets):
//   RESEND_API_KEY  – din Resend API-nøgle fra resend.com/api-keys
//
// Valgfri secrets:
//   EMAIL_FROM  – f.eks. "Cykelbørsen <no-reply@cykelborsen.dk>"
//                 Skal være et verificeret Resend-afsenderdomain.
//                 Standard: Resend sandbox-adresse (virker uden domain-verificering)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY       = Deno.env.get("RESEND_API_KEY") ?? "";
const SUPABASE_URL         = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
// Brug sandbox-adressen som standard — kræver IKKE verificeret domain i Resend
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "Cykelbørsen <onboarding@resend.dev>";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY mangler – sæt den i Supabase Dashboard → Settings → Edge Functions → Secrets");
    return new Response("RESEND_API_KEY not configured", { status: 500, headers: corsHeaders });
  }

  try {
    const payload = await req.json();

    // Understøtter { record: {...} } (database webhook) og { message_id: "..." } (frontend-kald)
    let message = payload.record ?? null;

    if (!message && payload.message_id) {
      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      const { data, error } = await admin
        .from("messages")
        .select("*")
        .eq("id", payload.message_id)
        .single();
      if (error) {
        console.error("Kunne ikke hente besked:", error.message);
        return new Response("Message not found", { status: 404, headers: corsHeaders });
      }
      message = data;
    }

    if (!message?.receiver_id) {
      return new Response("No valid message record", { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Hent modtagerens email via Auth Admin API
    const { data: { user: receiverUser }, error: authErr } = await supabase.auth.admin.getUserById(
      message.receiver_id
    );
    if (authErr || !receiverUser?.email) {
      console.error("Modtager email ikke fundet:", authErr?.message ?? "ukendt fejl");
      return new Response("Receiver email not found", { status: 400, headers: corsHeaders });
    }
    const receiverEmail = receiverUser.email;

    // Hent profiler og cykel parallelt
    const [{ data: receiverProfile }, { data: senderProfile }, { data: bike }] = await Promise.all([
      supabase.from("profiles").select("name").eq("id", message.receiver_id).single(),
      supabase.from("profiles").select("name, shop_name, seller_type").eq("id", message.sender_id).single(),
      supabase.from("bikes").select("brand, model").eq("id", message.bike_id).single(),
    ]);

    const senderName =
      senderProfile?.seller_type === "dealer"
        ? senderProfile?.shop_name
        : senderProfile?.name;

    const isBid       = message.content?.startsWith("💰 Bud:");
    const bikeName    = bike ? `${bike.brand} ${bike.model}` : "din cykel";
    const receiverName = receiverProfile?.name ?? "sælger";

    const subject = isBid
      ? `💰 Nyt bud på din ${bikeName} – Cykelbørsen`
      : `✉️ Ny besked om din ${bikeName} – Cykelbørsen`;

    const emailHtml = `<!DOCTYPE html>
<html lang="da">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#F5F0E8;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F0E8;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
             style="background:#FEFAF3;border-radius:12px;overflow:hidden;border:1px solid #DDD8CE;max-width:600px;width:100%;">
        <tr>
          <td style="background:#2A3D2E;padding:24px 32px;">
            <span style="color:#F5F0E8;font-size:1.2rem;font-weight:bold;">🚲 Cykelbørsen</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <h2 style="color:#1A1A18;font-size:1.1rem;margin:0 0 12px;">
              ${isBid ? "Du har fået et bud! 💰" : "Du har fået en besked! ✉️"}
            </h2>
            <p style="color:#8A8578;margin:0 0 20px;font-size:0.9rem;line-height:1.6;">
              Hej ${receiverName},<br><br>
              <strong style="color:#1A1A18;">${senderName ?? "En bruger"}</strong>
              ${isBid ? " har givet et bud" : " har sendt dig en besked"}
              om din annonce: <strong style="color:#1A1A18;">${bikeName}</strong>
            </p>
            <div style="background:#F5F0E8;border-left:4px solid #C8502A;padding:14px 18px;border-radius:0 8px 8px 0;margin-bottom:24px;">
              <p style="color:#1A1A18;margin:0;font-size:0.95rem;line-height:1.5;">${message.content}</p>
            </div>
            <a href="https://cykelborsen.dk"
               style="background:#C8502A;color:white;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">
              Svar på Cykelbørsen →
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;background:#F5F0E8;border-top:1px solid #DDD8CE;">
            <p style="color:#8A8578;font-size:0.75rem;margin:0;">
              Du modtager denne email fordi du har en aktiv annonce på
              <a href="https://cykelborsen.dk" style="color:#C8502A;">cykelborsen.dk</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({ from: EMAIL_FROM, to: receiverEmail, subject, html: emailHtml }),
    });

    const resendBody = await resendRes.json();

    if (!resendRes.ok) {
      console.error("Resend API fejl:", JSON.stringify(resendBody));
      return new Response(
        JSON.stringify({ error: "Email sending failed", detail: resendBody }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Email sendt til:", receiverEmail, "| Resend ID:", resendBody.id);
    return new Response(
      JSON.stringify({ ok: true, id: resendBody.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Uventet fejl:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
