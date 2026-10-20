-- DATOS FICTICIOS SOLO PARA DEVELOPMENT. No usar para solicitudes operativas.
-- Requiere OfficialQuotesSchema.sql previamente aplicado. Idempotente, no borra registros.
-- Se usan UUIDs predefinidos para no duplicar cada vez que reinicia Docker.
INSERT INTO public.official_quote_locations (id, kind, display_name, code, active)
VALUES
  ('00000000-0000-4000-8000-000000000101', 'seaport', 'PRUEBA - Puerto de origen', 'DEV-SEA-ORIGIN', TRUE),
  ('00000000-0000-4000-8000-000000000102', 'seaport', 'PRUEBA - Puerto de destino', 'DEV-SEA-DEST', TRUE),
  ('00000000-0000-4000-8000-000000000201', 'airport', 'PRUEBA - Aeropuerto de origen', 'DEV-AIR-ORIGIN', TRUE),
  ('00000000-0000-4000-8000-000000000202', 'airport', 'PRUEBA - Aeropuerto de destino', 'DEV-AIR-DEST', TRUE),
  ('00000000-0000-4000-8000-000000000301', 'inland', 'PRUEBA - Origen terrestre', 'DEV-LAND-ORIGIN', TRUE),
  ('00000000-0000-4000-8000-000000000302', 'inland', 'PRUEBA - Destino terrestre', 'DEV-LAND-DEST', TRUE)
ON CONFLICT (id) DO NOTHING;
