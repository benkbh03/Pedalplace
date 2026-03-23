// Supabase Edge Function: stripe-webhook
// Deploy: supabase functions deploy stripe-webhook
//
// Påkrævede secrets:
//   STRIPE_SECRET_KEY      – Stripe secret key
//   STRIPE_WEBHOOK_SECRET  – Webhook signing secret fra Stripe Dashboard
//
// Opsæt webhook i Stripe Dashboard → Developers → Webhooks:
//   URL: https://<project-ref>.supabase.co/functions/v1/stripe-webhook
//   Events der lyttes på:
//     - checkout.session.completed
//     - customer.subscription.updated
//     - customer.subscription.deleted
//     - invoice.payment_failed

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const webhookSecret    = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const SUPABASE_URL     = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  const body      = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature!, webhookSecret);
  } catch (err) {
    console.error("Webhook signatur fejl:", err.message);
    return new Response(`Webhook error: ${err.message}`, { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE);

  try {
    switch (event.type) {

      // ── Betaling gennemført → aktiver forhandler ──
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription") break;

        const userId = session.metadata?.user_id;
        if (!userId) break;

        const subscriptionId = session.subscription as string;

        const { error } = await supabase.from("profiles").update({
          verified:                    true,
          stripe_subscription_id:      subscriptionId,
          stripe_subscription_status:  "active",
        }).eq("id", userId);

        if (error) console.error("DB opdatering fejlede (checkout.session.completed):", error);
        else        console.log(`Forhandler aktiveret: ${userId}`);
        break;
      }

      // ── Abonnement opdateret (plan-skift, genaktivering, pause) ──
      case "customer.subscription.updated": {
        const sub    = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.user_id;
        if (!userId) break;

        const isActive = sub.status === "active" || sub.status === "trialing";

        const { error } = await supabase.from("profiles").update({
          verified:                   isActive,
          stripe_subscription_id:     sub.id,
          stripe_subscription_status: sub.status,
        }).eq("id", userId);

        if (error) console.error("DB opdatering fejlede (subscription.updated):", error);
        else        console.log(`Abonnement opdateret [${sub.status}] for: ${userId}`);
        break;
      }

      // ── Abonnement annulleret → deaktiver forhandler ──
      case "customer.subscription.deleted": {
        const sub    = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.user_id;
        if (!userId) break;

        const { error } = await supabase.from("profiles").update({
          verified:                   false,
          stripe_subscription_status: "canceled",
        }).eq("id", userId);

        if (error) console.error("DB opdatering fejlede (subscription.deleted):", error);
        else        console.log(`Forhandler deaktiveret: ${userId}`);
        break;
      }

      // ── Betaling mislykkedes → marker som restance ──
      case "invoice.payment_failed": {
        const invoice    = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        if (!customerId) break;

        const { error } = await supabase.from("profiles").update({
          stripe_subscription_status: "past_due",
        }).eq("stripe_customer_id", customerId);

        if (error) console.error("DB opdatering fejlede (payment_failed):", error);
        else        console.log(`Betaling mislykkedes for kunde: ${customerId}`);
        break;
      }

      default:
        console.log(`Ubehandlet webhook-event: ${event.type}`);
    }
  } catch (err) {
    console.error("Webhook handler fejl:", err);
    return new Response("Intern fejl", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
