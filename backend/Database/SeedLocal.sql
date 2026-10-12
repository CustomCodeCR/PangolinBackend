-- Insertar MANUALMENTE en una base de pruebas despues de iniciar la API.
-- Datos DEMO, no crean cuentas reales ni envían correos a Internet.
INSERT INTO clientes (nombre, codigo_dynamics, status)
VALUES ('Empresa de Prueba', 'DYN001', TRUE)
ON CONFLICT (codigo_dynamics) DO NOTHING;

INSERT INTO usuarios (correo, cliente_id, tipo_acceso, status)
SELECT 'demo.cliente@castrofallas.test', uuid, 'cliente', TRUE
FROM clientes WHERE codigo_dynamics = 'DYN001'
ON CONFLICT (correo) DO UPDATE SET
    cliente_id = EXCLUDED.cliente_id,
    tipo_acceso = EXCLUDED.tipo_acceso,
    status = TRUE, deleted_at = NULL;

INSERT INTO usuarios (correo, cliente_id, tipo_acceso, status)
SELECT 'demo.usuario@castrofallas.test', uuid, 'usuario', TRUE
FROM clientes WHERE codigo_dynamics = 'DYN001'
ON CONFLICT (correo) DO UPDATE SET
    cliente_id = EXCLUDED.cliente_id,
    tipo_acceso = EXCLUDED.tipo_acceso,
    status = TRUE, deleted_at = NULL;
