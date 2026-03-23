-- ============================================================
-- Cykelbørsen – Stripe forhandlerabonnement kolonner
-- ============================================================
-- Kør dette SQL i Supabase Dashboard → SQL Editor
--
-- FORUDSÆTNINGER:
--   1. Stripe integration er sat op
--   2. Edge Functions er deployed:
--      - create-checkout-session
--      - create-portal-session
--      - stripe-webhook
-- ============================================================

-- Stripe kunde og abonnement kolonner på profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id       TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id   TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_status TEXT;

-- ID-verificering kolonner
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS id_doc_url  TEXT,
  ADD COLUMN IF NOT EXISTS id_pending  BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS id_verified BOOLEAN DEFAULT false;

-- Forhandler-specifikke kolonner (hvis de ikke allerede eksisterer)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS seller_type TEXT    DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS shop_name   TEXT,
  ADD COLUMN IF NOT EXISTS cvr         TEXT,
  ADD COLUMN IF NOT EXISTS phone       TEXT,
  ADD COLUMN IF NOT EXISTS address     TEXT,
  ADD COLUMN IF NOT EXISTS city        TEXT,
  ADD COLUMN IF NOT EXISTS verified    BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_admin    BOOLEAN DEFAULT false;

-- ============================================================
-- Storage bucket til ID-dokumenter (privat – kun admin kan se)
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('id-documents', 'id-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Brugere kan uploade deres eget ID-dokument
CREATE POLICY "Authenticated users can upload id-documents"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'id-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Brugere kan se deres eget ID-dokument
CREATE POLICY "Users can view their own id-documents"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'id-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Admins kan se alle ID-dokumenter
CREATE POLICY "Admins can view all id-documents"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'id-documents'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Brugere kan slette deres eget ID-dokument
CREATE POLICY "Users can delete their own id-documents"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'id-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================
-- Indeks for hurtig opslag på Stripe customer ID
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer_id
  ON public.profiles (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- ============================================================
-- Indeks for hurtig opslag på forhandlere
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_profiles_seller_type_verified
  ON public.profiles (seller_type, verified)
  WHERE seller_type = 'dealer';
