#!/usr/bin/env python3
"""Static contract checks for Dhole/Dynamics extra fields. No real shipments or secrets."""
from pathlib import Path

root = Path(__file__).resolve().parents[1]
backend = (root / "backend/Endpoints/DholeTrackingEndpoints.cs").read_text(encoding="utf-8")
frontend = (root / "frontend/src/pages/Tracking.vue").read_text(encoding="utf-8")
docs = (root / "docs/DHOLE-TRACKING-PREVIEW.md").read_text(encoding="utf-8")
program = (root / "backend/Program.cs").read_text(encoding="utf-8")

assert 'RequireAuthorization("registered")' in backend, "Dynamics endpoint must require a session"
assert 'RequireRateLimiting("tracking")' in backend, "Dynamics endpoint must be rate limited"
assert 'options.AddPolicy("registered", policy => policy.RequireRole("client", "admin"))' in program
assert 'options.AddPolicy("admin", policy => policy.RequireRole("admin"))' in program
assert 'var isAdmin = http.User.IsInRole("admin")' in backend
assert 'DholeTracking:Enabled' in backend and 'DholeTracking:ApiKey' in backend
assert 'X-Dhole-Api-Key' not in frontend and 'GetFormatted(item' not in frontend
assert 'return Results.Ok(new' in backend and 'JsonSerializer.Serialize(doc' not in backend
assert 'doc.RootElement' not in frontend and 'incidentid' not in frontend
assert 'No devuelve JSON crudo' in docs and 'Correspondencia de puertos con Cotizaciones' in docs

admin = {
    "po": "new_po",
    "packageCount": "new_contidadbultos",
    "commodity": "new_commodity",
    "seal": "new_seal",
    "invoice": "new_factura",
    "companyInvoice": "new_new_facturacompaia",
    "shipper": "_new_shipper_value",
    "customerInstructions": "new_instcliente",
}
for field, key in admin.items():
    marker = f'{field} = isAdmin ? '
    assert marker in backend, f'{field} must be redacted for clients'
    after = backend.split(marker, 1)[1].splitlines()[0]
    assert f'"{key}"' in after and ': null' in after, f'{field} needs a null default'
    assert f'{field}: string | null' in frontend, f'Missing frontend contract: {field}'
    assert f'data.{field}' in frontend, f'Missing frontend rendering: {field}'

shared = {
    "customerStatus": "new_statuscliente",
    "incoterm": "new_incoterm",
    "equipmentSize": "new_tamaoequipo",
    "equipmentCount": "new_cantequipo",
    "departureConfirmedAt": "new_confirmacinzarpe",
    "warehouseReceivedAt": "new_ingresoabodegas",
    "destinationEta": "new_etadestino",
    "officializedAt": "new_fechayhoraoficializacion",
    "entryAt": "new_ingreso",
}
for field, key in shared.items():
    assert f'{field} = ' in backend and f'"{key}"' in backend
    assert f'{field}: string | null' in frontend
assert "field.value?.trim()" in frontend and '/^[\\s/]+$/.test(field.value)' in frontend
assert "if (!data) return []" in frontend
print("PASS: Dynamics authenticated + bounded lookup, admin field redaction mapping, UI optional fields, original ports documentation")
