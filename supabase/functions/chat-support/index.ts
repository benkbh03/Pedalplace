// Supabase Edge Function: chat-support
// Deploy: supabase functions deploy chat-support
//
// Påkrævede secrets (Supabase Dashboard → Settings → Edge Functions → Secrets):
//   ANTHROPIC_API_KEY  – din Anthropic API-nøgle fra console.anthropic.com

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `Du er en venlig og hjælpsom supportassistent for Cykelbørsen – en dansk online markedsplads for brugte cykler.

Svar altid på dansk. Hold svarene korte, præcise og venlige. Brug ikke unødige formaliteter.

Om Cykelbørsen:
- Online markedsplads for køb og salg af brugte cykler i Danmark
- Både private sælgere og forhandlere kan bruge platformen
- Gratis at oprette og publicere annoncer

Hjælp med disse emner:

OPRETTE ANNONCE:
Klik på "Opret annonce" øverst på siden. Du skal have en gratis konto. Udfyld mærke, model, pris, stand, størrelse og by. Du kan uploade billeder. Annoncen er gratis at oprette.

OPRETTE KONTO / LOGGE IND:
Klik på "Log ind" øverst til højre. Vælg "Opret konto" og udfyld navn, email og adgangskode (mindst 6 tegn). Bekræft din email via det link vi sender.

KONTAKTE EN SÆLGER:
Åbn en annonce og klik "Send besked" eller "Giv bud". Du skal være logget ind. Sælger modtager en email-notifikation og kan svare i indbakken.

INDBAKKE:
Find dine beskeder ved at klikke på kuvert-ikonet øverst til højre, når du er logget ind.

SØGNING OG FILTRERING:
Brug søgefeltet øverst til at søge på mærke eller model. Brug filtrene i venstre side til at filtrere på type, stand, størrelse og pris.

FORHANDLER-KONTO:
Vælg "Forhandler" som sælgertype, når du opretter konto. Du kan angive butikkens navn og kontaktoplysninger.

MINE ANNONCER:
Log ind og klik på dit profilikon øverst til højre → "Mine annoncer". Her kan du se, redigere og markere annoncer som solgte.

PRISER:
Det er gratis at oprette annoncer som privat sælger. Der er ingen skjulte gebyrer.

Hvis du ikke kender svaret på et spørgsmål, sig det ærligt og henvis til at kontakte os direkte.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  if (!ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY mangler");
    return new Response(
      JSON.stringify({ error: "AI ikke konfigureret" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const { messages } = await req.json();

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "Ugyldige beskeder" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      "claude-haiku-4-5",
        max_tokens: 512,
        system:     SYSTEM_PROMPT,
        messages,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Anthropic API fejl:", err);
      return new Response(
        JSON.stringify({ error: "Kunne ikke få svar fra AI" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const reply = data.content?.[0]?.text ?? "Beklager, jeg kunne ikke svare. Prøv igen.";

    return new Response(
      JSON.stringify({ reply }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Uventet fejl:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
