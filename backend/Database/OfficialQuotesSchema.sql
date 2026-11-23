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
    cliente_id UUID NULL REFERENCES public.clientes(uuid) ON DELETE RESTRICT,
    usuario_id UUID NULL REFERENCES public.usuarios(uuid) ON DELETE RESTRICT,
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
    approval_status VARCHAR(15) NOT NULL DEFAULT 'Pending'
        CHECK (approval_status IN ('Pending','Authorized','Rejected')),
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
-- Migración aditiva: una solicitud de invitado no pertenece a una cuenta registrada.
-- Mantener las FK para solicitudes autenticadas y sus permisos de lectura.
ALTER TABLE public.official_quote_requests ALTER COLUMN cliente_id DROP NOT NULL;
ALTER TABLE public.official_quote_requests ALTER COLUMN usuario_id DROP NOT NULL;

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

-- POL, POE y POD pueden tener opciones distintas, según la modalidad.
CREATE TABLE IF NOT EXISTS public.official_quote_location_usage (
 location_id UUID NOT NULL REFERENCES public.official_quote_locations(id) ON DELETE RESTRICT,
 shipment_type VARCHAR(12) NOT NULL CHECK (shipment_type IN ('FCL','LCL','AIR_LCL','FTL','LTL')),
 route_role VARCHAR(12) NOT NULL CHECK (route_role IN ('origin','destination','pod')),
 PRIMARY KEY (location_id, shipment_type, route_role)
);
CREATE INDEX IF NOT EXISTS ix_official_quote_location_usage_lookup ON public.official_quote_location_usage (shipment_type, route_role);

-- Opt-in stage for approved Dhole submissions. No external calls or worker.
-- Apply this additive migration with a backup before enabling the queue flag.
-- Only one staged record per quote, even after repeated requests.
CREATE TABLE IF NOT EXISTS public.official_quote_dhole_outbox (
    quote_id UUID PRIMARY KEY REFERENCES public.official_quote_requests(id) ON DELETE RESTRICT,
    approved_by_id UUID NULL REFERENCES public.usuarios(uuid) ON DELETE SET NULL,
    state VARCHAR(24) NOT NULL DEFAULT 'AwaitingConnector'
        CHECK (state IN ('AwaitingConnector','Pending','Sending','Sent','Failed')),
    priority VARCHAR(6) NOT NULL DEFAULT 'Green'
        CONSTRAINT ck_official_quote_dhole_priority CHECK (priority IN ('Green','Yellow','Red')),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    external_reference VARCHAR(180) NULL,
    last_error_code VARCHAR(60) NULL,
    last_attempt_at_utc TIMESTAMPTZ NULL,
    sent_at_utc TIMESTAMPTZ NULL,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Idempotent upgrade for an outbox created before priority was introduced.
-- Apply with ApprovalQueueEnabled=false and a DB backup.
-- The column CHECK is created only when adding priority to a legacy table;
-- a fresh table already has the identically named table-level constraint.
ALTER TABLE public.official_quote_dhole_outbox
    ADD COLUMN IF NOT EXISTS priority VARCHAR(6) NOT NULL DEFAULT 'Green'
    CONSTRAINT ck_official_quote_dhole_priority
    CHECK (priority IN ('Green','Yellow','Red'));
CREATE INDEX IF NOT EXISTS ix_official_quote_dhole_outbox_state
    ON public.official_quote_dhole_outbox(state,created_at_utc);

// Creation-time outbox for new Dhole-backed official quotes. Entirely independent
// of the old administrator-approval outbox; no external HTTP/worker uses this table.
// Apply with a database backup before setting DirectOutboxEnabled=true.
// A quote and its delivery job are committed or rolled back together.
CREATE TABLE IF NOT EXISTS public.official_quote_dhole_creation_outbox (
    quote_id UUID PRIMARY KEY REFERENCES public.official_quote_requests(id) ON DELETE RESTRICT,
    idempotency_key VARCHAR(80) NOT NULL UNIQUE CHECK (length(btrim(idempotency_key)) > 0),
    state VARCHAR(32) NOT NULL DEFAULT 'PendingDispatch'
        CHECK (state IN ('PendingDispatch','InFlight','HttpAcceptedUnverified',
                        'Rejected','Unconfirmed','Confirmed','Failed')),
    priority VARCHAR(6) NOT NULL DEFAULT 'Green' CHECK (priority IN ('Green','Yellow','Red')),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    external_reference VARCHAR(180) NULL,
    last_error_code VARCHAR(60) NULL,
    last_attempt_at_utc TIMESTAMPTZ NULL,
    verified_at_utc TIMESTAMPTZ NULL,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_official_quote_dhole_creation_state
    ON public.official_quote_dhole_creation_outbox(state, created_at_utc);
