# Pricing receipt reference — PR #274, 2026-11-24

Source-only verification (no new real POST):
- DholePricingService @ 52179b5, src/Dhole.Pricing.Api/Endpoints/RateRequestEndpoints.cs: CreateAsync commits the request and returns Results.Ok(entity.Id). GET /api/pricing/rate-requests/{id} requires RateUpdate; no permission to invoke or expose it is assumed.
- DholeApiGateway @ 04dc77a, Dhole.ApiGateway/ThirdParty/ThirdPartyApiEndpoints.cs: Project maps a scalar JSON value to the explicitly configured public value field. The stored API Manager export (2026-11-20) has responseRoot=null and output value -> value. Expected external response: {"value":"<UUID>"}. Current deployed configuration and actual remote response still need independent confirmation.

The transport extracts only a nonempty canonical UUID from that exact published response, preserving existing 2xx/ambiguous outcome semantics. It does not store raw response or retry. The candidate is persisted atomically with the outcome in provider_reference_candidate; external_reference and verified_at_utc remain reserved for independently verified creation. Administration displays the candidate explicitly as unverified. The existing PostgreSQL/mock HTTP harness checks this distinction; malformed receipts are covered by local parser assertions. No automatic worker registration, catalog policy change, flags or production writes.

Before any rollout: apply additive schema upgrade with backup while direct dispatch is disabled, verify the live publication and the authorized read-only Pricing verification mechanism, and complete catalog freshness, commercial/permission and dispatcher controls. A fresh real test requires separate authorization.
