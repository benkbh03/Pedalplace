import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "Cykelbørsen <onboarding@resend.dev>";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function sendEmail(to, subject, html) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({ from: EMAIL_FROM, to, subject, html }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Resend fejl: ${JSON.stringify(body)}`);
  return body;
}

function emailWrapper(content) {
  return `<!DOCTYPE html>
<html lang="da">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F5F0E8;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F0E8;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#FEFAF3;border-radius:12px;overflow:hidden;border:1px solid #DDD8CE;max-width:600px;width:100%;">
        <tr><td style="background:#2A3D2E;padding:24px 32px;"><span style="color:#F5F0E8;font-size:1.2rem;font-weight:bold;">🚲 Cykelbørsen</span></td></tr>
        <tr><td style="padding:32px;">${content}</td></tr>
        <tr><td style="padding:16px 32px;background:#F5F0E8;border-top:1px solid #DDD8CE;">
          <p style="color:#8A8578;font-size:0.75rem;margin:0;">
            <a href="https://cykelbørsen.dk" style="color:#C8502A;">Cykelbørsen</a> – Danmarks markedsplads for brugte cykler
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function bikeMatchesSearch(bike, filters) {
  if (!filters) return false;
  if (filters.type && bike.type !== filters.type) return false;
  if (filters.city) {
    const bikeCity = (bike.city || "").toLowerCase();
    const searchCity = filters.city.toLowerCase();
    if (!bikeCity.includes(searchCity) && !searchCity.includes(bikeCity)) return false;
  }
  if (filters.search) {
    const haystack = `${bike.brand} ${bike.model}`.toLowerCase();
    const needle = filters.search.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }
  if (!RESEND_API_KEY) {
    return new Response("RESEND_API_KEY not configured", { status: 500, headers: corsHeaders });
  }

  try {
    const { bike } = await req.json();
    if (!bike?.id) {
      return new Response("Mangler bike objekt", { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Hent alle gemte søgninger (ikke notificeret i 24 timer)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: searches } = await supabase
      .from("saved_searches")
      .select("id, user_id, name, filters, last_notified_at")
      .or(`last_notified_at.is.null,last_notified_at.lt.${oneDayAgo}`);

    if (!searches || searches.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Filtrer: kun søgninger der matcher
    const matching = searches.filter(s => bikeMatchesSearch(bike, s.filters || {}));
    if (matching.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Grupper pr. bruger
    const byUser = {};
    for (const s of matching) {
      if (!byUser[s.user_id]) byUser[s.user_id] = [];
      byUser[s.user_id].push(s);
    }

    // Send emails
    const bikeName = `${bike.brand} ${bike.model}`;
    const bikePrice = typeof bike.price === "number" ? bike.price.toLocaleString("da-DK") + " kr." : "";
    let sent = 0;

    for (const [userId, userSearches] of Object.entries(byUser)) {
      try {
        const { data: { user } } = await supabase.auth.admin.getUserById(userId);
        if (!user?.email) continue;

        const { data: profile } = await supabase.from("profiles").select("name").eq("id", userId).single();
        const userName = profile?.name ?? "Hej";

        const searchNames = userSearches.map(s => `<li style="margin-bottom:4px;">${s.name}</li>`).join("");

        const html = emailWrapper(`
          <h2 style="color:#1A1A18;font-size:1.1rem;margin:0 0 12px;">🔔 Ny annonce matcher din søgning!</h2>
          <p style="color:#8A8578;margin:0 0 16px;font-size:0.9rem;line-height:1.6;">
            Hej ${userName},<br><br>
            Der er netop oprettet en ny annonce, der matcher ${userSearches.length === 1 ? 'din gemte søgning' : 'dine gemte søgninger'}:
          </p>
          <ul style="color:#8A8578;font-size:0.9rem;margin:0 0 20px;padding-left:20px;">${searchNames}</ul>
          <div style="background:#F5F0E8;border-left:4px solid #2A3D2E;padding:14px 18px;border-radius:0 8px 8px 0;margin-bottom:24px;">
            <p style="color:#1A1A18;margin:0 0 4px;font-weight:bold;font-size:1rem;">${bikeName}</p>
            ${bikePrice ? `<p style="color:#C8502A;margin:0 0 4px;font-weight:bold;">${bikePrice}</p>` : ""}
            ${bike.type ? `<p style="color:#8A8578;margin:0;font-size:0.85rem;">${bike.type}${bike.city ? " · " + bike.city : ""}${bike.condition ? " · " + bike.condition : ""}</p>` : ""}
          </div>
          <a href="https://cykelbørsen.dk?bike=${bike.id}"
             style="background:#2A3D2E;color:white;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;margin-bottom:16px;">
            Se annonce →
          </a>
          <p style="color:#8A8578;font-size:0.8rem;margin:16px 0 0;">
            Du modtager denne besked fordi du har gemt en søgning på Cykelbørsen.
          </p>
        `);

        await sendEmail(user.email, `🔔 Ny ${bikeName} matcher din søgning – Cykelbørsen`, html);

        // Markér som notificeret
        const ids = userSearches.map(s => s.id);
        await supabase
          .from("saved_searches")
          .update({ last_notified_at: new Date().toISOString() })
          .in("id", ids);

        sent++;
        console.log(`Email sendt til ${user.email}`);
      } catch (userErr) {
        console.error(`Fejl ved user ${userId}:`, userErr);
      }
    }

    return new Response(JSON.stringify({ ok: true, sent, matched: matching.length }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Fejl:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
