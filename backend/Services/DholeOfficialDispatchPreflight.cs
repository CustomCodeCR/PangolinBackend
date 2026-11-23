using System.Text.Json;
using CastroFallas.MiniQuote.Api.Models;

namespace CastroFallas.MiniQuote.Api.Services;

/// <summary>
/// Server-only, offline preflight of an already persisted official quote.
/// Verifies that the immutable stored submission and its server-validated route
/// still agree, resolves short-lived catalog IDs and assembles the flat published
/// Pricing contract. No persistence, HTTP, key access, sender or worker.
/// This review is NEVER permission to send.
/// </summary>
public static class DholeOfficialDispatchPreflight
{
    private static readonly JsonSerializerOptions WebJson = new(JsonSerializerDefaults.Web);

    public static DholeOfficialFlatReview ReviewSavedQuote(
        OfficialQuoteRequest savedQuote,
        DholeValidatedRoute verifiedRoute,
        JsonElement temporaryPrivateCatalogs,
        IReadOnlyDictionary<string, DholeOfficialExistingCatalogSnapshot> existingGetCatalogs,
        DateTime utcNow)
    {
        if (savedQuote is null || savedQuote.Id == Guid.Empty ||
            string.IsNullOrWhiteSpace(savedQuote.FormJson) ||
            savedQuote.FormJson.Length > 128 * 1024 ||
            verifiedRoute is null || existingGetCatalogs is null ||
            utcNow.Kind != DateTimeKind.Utc)
            throw new ArgumentException("Dhole preflight: invalid saved quote, route or UTC review.");

        OfficialQuoteSubmit form;
        try
        {
            form = JsonSerializer.Deserialize<OfficialQuoteSubmit>(
                savedQuote.FormJson, WebJson) ??
                throw new ArgumentException("Dhole preflight: missing saved form.");
        }
        catch (JsonException)
        {
            throw new ArgumentException("Dhole preflight: saved JSON is malformed.");
        }

        // The quote's administrative copy is the only source of the original
        // form, but names and route IDs must be checked against current trusted
        // catalogs by the caller; no browser-supplied route labels here.
        if (form.CatalogSource != "dhole" ||
            savedQuote.Mode != form.Mode || savedQuote.ShipmentType != form.ShipmentType ||
            !string.Equals(savedQuote.ContactName, form.ContactName, StringComparison.Ordinal) ||
            !string.Equals(savedQuote.ContactEmail, form.ContactEmail, StringComparison.Ordinal) ||
            !string.Equals(savedQuote.ContactPhone, form.ContactPhone, StringComparison.Ordinal) ||
            savedQuote.OriginName != verifiedRoute.OriginName ||
            savedQuote.DestinationName != verifiedRoute.DestinationName)
            throw new ArgumentException(
                "Dhole preflight: administrative copy differs from verified source.");

        var draft = DholeOfficialQuoteDraftBuilder.Project(
            form, savedQuote.Id, verifiedRoute);
        var ids = DholeOfficialManualCatalogResolution.Review(
            draft, temporaryPrivateCatalogs, existingGetCatalogs, utcNow);
        var review = DholeOfficialQuoteFlatPreviewBuilder.BuildReview(
            draft, ids, utcNow);

        // Defensive check: a future coordinator must not mix another outbox
        // identity or misinterpret a review result as permission to send.
        if (review.OfficialQuoteId != savedQuote.Id ||
            review.IdempotencyKey != "cf-official-" + savedQuote.Id.ToString("D") ||
            review.RemoteSubmissionPermitted)
            throw new InvalidOperationException(
                "Dhole preflight: inconsistent quote identity or unsafe dispatch decision.");
        return review;
    }
}
