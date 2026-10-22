-- SOLO DESARROLLO. Cargado exclusivamente en Development con ApplySchema=true.
-- No contiene embarques reales ni datos personales.
CREATE TABLE IF NOT EXISTS public.tracking_demo_shipments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference_type VARCHAR(10) NOT NULL CHECK (reference_type IN ('BL','HBL','IDTRA','CONTAINER','PO')),
    reference_code VARCHAR(64) NOT NULL,
    origin_name VARCHAR(120) NOT NULL,
    origin_lat DOUBLE PRECISION NOT NULL CHECK (origin_lat BETWEEN -90 AND 90),
    origin_lon DOUBLE PRECISION NOT NULL CHECK (origin_lon BETWEEN -180 AND 180),
    destination_name VARCHAR(120) NOT NULL,
    destination_lat DOUBLE PRECISION NOT NULL CHECK (destination_lat BETWEEN -90 AND 90),
    destination_lon DOUBLE PRECISION NOT NULL CHECK (destination_lon BETWEEN -180 AND 180),
    status VARCHAR(20) NOT NULL CHECK (status IN ('planned','in_transit','arrived','delivered')),
    progress_percent SMALLINT NOT NULL CHECK (progress_percent BETWEEN 0 AND 100),
    etd DATE NOT NULL,
    eta DATE NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_demo BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT tracking_demo_reference_unique UNIQUE(reference_type, reference_code)
);
CREATE INDEX IF NOT EXISTS idx_tracking_demo_lookup
    ON public.tracking_demo_shipments(reference_type, reference_code) WHERE is_demo = TRUE;
-- Rutas, estados, porcentajes y fechas completamente ficticios.
INSERT INTO public.tracking_demo_shipments
(reference_type, reference_code, origin_name, origin_lat, origin_lon,
 destination_name, destination_lat, destination_lon, status, progress_percent, etd, eta, is_demo)
VALUES
('BL','BL-TEST-001','Shanghái, China',31.2304,121.4737,'Puerto Limón, Costa Rica',9.9907,-83.0360,'in_transit',55,'2026-10-16','2026-11-07',TRUE),
('HBL','HBL-TEST-002','Barcelona, España',41.3874,2.1686,'Puerto Limón, Costa Rica',9.9907,-83.0360,'arrived',95,'2026-10-04','2026-10-21',TRUE),
('IDTRA','IDTRA-TEST-003','Miami, Estados Unidos',25.7617,-80.1918,'San José, Costa Rica',9.9281,-84.0907,'planned',5,'2026-10-27','2026-11-01',TRUE),
('CONTAINER','CONT-TEST-004','Los Ángeles, Estados Unidos',33.7701,-118.1937,'Puerto Caldera, Costa Rica',9.9100,-84.7190,'delivered',100,'2026-10-05','2026-10-19',TRUE),
('PO','PO-TEST-005','Ciudad de Panamá, Panamá',8.9824,-79.5199,'Miami, Estados Unidos',25.7617,-80.1918,'in_transit',43,'2026-10-20','2026-10-28',TRUE)
ON CONFLICT (reference_type, reference_code) DO NOTHING;
