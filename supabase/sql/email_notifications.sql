-- ============================================================
-- Cykelbørsen – Email Notifikationer via Supabase Webhooks
-- ============================================================
-- Kør dette SQL i Supabase Dashboard → SQL Editor
--
-- FORUDSÆTNINGER:
--   1. Deploy Edge Function: supabase functions deploy notify-message
--   2. Sæt RESEND_API_KEY i Supabase Dashboard → Settings → Edge Functions → Secrets
--   3. Kør dette SQL script i Supabase Dashboard → SQL Editor
-- ============================================================

-- Aktiver pg_net extension (bruges til HTTP kald fra database triggers)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ============================================================
-- Funktion: kalder Edge Function når ny besked/bud indsættes
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_new_message()
RETURNS trigger AS $$
DECLARE
  v_url  TEXT;
  v_key  TEXT;
BEGIN
  -- Edge Function URL (skift hvis dit projekt-ref er anderledes)
  v_url := 'https://ktufgncydxhkhfttojkh.supabase.co/functions/v1/notify-message';

  -- Brug anon key til at kalde Edge Function (hardcodet publishable key)
  -- Edge Functionen bruger service role key internt til at hente data
  v_key := 'sb_publishable_bxJ_gRDrsJ-XCWWUD6NiQA_1nlPDA2B';

  -- Kald Edge Function asynkront (blokerer ikke INSERT)
  PERFORM extensions.net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := jsonb_build_object('record', row_to_json(NEW))
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Trigger: kører efter INSERT på messages tabellen
-- ============================================================
DROP TRIGGER IF EXISTS on_new_message_notify ON public.messages;

CREATE TRIGGER on_new_message_notify
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_message();

-- ============================================================
-- ALTERNATIV: Brug Supabase Database Webhooks (anbefalet)
-- ============================================================
-- Hvis du foretrækker at bruge Supabase's indbyggede Database Webhooks
-- i stedet for pg_net, kan du i stedet:
--
-- 1. Gå til Supabase Dashboard → Database → Webhooks
-- 2. Klik "Create a new hook"
-- 3. Udfyld:
--    - Name: notify_message
--    - Table: messages
--    - Events: INSERT
--    - Type: Supabase Edge Functions
--    - Function: notify-message
-- 4. Klik Save
--
-- Med denne metode behøver du IKKE køre SQL'en ovenfor.
-- ============================================================

-- ============================================================
-- Test: indsæt en test-besked for at verificere opsætningen
-- ============================================================
-- SELECT * FROM extensions.net.http_collect_response(1, true);
-- (Erstat 1 med ID returneret af net.http_post)
