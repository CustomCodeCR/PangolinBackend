-- SOLO Development. Ficción explícita para QA, nunca ejecutar en producción.
INSERT INTO public.shipment_tracking
    (reference_kind, reference_normalized, status, origin, destination,
     eta, is_public, is_demo, source, updated_at_utc)
VALUES ('BL', 'DEMO-BL-2026-001', 'in_transit',
        'Puerto ficticio de origen', 'Puerto ficticio de destino',
        NULL, TRUE, TRUE, 'manual', now())
ON CONFLICT (reference_kind, reference_normalized) DO NOTHING;

INSERT INTO public.shipment_tracking_events
    (tracking_id, event_at_utc, status, location, description)
SELECT s.id, now() - INTERVAL '2 days', 'registered',
       'Ubicación simulada', 'Embarque de demostración registrado'
FROM public.shipment_tracking s
WHERE s.reference_kind = 'BL' AND s.reference_normalized = 'DEMO-BL-2026-001'
  AND s.is_demo = TRUE
  AND NOT EXISTS (SELECT 1 FROM public.shipment_tracking_events e WHERE e.tracking_id = s.id);

-- Registro ficticio NO PUBLICO para comprobar que el buscador no filtra datos privados.
INSERT INTO public.shipment_tracking
    (reference_kind, reference_normalized, status, origin, destination,
     is_public, is_demo, source, updated_at_utc)
VALUES ('HBL', 'DEMO-HBL-PRIVATE-001', 'registered',
        'Origen privado de prueba', 'Destino privado de prueba',
        FALSE, TRUE, 'manual', now())
ON CONFLICT (reference_kind, reference_normalized) DO NOTHING;
