// Supabase Edge Function: create-checkout-session
// Deploy: supabase functions deploy create-checkout-session
//
// Påkrævede secrets (Supabase Dashboard → Settings → Edge Functions → Secrets):
//   STRIPE_SECRET_KEY         – Stripe secret key (sk_live_... eller sk_test_...)
//   STRIPE_MONTHLY_PRICE_ID   – Stripe Price ID for månedlig plan (f.eks. price_...)
//   STRIPE_YEARLY_PRICE_ID    – Stripe Price ID for årlig plan (f.eks. price_...)
//
// Opret priser i Stripe Dashboard:
//   - Månedlig plan: 199 DKK/måned (tilbagevendende)
//   - Årlig plan:  1.499 DKK/år   (tilbagevendende)
//
// Aktivér MobilePay i Stripe Dashboard:
//   Stripe Dashboard → Settings → Payment methods → MobilePay → Aktivér

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { plan, user_id, email, success_url, cancel_url } = await req.json();

    // Vælg Stripe Price ID baseret på valgt plan
    const priceId = plan === "yearly"
      ? Deno.env.get("STRIPE_YEARLY_PRICE_ID")
      : Deno.env.get("STRIPE_MONTHLY_PRICE_ID");

    if (!priceId) {
      throw new Error(`STRIPE_${plan.toUpperCase()}_PRICE_ID er ikke konfigureret`);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Hent eller opret Stripe-kunde
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id, shop_name, stripe_subscription_status")
      .eq("id", user_id)
      .single();

    // Afvis hvis allerede har aktivt abonnement
    if (profile?.stripe_subscription_status === "active") {
      throw new Error("Du har allerede et aktivt forhandlerabonnement");
    }

    let customerId: string = profile?.stripe_customer_id ?? "";

    if (!customerId) {
      const customer = await stripe.customers.create({
        email,
        name: profile?.shop_name ?? undefined,
        metadata: { supabase_user_id: user_id },
      });
      customerId = customer.id;

      await supabase
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user_id);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card", "mobilepay"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${success_url}?dealer_success=true`,
      cancel_url:  `${cancel_url}?dealer_cancel=true`,
      metadata: { user_id },
      subscription_data: {
        metadata: { user_id },
        // 3 måneder gratis prøveperiode for første forhandlere
        trial_period_days: 90,
      },
      locale: "da",
      allow_promotion_codes: true,
      // Kræv ikke kortoplysninger under gratis prøveperiode
      payment_method_collection: "if_required",
      billing_address_collection: "auto",
      customer_update: { address: "auto" },
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("create-checkout-session fejl:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
