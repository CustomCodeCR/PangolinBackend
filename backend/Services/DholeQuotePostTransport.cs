using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Configuration;

namespace CastroFallas.MiniQuote.Api.Services;

/// <summary>
/// Isolated, server-only transport for a FUTURE explicitly authorized quote dispatch.
/// Not registered with a route, worker, queue consumer or background service.
/// Both feature opt-in and a private scoped key are required before ANY HTTP occurs.
/// It never resolves catalog IDs: callers must later supply a separately validated
/// flat published Dhole contract body. Do not feed arbitrary user input here.
/// </summary>
public sealed class DholeQuotePostTransport(
    IConfiguration config, IHttpClientFactory clients)
{
    private static readonly Uri FixedDestination = new(
        "https://api.logisticacastrofallas.com/api/external/v1/solicitar-tarifa-wjicua4");
    private static readonly Regex KeyFormat = new(
        @"\Adh_ext_[a-f0-9]{64}\z", RegexOptions.Compiled | RegexOptions.CultureInvariant);
    private const int MaxBodyBytes = 128 * 1024;
    private const int MaxResponseBytes = 64 * 1024;
    // Exact narrow allowlist from the reviewed external contract preview.
    // Any new field requires another code review; never automatically forward 103 inputs.
    private static readonly HashSet<string> AllowedFields = new(StringComparer.Ordinal)
    {
        "priority", "shipmentMode", "originName", "destinationName", "poeId", "poeName",
        "podId", "podName", "form_rateType", "form_modality", "form_shipmentMode",
        "form_originId", "form_destinationId", "form_podId", "form_incotermId",
        "form_serviceIds", "form_loadDate", "form_cargoDescription", "form_cargoObservations",
        "form_cargoValue", "form_cargoWeightKg", "form_cargoPackages", "form_storageDays",
        "form_cabysCode", "form_pickupAddress", "form_dangerousCargo", "form_nonStackable",
        "form_overweight", "form_fclContainers", "form_landContainers",
        "form_inlandDeliveryLocation_address", "requestContext_incotermName",
        "requestContext_poeId", "requestContext_podId", "sellerContext_cargoReadyDate",
        "sellerContext_consolidatedCargoLines"
    };

    // Independent from ApprovalQueueEnabled and DholeCatalogs:SubmissionEnabled.
    // No compose environment variable for PostEnabled or a private write key is
    // provided in this PR; nobody should turn it on until a later deployment decision.
    public bool Enabled => config.GetValue<bool>("DholeSubmission:PostEnabled");

    public async Task<DholeQuotePostOutcome> PostValidatedAsync(
        Guid quoteId, JsonElement publishedFlatBody, CancellationToken ct)
    {
        // Fail CLOSED before inspecting or serializing potentially private user data.
        if (!Enabled) return DholeQuotePostOutcome.Disabled;
        var secret = config["DholeSubmission:ApiKey"];
        if (secret is null || !KeyFormat.IsMatch(secret))
            return DholeQuotePostOutcome.NotConfigured;
        if (quoteId == Guid.Empty || !IsValidFlatBody(publishedFlatBody))
            return DholeQuotePostOutcome.InvalidPayload;

        byte[] payload = Encoding.UTF8.GetBytes(publishedFlatBody.GetRawText());
        if (payload.Length > MaxBodyBytes) return DholeQuotePostOutcome.InvalidPayload;

        using var request = new HttpRequestMessage(HttpMethod.Post, FixedDestination);
        request.Headers.TryAddWithoutValidation("X-Api-Key", secret);
        request.Headers.TryAddWithoutValidation(
            "Idempotency-Key", "cf-official-" + quoteId.ToString("D"));
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        request.Content = new ByteArrayContent(payload);
        request.Content.Headers.ContentType = new MediaTypeHeaderValue("application/json")
        {
            CharSet = "utf-8"
        };

        // One POST, no automatic retries: a timeout could mean Dhole created the quote.
        // No response body or exception text is logged or returned (may contain PII).
        try
        {
            using var response = await clients.CreateClient("DholeQuotePost")
                .SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
            if (response.StatusCode == HttpStatusCode.TooManyRequests ||
                (int)response.StatusCode >= 500)
                return DholeQuotePostOutcome.Unconfirmed;
            if (!response.IsSuccessStatusCode)
                return DholeQuotePostOutcome.Rejected;
            if (response.Content.Headers.ContentLength is > MaxResponseBytes)
                return DholeQuotePostOutcome.Unconfirmed;
            await response.Content.LoadIntoBufferAsync(MaxResponseBytes, ct);
            // 2xx only means HTTP accepted; not proof of persisted Pricing ID.
            return DholeQuotePostOutcome.HttpAcceptedUnverified;
        }
        catch (Exception ex) when (ex is HttpRequestException or IOException or
            InvalidOperationException or OperationCanceledException)
        {
            return DholeQuotePostOutcome.Unconfirmed;
        }
    }

    private static bool IsValidFlatBody(JsonElement body)
    {
        if (body.ValueKind != JsonValueKind.Object) return false;
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var property in body.EnumerateObject())
        {
            if (!AllowedFields.Contains(property.Name) || !seen.Add(property.Name))
                return false;
        }
        if (!body.TryGetProperty("priority", out var priority) ||
            priority.ValueKind != JsonValueKind.String ||
            priority.GetString() is not ("Green" or "Yellow" or "Red"))
            return false;
        if (!body.TryGetProperty("shipmentMode", out var mode) ||
            mode.ValueKind != JsonValueKind.String ||
            mode.GetString() is not ("Fcl" or "Lcl" or "Air" or "Ftl" or "Ltl"))
            return false;
        if (!body.TryGetProperty("form_cargoDescription", out var description) ||
            description.ValueKind != JsonValueKind.String ||
            !description.GetString()!.Contains(
                "\n\nSolicitante desde la web de Castro Fallas:\n", StringComparison.Ordinal))
            return false;
        if (!body.TryGetProperty("form_serviceIds", out var ids) ||
            ids.ValueKind != JsonValueKind.Array || ids.GetArrayLength() == 0)
            return false;
        foreach (var id in ids.EnumerateArray())
        {
            if (id.ValueKind != JsonValueKind.String ||
                !Guid.TryParse(id.GetString(), out var parsed) || parsed == Guid.Empty)
                return false;
        }
        return true;
    }
}

/// <summary>No remote reference is returned or invented by this transport.</summary>
public enum DholeQuotePostOutcome
{
    Disabled,
    NotConfigured,
    InvalidPayload,
    Rejected,
    Unconfirmed,
    HttpAcceptedUnverified
}
