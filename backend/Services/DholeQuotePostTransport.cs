using System.Globalization;
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
    // No form_cargoValue yet: the currency UUID and insurance commercial
    // semantics are NOT verified. An insured quote must block upstream rather
    // than send an unlabeled monetary amount or silently omit it.
    // Any new field requires another code review; never automatically forward 103 inputs.
    private static readonly HashSet<string> AllowedFields = new(StringComparer.Ordinal)
    {
        "priority", "shipmentMode", "originName", "destinationName", "poeId", "poeName",
        "podId", "podName", "form_rateType", "form_modality", "form_shipmentMode",
        "form_originId", "form_destinationId", "form_podId", "form_incotermId",
        "form_serviceIds", "form_loadDate", "form_cargoDescription", "form_cargoObservations",
        "form_cargoWeightKg", "form_cargoPackages", "form_storageDays",
        "form_cargoLengthCm", "form_cargoWidthCm", "form_cargoHeightCm",
        "form_equipmentId", "form_equipmentType", "form_equipmentSize", "form_equipmentQuantity",
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
    // Does not send HTTP; lets a separately gated coordinator avoid consuming
    // a once-only outbox attempt when the private write key is absent.
    public bool IsConfiguredForOneAttempt =>
        Enabled && config["DholeSubmission:ApiKey"] is { } secret &&
        KeyFormat.IsMatch(secret);

    // Compatibility for the existing isolated one-shot tool.
    public async Task<DholeQuotePostOutcome> PostValidatedAsync(
        Guid quoteId, JsonElement publishedFlatBody, CancellationToken ct) =>
        (await PostWithReceiptAsync(quoteId, publishedFlatBody, ct)).Outcome;

    public async Task<DholeQuotePostReceipt> PostWithReceiptAsync(
        Guid quoteId, JsonElement publishedFlatBody, CancellationToken ct)
    {
        // Fail CLOSED before inspecting or serializing potentially private user data.
        if (!Enabled) return new(DholeQuotePostOutcome.Disabled, null);
        var secret = config["DholeSubmission:ApiKey"];
        if (secret is null || !KeyFormat.IsMatch(secret))
            return new(DholeQuotePostOutcome.NotConfigured, null);
        if (quoteId == Guid.Empty || !IsValidFlatBody(publishedFlatBody))
            return new(DholeQuotePostOutcome.InvalidPayload, null);

        byte[] payload = Encoding.UTF8.GetBytes(publishedFlatBody.GetRawText());
        if (payload.Length > MaxBodyBytes) return new(DholeQuotePostOutcome.InvalidPayload, null);

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
            // Pricing's idempotency middleware returns 409 while an identical
            // key is processing. Its completed response is retained 24 hours,
            // not forever; 409 and 408 are therefore UNKNOWN, not rejection or
            // permission to auto-retry the original creation.
            if (response.StatusCode is HttpStatusCode.Conflict or
                HttpStatusCode.RequestTimeout or HttpStatusCode.TooManyRequests ||
                (int)response.StatusCode >= 500)
                return new(DholeQuotePostOutcome.Unconfirmed, null);
            if (!response.IsSuccessStatusCode)
                return new(DholeQuotePostOutcome.Rejected, null);
            if (response.Content.Headers.ContentLength is > MaxResponseBytes)
                return new(DholeQuotePostOutcome.Unconfirmed, null);
            await response.Content.LoadIntoBufferAsync(MaxResponseBytes, ct);
            // Gateway's published value is a receipt candidate, never independent
            // verification. Do not retain or log any raw response content.
            var raw = await response.Content.ReadAsStringAsync(ct);
            return new(DholeQuotePostOutcome.HttpAcceptedUnverified,
                response.StatusCode == HttpStatusCode.OK ? ReadPublishedReference(raw) : null);
        }
        catch (Exception ex) when (ex is HttpRequestException or IOException or
            InvalidOperationException or OperationCanceledException)
        {
            return new(DholeQuotePostOutcome.Unconfirmed, null);
        }
    }

    // Only the reviewed external projection {"value":"UUID"} is accepted.
    // Missing, malformed, duplicate or unexpected fields remain unverified.
    public static Guid? ReadPublishedReference(string raw)
    {
        try
        {
            using var doc = JsonDocument.Parse(raw);
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object ||
                root.EnumerateObject().Count() != 1 ||
                !root.TryGetProperty("value", out var value) ||
                value.ValueKind != JsonValueKind.String ||
                !Guid.TryParseExact(value.GetString(), "D", out var id) ||
                id == Guid.Empty)
                return null;
            return id;
        }
        catch (JsonException) { return null; }
    }

    // Pure local validation; it makes NO HTTP call and does not grant
    // authorization to dispatch. Shared by pre-claim review and transport.
    public static bool IsValidFlatBody(JsonElement body)
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
        // A field allowlist alone is insufficient: a syntactically correct
        // payload could combine different POE/POD IDs or attach FTL equipment
        // to an LCL quote. This is a second, independent fail-closed guard.
        return IsConsistentQuoteBody(body, mode.GetString()!);
    }

    private static bool ValidUuid(JsonElement value) =>
        value.ValueKind == JsonValueKind.String &&
        Guid.TryParse(value.GetString(), out var guid) && guid != Guid.Empty;

    private static bool RequiredUuid(JsonElement body, string key) =>
        body.TryGetProperty(key, out var value) && ValidUuid(value);

    private static bool Text(JsonElement value) =>
        value.ValueKind == JsonValueKind.String &&
        !string.IsNullOrWhiteSpace(value.GetString()) &&
        value.GetString()!.Length <= 4000;

    private static bool RequiredText(JsonElement body, string key) =>
        body.TryGetProperty(key, out var value) && Text(value);

    private static bool Positive(JsonElement value, out decimal number)
    {
        number = 0;
        return value.ValueKind == JsonValueKind.Number &&
            value.TryGetDecimal(out number) &&
            number > 0 && number <= 1_000_000_000m;
    }

    private static bool ExactDate(JsonElement body, string key)
    {
        if (!body.TryGetProperty(key, out var value) ||
            value.ValueKind != JsonValueKind.String) return false;
        return DateOnly.TryParseExact(value.GetString(), "yyyy-MM-dd",
            CultureInfo.InvariantCulture, DateTimeStyles.None, out _);
    }

    private static bool IsConsistentQuoteBody(JsonElement body, string shipmentMode)
    {
        var expectedMode = shipmentMode switch
        {
            "Fcl" or "Lcl" => "Maritime",
            "Air" => "Air",
            "Ftl" or "Ltl" => "Land",
            _ => ""
        };
        if (expectedMode == "" || !RequiredUuid(body, "form_originId") ||
            !RequiredUuid(body, "form_destinationId") ||
            !RequiredUuid(body, "poeId") ||
            !RequiredUuid(body, "form_incotermId") ||
            !RequiredUuid(body, "requestContext_poeId") ||
            !RequiredText(body, "originName") ||
            !RequiredText(body, "destinationName") ||
            !RequiredText(body, "poeName") ||
            !RequiredText(body, "requestContext_incotermName") ||
            !RequiredText(body, "form_rateType") ||
            body.GetProperty("form_rateType").GetString() != "Spot" ||
            !RequiredText(body, "form_modality") ||
            body.GetProperty("form_modality").GetString() != expectedMode ||
            !RequiredText(body, "form_shipmentMode") ||
            body.GetProperty("form_shipmentMode").GetString() != shipmentMode ||
            !ExactDate(body, "form_loadDate") ||
            !ExactDate(body, "sellerContext_cargoReadyDate") ||
            body.GetProperty("form_loadDate").GetString() !=
                body.GetProperty("sellerContext_cargoReadyDate").GetString() ||
            body.GetProperty("form_destinationId").GetString() != body.GetProperty("poeId").GetString() ||
            body.GetProperty("requestContext_poeId").GetString() != body.GetProperty("poeId").GetString() ||
            body.GetProperty("destinationName").GetString() != body.GetProperty("poeName").GetString())
            return false;

        if (body.TryGetProperty("form_cargoObservations", out var observations) &&
            (observations.ValueKind != JsonValueKind.String ||
             string.IsNullOrWhiteSpace(observations.GetString()) ||
             observations.GetString()!.Length > 6000))
            return false;
        bool maritime = expectedMode == "Maritime";
        foreach (var name in new[] { "podId", "form_podId", "requestContext_podId" })
        {
            if (maritime)
            {
                if (!RequiredUuid(body, name) ||
                    body.GetProperty(name).GetString() != body.GetProperty("podId").GetString())
                    return false;
            }
            else if (body.TryGetProperty(name, out _)) return false;
        }
        if (maritime && !RequiredText(body, "podName")) return false;
        if (!maritime && body.TryGetProperty("podName", out _)) return false;

        var ids = body.GetProperty("form_serviceIds");
        var distinctIds = new HashSet<Guid>();
        foreach (var id in ids.EnumerateArray())
            if (!ValidUuid(id) || !distinctIds.Add(Guid.Parse(id.GetString()!)))
                return false;

        if (!body.TryGetProperty("form_cargoWeightKg", out var total) ||
            !Positive(total, out var totalKg)) return false;
        foreach (var optionalFlag in new[] { "form_nonStackable", "form_dangerousCargo", "form_overweight" })
            if (body.TryGetProperty(optionalFlag, out var flag) &&
                flag.ValueKind is not (JsonValueKind.True or JsonValueKind.False)) return false;

        string[] dimensionFields = ["form_cargoLengthCm", "form_cargoWidthCm", "form_cargoHeightCm"];
        var hasDimensions = dimensionFields.Any(name => body.TryGetProperty(name, out _));
        if (hasDimensions && (shipmentMode != "Air" ||
            dimensionFields.Any(name => !body.TryGetProperty(name, out var value) || !Positive(value, out _))))
            return false;

        string[] equipmentFields = ["form_equipmentId", "form_equipmentType", "form_equipmentSize", "form_equipmentQuantity"];
        var hasEquipmentSummary = equipmentFields.Any(name => body.TryGetProperty(name, out _));
        if (hasEquipmentSummary && (shipmentMode != "Ftl" ||
            !RequiredUuid(body, equipmentFields[0]) || !RequiredUuid(body, equipmentFields[1]) ||
            body.GetProperty(equipmentFields[0]).GetString() != body.GetProperty(equipmentFields[1]).GetString() ||
            !RequiredText(body, equipmentFields[2]) ||
            body.GetProperty(equipmentFields[2]).GetString() is not ("24" or "26" or "48" or "53") ||
            !body.TryGetProperty(equipmentFields[3], out var summaryQuantity) ||
            summaryQuantity.ValueKind != JsonValueKind.Number || !summaryQuantity.TryGetInt32(out var summaryCount) ||
            summaryCount < 1))
            return false;

        bool full = shipmentMode is "Fcl" or "Ftl";
        var expectedEquipment = shipmentMode == "Fcl" ? "form_fclContainers" : "form_landContainers";
        if (full)
        {
            if (body.TryGetProperty("sellerContext_consolidatedCargoLines", out _) ||
                body.TryGetProperty("form_cargoPackages", out _) ||
                body.TryGetProperty(shipmentMode == "Fcl" ? "form_landContainers" : "form_fclContainers", out _) ||
                !body.TryGetProperty(expectedEquipment, out var equipment) ||
                equipment.ValueKind != JsonValueKind.Array ||
                equipment.GetArrayLength() is < 1 or > 25)
                return false;
            decimal sum = 0;
            int totalEquipment = 0;
            foreach (var line in equipment.EnumerateArray())
            {
                if (line.ValueKind != JsonValueKind.Object ||
                    line.EnumerateObject().Any(p => p.Name is not
                        ("containerTypeId" or "containerTypeName" or "containerTypeCode" or "quantity" or "unitWeightsKg")) ||
                    !RequiredUuid(line, "containerTypeId") ||
                    !RequiredText(line, "containerTypeName") ||
                    !RequiredText(line, "containerTypeCode") ||
                    !line.TryGetProperty("quantity", out var quantity) ||
                    quantity.ValueKind != JsonValueKind.Number ||
                    !quantity.TryGetInt32(out var count) || count is < 1 or > 100 ||
                    !line.TryGetProperty("unitWeightsKg", out var weights) ||
                    weights.ValueKind != JsonValueKind.Array || weights.GetArrayLength() != count)
                    return false;
                totalEquipment += count;
                if (hasEquipmentSummary &&
                    (line.GetProperty("containerTypeId").GetString() != body.GetProperty(equipmentFields[0]).GetString() ||
                     line.GetProperty("containerTypeCode").GetString()!.Split('_')[0] != body.GetProperty(equipmentFields[2]).GetString()))
                    return false;
                foreach (var weight in weights.EnumerateArray())
                {
                    if (!Positive(weight, out var kg)) return false;
                    sum += kg;
                }
            }
            return Math.Abs(sum - totalKg) <= 0.00001m &&
                (!hasEquipmentSummary || totalEquipment == body.GetProperty(equipmentFields[3]).GetInt32());
        }

        if (body.TryGetProperty("form_fclContainers", out _) ||
            body.TryGetProperty("form_landContainers", out _) ||
            !body.TryGetProperty("sellerContext_consolidatedCargoLines", out var cargo) ||
            cargo.ValueKind != JsonValueKind.Array || cargo.GetArrayLength() is < 1 or > 25 ||
            !body.TryGetProperty("form_cargoPackages", out var packages) ||
            packages.ValueKind != JsonValueKind.Number ||
            !packages.TryGetInt32(out var totalPackages) || totalPackages < 1)
            return false;
        decimal sumKg = 0;
        long sumPackages = 0;
        bool anyNonStackable = false;
        foreach (var line in cargo.EnumerateArray())
        {
            if (line.ValueKind != JsonValueKind.Object ||
                line.EnumerateObject().Any(p => p.Name is not
                    ("description" or "quantity" or "unitType" or "weightKg" or "length" or "width" or "height" or "isStackable")) ||
                !RequiredText(line, "description") ||
                !RequiredText(line, "unitType") ||
                line.GetProperty("unitType").GetString() is not ("Box" or "Pallet" or "Loose" or "Other") ||
                !line.TryGetProperty("quantity", out var qty) ||
                qty.ValueKind != JsonValueKind.Number ||
                !qty.TryGetInt32(out var count) || count is < 1 or > 10000 ||
                !line.TryGetProperty("weightKg", out var weight) || !Positive(weight, out var kg) ||
                !line.TryGetProperty("length", out var length) || !Positive(length, out _) ||
                !line.TryGetProperty("width", out var width) || !Positive(width, out _) ||
                !line.TryGetProperty("height", out var height) || !Positive(height, out _) ||
                !line.TryGetProperty("isStackable", out var stackability) ||
                stackability.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
                return false;
            sumPackages += count;
            sumKg += count * kg;
            anyNonStackable |= stackability.ValueKind == JsonValueKind.False;
        }
        if (hasDimensions &&
            (cargo.GetArrayLength() != 1 ||
             body.GetProperty(dimensionFields[0]).GetDecimal() != cargo[0].GetProperty("length").GetDecimal() ||
             body.GetProperty(dimensionFields[1]).GetDecimal() != cargo[0].GetProperty("width").GetDecimal() ||
             body.GetProperty(dimensionFields[2]).GetDecimal() != cargo[0].GetProperty("height").GetDecimal()))
            return false;
        if (sumPackages != totalPackages || Math.Abs(sumKg - totalKg) > 0.00001m)
            return false;
        return !body.TryGetProperty("form_nonStackable", out var aggregate) ||
            (aggregate.ValueKind == JsonValueKind.True) == anyNonStackable;
    }
}

/// <summary>Provider response candidate, not a verified remote creation.</summary>
public sealed record DholeQuotePostReceipt(DholeQuotePostOutcome Outcome, Guid? ProviderReferenceCandidate);

/// <summary>HTTP outcome only; no status implies independent confirmation.</summary>
public enum DholeQuotePostOutcome
{
    Disabled,
    NotConfigured,
    InvalidPayload,
    Rejected,
    Unconfirmed,
    HttpAcceptedUnverified
}
