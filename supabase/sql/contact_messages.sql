-- ============================================================
-- Cykelbørsen – Kontaktformular beskeder
-- ============================================================
-- Kør dette SQL i Supabase Dashboard → SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.contact_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  email      text NOT NULL,
  message    text NOT NULL,
  created_at timestamptz DEFAULT now(),
  read       boolean DEFAULT false
);

-- Kun admins kan læse beskeder; alle kan indsætte
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Alle kan sende kontaktbesked"
  ON public.contact_messages FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Kun admins kan læse kontaktbeskeder"
  ON public.contact_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );
