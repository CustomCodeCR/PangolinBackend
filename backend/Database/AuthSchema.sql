-- Esquema de autenticación Castro Fallas (PostgreSQL 16+)
-- Idempotente: seguro para una instalación con quote_requests existente.
-- Se respetan los TIMESTAMP sin zona de clientes/usuarios existentes.
-- Los OTP y sesiones sí utilizan TIMESTAMPTZ (UTC).
CREATE TABLE IF NOT EXISTS clientes (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(500) NOT NULL,
    codigo_dynamics TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    deleted_at TIMESTAMP NULL,
    last_login_at TIMESTAMP NULL,
    status BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS usuarios (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    correo VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    deleted_at TIMESTAMP NULL,
    last_login_at TIMESTAMP NULL,
    status BOOLEAN NOT NULL DEFAULT TRUE,
    cliente_id UUID NOT NULL,
    tipo_acceso VARCHAR(20) NOT NULL DEFAULT 'usuario',
    CONSTRAINT fk_cliente FOREIGN KEY (cliente_id)
      REFERENCES clientes(uuid) ON DELETE CASCADE,
    CONSTRAINT ck_tipo_acceso CHECK (tipo_acceso IN ('cliente','usuario'))
);

-- Para tablas usuarios preexistentes creadas con el SQL original del solicitante.
-- Permitir iniciar sobre versiones anteriores de las tablas del usuario sin eliminarlas.
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP NULL;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP NULL;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS tipo_acceso VARCHAR(20) NOT NULL DEFAULT 'usuario';
-- Asegura que los registros NUEVOS tengan tipo correcto; no cambia los existentes.
ALTER TABLE usuarios ALTER COLUMN tipo_acceso SET DEFAULT 'usuario';
CREATE INDEX IF NOT EXISTS idx_usuarios_cliente_id ON usuarios(cliente_id);

-- La tasa por correo también se controla en PostgreSQL (sin Redis).
-- Guarda SHA-256 de correo normalizado, no la dirección en texto.
CREATE TABLE IF NOT EXISTS otp_rate_limits (
    identifier_hash CHAR(64) PRIMARY KEY,
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    request_count INTEGER NOT NULL DEFAULT 1,
    last_requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS otp_challenges (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES usuarios(uuid) ON DELETE CASCADE,
    tipo_acceso VARCHAR(12) NOT NULL,
    otp_hash CHAR(64) NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ NULL,
    CONSTRAINT ck_otp_attempts CHECK (attempts >= 0),
    CONSTRAINT ck_otp_tipo CHECK (tipo_acceso IN ('cliente', 'usuario'))
);
CREATE INDEX IF NOT EXISTS idx_otp_usuario ON otp_challenges(usuario_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_otp_expira ON otp_challenges(expires_at);

CREATE TABLE IF NOT EXISTS auth_sessions (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES usuarios(uuid) ON DELETE CASCADE,
    token_hash CHAR(64) NOT NULL UNIQUE,
    tipo_acceso VARCHAR(12) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ NULL,
    CONSTRAINT ck_sesion_tipo CHECK (tipo_acceso IN ('cliente', 'usuario'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_usuario ON auth_sessions(usuario_id, expires_at);

-- Nota: el alta/actualización de registros de clientes y usuarios se hace en DBeaver.
-- No se ofrecen endpoints públicos de alta para prevenir registros no autorizados.

-- Auditoría de cambios de rol/estado; nunca se guardan códigos OTP ni JWT.
-- No se borran ni alteran filas de clientes/usuarios existentes.
CREATE TABLE IF NOT EXISTS auth_admin_user_audit (
    id BIGSERIAL PRIMARY KEY,
    actor_usuario_id UUID NULL REFERENCES usuarios(uuid) ON DELETE SET NULL,
    target_usuario_id UUID NULL REFERENCES usuarios(uuid) ON DELETE SET NULL,
    old_role VARCHAR(20) NOT NULL,
    new_role VARCHAR(20) NOT NULL,
    old_active BOOLEAN NOT NULL,
    new_active BOOLEAN NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_user_audit_target
    ON auth_admin_user_audit(target_usuario_id, changed_at DESC);

-- En caso de una base creada manualmente con clientes/usuarios y sin el cotizador.
CREATE TABLE IF NOT EXISTS quote_requests (
    "Id" UUID PRIMARY KEY,
    "ServiceType" VARCHAR(30) NOT NULL,
    "Origin" VARCHAR(150) NOT NULL,
    "Destination" VARCHAR(150) NOT NULL,
    "CargoType" VARCHAR(100) NOT NULL,
    "WeightKg" NUMERIC(18,2) NOT NULL,
    "Pieces" INTEGER NOT NULL,
    "Notes" TEXT NULL,
    "Status" VARCHAR(30) NOT NULL,
    "CreatedAtUtc" TIMESTAMPTZ NOT NULL
);

-- El rediseño genera descripciones de múltiples pasos que pueden superar 1000 caracteres.
-- Ampliar columnas existentes sin borrar cotizaciones históricas.
ALTER TABLE quote_requests ALTER COLUMN "Notes" TYPE TEXT;

-- Vinculación de futuras cotizaciones a la empresa que inició sesión.
-- Los registros históricos quedan con NULL, no se asignan automáticamente a otra empresa.
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS "ClienteId" UUID NULL;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS "UsuarioId" UUID NULL;
CREATE INDEX IF NOT EXISTS idx_quotes_cliente_id ON quote_requests("ClienteId");


-- Cotizaciones estructuradas v2: nunca borra quote_requests ni las filas previas.
-- El peso o la cantidad desconocidos se guardan NULL, no como valores ficticios.
ALTER TABLE quote_requests ALTER COLUMN "WeightKg" DROP NOT NULL;
ALTER TABLE quote_requests ALTER COLUMN "Pieces" DROP NOT NULL;

-- Una fila de contacto por cotización nueva; las históricas pueden no tenerla.
CREATE TABLE IF NOT EXISTS quote_contacts (
    quote_id UUID PRIMARY KEY REFERENCES quote_requests("Id") ON DELETE CASCADE,
    full_name VARCHAR(150) NOT NULL,
    company VARCHAR(200) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(40) NOT NULL,
    country VARCHAR(100) NULL
);
CREATE TABLE IF NOT EXISTS quote_land_details (
    quote_id UUID PRIMARY KEY REFERENCES quote_requests("Id") ON DELETE CASCADE,
    transport_kind VARCHAR(3) NOT NULL CHECK (transport_kind IN ('FTL','LTL')),
    equipment VARCHAR(100) NOT NULL,
    insured BOOLEAN NOT NULL,
    customer_type VARCHAR(30) NOT NULL
);
CREATE TABLE IF NOT EXISTS quote_air_details (
    quote_id UUID PRIMARY KEY REFERENCES quote_requests("Id") ON DELETE CASCADE,
    operation VARCHAR(20) NOT NULL,
    incoterm VARCHAR(3) NOT NULL,
    nationalization BOOLEAN NOT NULL,
    description TEXT NOT NULL,
    equipment_type VARCHAR(100) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    dangerous_goods BOOLEAN NULL,
    additional_details TEXT NULL
);
CREATE TABLE IF NOT EXISTS quote_maritime_details (
    quote_id UUID PRIMARY KEY REFERENCES quote_requests("Id") ON DELETE CASCADE,
    operation VARCHAR(20) NOT NULL,
    incoterm VARCHAR(3) NOT NULL,
    nationalization BOOLEAN NOT NULL,
    shipping_type VARCHAR(3) NOT NULL CHECK (shipping_type IN ('FCL','LCL')),
    description TEXT NOT NULL,
    container_type VARCHAR(100) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    dangerous_goods BOOLEAN NULL,
    additional_details TEXT NULL
);
CREATE TABLE IF NOT EXISTS quote_multimodal_details (
    quote_id UUID PRIMARY KEY REFERENCES quote_requests("Id") ON DELETE CASCADE,
    operation VARCHAR(20) NOT NULL,
    incoterm VARCHAR(3) NOT NULL,
    nationalization BOOLEAN NOT NULL,
    entry_country VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    container_type VARCHAR(100) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    dangerous_goods BOOLEAN NULL,
    additional_details TEXT NULL
);

-- Contenido compartido: las vistas de noticias y el administrador usan PostgreSQL
-- en vez del localStorage de un único navegador. SQL idempotente, sin DROP.
CREATE TABLE IF NOT EXISTS public.cms_news (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(160) NOT NULL,
    category VARCHAR(60) NOT NULL,
    description VARCHAR(1200) NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    image TEXT NOT NULL DEFAULT '',
    published BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.cms_news ADD COLUMN IF NOT EXISTS body TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_cms_news_published ON public.cms_news(published, created_at DESC);
-- Ubicaciones editables del sitio, sin reescribir noticias o archivos ya existentes.
CREATE TABLE IF NOT EXISTS public.cms_site_slots (
    key VARCHAR(100) PRIMARY KEY,
    draft_es TEXT,
    draft_en TEXT,
    draft_media_id UUID,
    published_es TEXT,
    published_en TEXT,
    published_media_id UUID,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_cms_site_slots_published_media ON public.cms_site_slots(published_media_id);
CREATE INDEX IF NOT EXISTS idx_cms_site_slots_draft_media ON public.cms_site_slots(draft_media_id);

CREATE TABLE IF NOT EXISTS public.cms_media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    kind VARCHAR(30) NOT NULL,
    src TEXT NOT NULL,
    object_key VARCHAR(500) NULL,
    mime_type VARCHAR(120) NULL,
    size_bytes BIGINT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.cms_media ADD COLUMN IF NOT EXISTS object_key VARCHAR(500) NULL;
ALTER TABLE public.cms_media ADD COLUMN IF NOT EXISTS mime_type VARCHAR(120) NULL;
ALTER TABLE public.cms_media ADD COLUMN IF NOT EXISTS size_bytes BIGINT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_cms_media_object_key
  ON public.cms_media(object_key) WHERE object_key IS NOT NULL;

-- Itinerarios provisionales: comparten base login pero NO dependen de usuarios/cotizaciones.
-- CREATE no sobreescribe tablas existentes; ALTER conserva las filas al añadir Closing y status.
CREATE TABLE IF NOT EXISTS public.itinerarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pol VARCHAR(150) NOT NULL,
    pod VARCHAR(150) NOT NULL,
    etd DATE NOT NULL,
    eta DATE NOT NULL,
    carrier VARCHAR(150) NULL,
    vessel VARCHAR(150) NULL,
    voyage VARCHAR(50) NULL,
    transporte VARCHAR(20) NOT NULL,
    modalidad VARCHAR(3) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'planning',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closing DATE NULL
);
ALTER TABLE public.itinerarios ADD COLUMN IF NOT EXISTS closing DATE NULL;
-- Migración no destructiva: bases anteriores no tienen status, pero EF lo consulta.
ALTER TABLE public.itinerarios ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'planning';
UPDATE public.itinerarios SET status = 'planning' WHERE status IS NULL;
ALTER TABLE public.itinerarios ALTER COLUMN status SET DEFAULT 'planning';
ALTER TABLE public.itinerarios ALTER COLUMN status SET NOT NULL;

-- Mantiene updated_at sincronizado incluso cuando los registros se editan en DBeaver.
CREATE OR REPLACE FUNCTION auth_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_clientes_updated_at') THEN
        CREATE TRIGGER trg_clientes_updated_at BEFORE UPDATE ON clientes
          FOR EACH ROW EXECUTE FUNCTION auth_touch_updated_at();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_usuarios_updated_at') THEN
        CREATE TRIGGER trg_usuarios_updated_at BEFORE UPDATE ON usuarios
          FOR EACH ROW EXECUTE FUNCTION auth_touch_updated_at();
    END IF;
END;
$$;
