-- Nuevo formulario oficial, independiente de las solicitudes V2 y del prototipo Dhole V3.
-- No se precargan puertos ni aeropuertos inventados.
CREATE TABLE IF NOT EXISTS public.official_quote_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind VARCHAR(10) NOT NULL CHECK (kind IN ('seaport','airport','inland')),
    display_name VARCHAR(180) NOT NULL CHECK (length(btrim(display_name)) > 0),
    code VARCHAR(40) NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_official_quote_locations_kind_code
    ON public.official_quote_locations(kind,code) WHERE code IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.official_quote_requests (
    id UUID PRIMARY KEY,
    cliente_id UUID NOT NULL REFERENCES public.clientes(uuid) ON DELETE RESTRICT,
    usuario_id UUID NOT NULL REFERENCES public.usuarios(uuid) ON DELETE RESTRICT,
    customer_name VARCHAR(200) NOT NULL,
    contact_name VARCHAR(150) NOT NULL,
    contact_email VARCHAR(255) NOT NULL,
    contact_phone VARCHAR(40) NOT NULL,
    mode VARCHAR(12) NOT NULL CHECK (mode IN ('Maritime','Air','Land')),
    shipment_type VARCHAR(12) NOT NULL CHECK (shipment_type IN ('FCL','LCL','AIR_LCL','FTL','LTL')),
    origin_name VARCHAR(180) NOT NULL,
    destination_name VARCHAR(180) NOT NULL,
    form_json JSONB NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'Received'
        CHECK (status IN ('Received','InReview','AwaitingInformation','Closed')),
    authorization VARCHAR(15) NOT NULL DEFAULT 'Pending'
        CHECK (authorization IN ('Pending','Authorized','Rejected')),
    authorized_by_id UUID NULL REFERENCES public.usuarios(uuid) ON DELETE SET NULL,
    authorized_at_utc TIMESTAMPTZ NULL,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_official_mode_pair CHECK (
        (mode = 'Maritime' AND shipment_type IN ('FCL','LCL')) OR
        (mode = 'Air' AND shipment_type = 'AIR_LCL') OR
        (mode = 'Land' AND shipment_type IN ('FTL','LTL'))
    )
);
CREATE INDEX IF NOT EXISTS ix_official_quotes_customer_date
    ON public.official_quote_requests(cliente_id,created_at_utc DESC);
CREATE INDEX IF NOT EXISTS ix_official_quotes_review_date
    ON public.official_quote_requests(created_at_utc DESC);
-- Los permisos se otorgan expresamente al personal administrador (sin acceso predeterminado).
CREATE TABLE IF NOT EXISTS public.official_quote_permissions (
    user_id UUID PRIMARY KEY REFERENCES public.usuarios(uuid) ON DELETE CASCADE,
    can_view BOOLEAN NOT NULL DEFAULT FALSE,
    can_manage BOOLEAN NOT NULL DEFAULT FALSE,
    can_authorize BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE IF NOT EXISTS public.official_quote_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id UUID NOT NULL REFERENCES public.official_quote_requests(id) ON DELETE CASCADE,
    actor_user_id UUID NULL REFERENCES public.usuarios(uuid) ON DELETE SET NULL,
    action VARCHAR(32) NOT NULL,
    comment VARCHAR(2000) NULL,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_official_quote_audit_history
    ON public.official_quote_audit(quote_id,created_at_utc DESC);
