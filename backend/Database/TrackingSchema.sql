-- Seguimiento de embarques. Ejecutar en la base 'login' con respaldo previo.
-- Migración aditiva, idempotente, sin eliminar ni alterar tablas existentes.
-- Por defecto ningún registro es visible para visitantes.
CREATE TABLE IF NOT EXISTS public.shipment_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference_kind VARCHAR(12) NOT NULL
        CHECK (reference_kind IN ('BL', 'HBL', 'IDTRA', 'CONTAINER', 'PO')),
    reference_normalized VARCHAR(100) NOT NULL,
    status VARCHAR(30) NOT NULL
        CHECK (status IN ('registered', 'at_origin', 'in_transit', 'customs', 'delivered', 'on_hold')),
    origin VARCHAR(120) NOT NULL,
    destination VARCHAR(120) NOT NULL,
    eta DATE NULL,
    is_public BOOLEAN NOT NULL DEFAULT FALSE,
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    source VARCHAR(20) NOT NULL DEFAULT 'manual'
        CHECK (source IN ('manual', 'external')),
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT tracking_reference_unique UNIQUE (reference_kind, reference_normalized),
    CONSTRAINT tracking_reference_nonempty CHECK (length(btrim(reference_normalized)) BETWEEN 5 AND 100)
);

CREATE TABLE IF NOT EXISTS public.shipment_tracking_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tracking_id UUID NOT NULL REFERENCES public.shipment_tracking(id) ON DELETE CASCADE,
    event_at_utc TIMESTAMPTZ NOT NULL,
    status VARCHAR(30) NOT NULL
        CHECK (status IN ('registered', 'at_origin', 'in_transit', 'customs', 'delivered', 'on_hold')),
    location VARCHAR(120) NOT NULL,
    description VARCHAR(250) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shipment_tracking_events_lookup
    ON public.shipment_tracking_events (tracking_id, event_at_utc DESC);
