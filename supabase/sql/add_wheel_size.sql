-- Tilføj wheel_size kolonne til bikes tabellen
ALTER TABLE bikes ADD COLUMN IF NOT EXISTS wheel_size TEXT;
