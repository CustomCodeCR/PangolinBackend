#!/usr/bin/env python3
"""Regresión estática del contrato de cotizaciones. Sin bases de datos ni secretos.
No sustituye compilación, tests API o revisión visual del navegador.
"""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
api = (ROOT / "backend/Endpoints/OfficialQuoteEndpoints.cs").read_text(encoding="utf-8")
model = (ROOT / "backend/Models/OfficialQuoteModels.cs").read_text(encoding="utf-8")
wizard = (ROOT / "frontend/src/pages/OfficialQuoteWizard.vue").read_text(encoding="utf-8")
root = (ROOT / "frontend/src/Root.vue").read_text(encoding="utf-8")
admin = (ROOT / "frontend/src/pages/ContentManager.vue").read_text(encoding="utf-8")
schema = (ROOT / "backend/Database/OfficialQuotesSchema.sql").read_text(encoding="utf-8")
verified = (ROOT / "backend/Database/OfficialQuotesVerifiedLocations.sql").read_text(encoding="utf-8")
prod_compose = (ROOT / "deploy/docker-compose.images.yml").read_text(encoding="utf-8")
prod_workflow = (ROOT / ".github/workflows/pangolin-images.yml").read_text(encoding="utf-8")

# Contar solo filas VALUES, no ocurrencias de 'inland' en el WHERE/SELECT.
land_rows = re.findall(
    r"(?m)^[ \t]*\('([0-9a-fA-F-]{36})'[ \t]*,[ \t]*'inland'[ \t]*,[ \t]*'([^']+)'[ \t]*,[ \t]*'(VID-LAND-[0-9]{2})'[ \t]*,[ \t]*TRUE\),?[ \t]*$",
    verified,
)
unique_land_rows = (
    len(land_rows) == 13
    and all(len(set(row[i] for row in land_rows)) == 13 for i in range(3))
)

checks = {
    "mínimo de un servicio en API": 's.Services.Count is < 1' in api,
    "internacional no obligatorio": '!s.Services.Contains("Transporte internacional")' not in api,
    "internacional se puede desmarcar": ':disabled="s ===' not in wizard,
    "dirección de entrega validada": 'Required(s.DeliveryAddress' in api and 'form.deliveryAddress.trim()' in wizard,
    "dirección de recolección validada": 'Required(s.PickupAddress' in api and 'form.pickupAddress.trim()' in wizard,
    "días almacenamiento validados": (
        's.FiscalStorageDays is null or < 1 or > 36500' in api
        and 'FiscalStorageDays' in model
        and "form.services.includes('Almacenamiento')" in wizard
        and "form.fiscalStorageDays" in wizard
    ),
    "LCL exige POD": 's.ShipmentType == "LCL" && s.PodLocationId is null' in api,
    "ubicaciones por campo autorizadas": "official_quote_location_usage" in schema and "requiredUses" in api,
    "sin mapas para direcciones": "google.maps" not in wizard.lower() and "mapbox" not in wizard.lower(),
    "rollback V2 conservado": "VITE_OFFICIAL_QUOTES_ENABLED" in root and "QuoteApp" in root,
    "Cotizaciones en Contenido": "OfficialQuoteAdmin v-else-if" in admin,
    "13 ubicaciones terrestres": unique_land_rows,
    "no borrar registros": all(x not in verified.upper() for x in ("DELETE FROM", "DROP TABLE", "TRUNCATE")),
    "frontend oficial habilitado en producción": "VITE_OFFICIAL_QUOTES_ENABLED=true" in prod_workflow,
    "API oficial habilitada en producción": 'Features__OfficialQuotesEnabled: "true"' in prod_compose,
    "migración y catálogo no ficticio preparados": all(
        sql in prod_workflow for sql in
        ("OfficialQuotesSchema.sql", "OfficialQuotesVerifiedLocations.sql",
         "OfficialQuotesVideoLocations.sql", "--single-transaction",
         'ready_roles" != "12"')
    ),
    "semillas de Development excluidas de producción": "OfficialQuotesDevelopmentLocations.sql" not in prod_workflow,
    "prueba de autorización posterior al despliegue": "/api/admin/quotes/official/permissions/me" in prod_workflow,
}
for title, ok in checks.items():
    print(f"{'OK' if ok else 'ERROR'}: {title}")
if not all(checks.values()):
    raise SystemExit(1)
print("Comprobaciones estáticas superadas. Aún falta npm build, dotnet build y QA manual.")
