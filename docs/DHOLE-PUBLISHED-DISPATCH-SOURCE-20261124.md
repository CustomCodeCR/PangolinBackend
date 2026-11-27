# Published-catalog dispatcher preparation — 2026-11-24

PR #274 only. No deployment, new live POST, worker registration or flag changes.

- Reuses the existing seven read-only catalog clients and the separate scoped DholeLookupCatalogService for pricing-services and (only for FTL) land-equipment-types. The two published paths and read credential must be supplied by Dhole. No invented endpoint slugs or embedded UUIDs.
- Shared resolver preserves the same strict mapping of service codes and equipment pairs, active-state and UUID checks, and original five-minute freshness. The manual export remains offline-only with unchanged expiry.
- DholeOfficialPublishedDispatchSource obtains current route/equipment snapshots once, validates the persisted Admin copy, and resolves the published lookups. Missing, stale or malformed catalog data prevents a claim.
- DholeOfficialDispatchPass is an unregistered bounded consumer: pending and never-attempted jobs only, keyset scan, same one-shot coordinator and no replay of uncertain outcomes. A future host requires an explicit authorization, scheduler, scoped database lifetime, and operational monitoring; it must not be enabled by this commit.
- Existing draft harness verifies parity with synthetic published lookups, no real HTTP. Existing CI compiles backend code; the dispatch pass still needs a targeted isolated integration check before registration.

Outstanding external dependencies: approved public GET paths with fields id/code/name/value/isActive and size/kind for FTL; narrow verification access for Pricing receipts; permission check for contact visibility; commercial currency/insurance semantics. Until authorized, no automatic sender may use the old browser exports.
