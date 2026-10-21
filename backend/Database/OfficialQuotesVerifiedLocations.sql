-- Subconjunto VERIFICADO en los videos, no catálogo global definitivo.
-- Carga aditiva e idempotente, sin modificar solicitudes ni ubicaciones anteriores.
-- Códigos propios de importación (no IATA/UNLOCODE).
INSERT INTO public.official_quote_locations (id, kind, display_name, code, active)
VALUES
  ('00000000-0000-4000-9000-000000000001','inland','Ciudad de Guatemala - Guatemala','VID-LAND-01',TRUE),
  ('00000000-0000-4000-9000-000000000002','inland','Ciudad Hidalgo - México','VID-LAND-02',TRUE),
  ('00000000-0000-4000-9000-000000000003','inland','Ciudad de México - México','VID-LAND-03',TRUE),
  ('00000000-0000-4000-9000-000000000004','inland','Ciudad de Panamá - Panamá','VID-LAND-04',TRUE),
  ('00000000-0000-4000-9000-000000000005','inland','Colón Free Zone - Panamá','VID-LAND-05',TRUE),
  ('00000000-0000-4000-9000-000000000006','inland','Managua - Nicaragua','VID-LAND-06',TRUE),
  ('00000000-0000-4000-9000-000000000007','inland','San José - Costa Rica','VID-LAND-07',TRUE),
  ('00000000-0000-4000-9000-000000000008','inland','Alajuela - Costa Rica','VID-LAND-08',TRUE),
  ('00000000-0000-4000-9000-000000000009','inland','Heredia - Costa Rica','VID-LAND-09',TRUE),
  ('00000000-0000-4000-9000-000000000010','inland','Coyol - Costa Rica','VID-LAND-10',TRUE),
  ('00000000-0000-4000-9000-000000000011','inland','San Pedro Sula - Honduras','VID-LAND-11',TRUE),
  ('00000000-0000-4000-9000-000000000012','inland','Tegucigalpa - Honduras','VID-LAND-12',TRUE),
  ('00000000-0000-4000-9000-000000000013','inland','San Salvador - El Salvador','VID-LAND-13',TRUE)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.official_quote_location_usage(location_id,shipment_type,route_role)
SELECT l.id, type.shipment_type, role.route_role FROM public.official_quote_locations l
CROSS JOIN (VALUES ('FTL'),('LTL')) type(shipment_type)
CROSS JOIN (VALUES ('origin'),('destination')) role(route_role)
WHERE l.kind='inland' AND l.code LIKE 'VID-LAND-%'
ON CONFLICT DO NOTHING;

