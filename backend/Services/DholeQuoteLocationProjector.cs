namespace CastroFallas.MiniQuote.Api.Services;

// This projection is intentionally NOT wired to official quote submissions.
// OfficialQuoteLocation.Id is a LOCAL identifier, whereas ExternalId is Dhole's UUID.
// Only a future explicitly verified mapping may link them.
public sealed record DholeQuoteLocationOption(
    string Catalog, string ExternalId, string Name, string Code,
    string Mode, string Role, string? TerminalType);

public sealed record DholeQuoteLocationIssue(
    string Catalog, string ExternalId, string Reason);

public sealed record DholeQuoteLocationProjection(
    DholeQuoteLocationOption[] Options,
    DholeQuoteLocationIssue[] Issues);

public static class DholeQuoteLocationProjector
{
    public static string CatalogForRole(string role) => role switch
    {
        "origin" => "pol",
        "destination" => "poe",
        "pod" => "pod",
        _ => throw new ArgumentException("Invalid location role.", nameof(role))
    };

    public static DholeQuoteLocationProjection Project(
        string role, string mode, IReadOnlyList<DholeCatalogItem> records)
    {
        var catalog = CatalogForRole(role);
        if (mode is not ("Maritime" or "Air" or "Land") ||
            (role == "pod" && mode != "Maritime"))
            throw new ArgumentException("Invalid mode and role.");

        var options = new List<DholeQuoteLocationOption>();
        var issues = new List<DholeQuoteLocationIssue>();
        var expectedRole = catalog.ToUpperInvariant();

        foreach (var item in records)
        {
            // Defensive check even though the normalizer already drops explicit false.
            if (item.IsActive == false) continue;

            // The endpoint establishes the role when the field is missing.
            // An explicitly conflicting role is NOT silently overwritten.
            if (!string.IsNullOrWhiteSpace(item.RouteRole) &&
                !string.Equals(item.RouteRole, expectedRole, StringComparison.OrdinalIgnoreCase))
            {
                issues.Add(new(catalog, item.Id, "conflicting_route_role"));
                continue;
            }

            // The business explicitly said POD does not filter on transportMode or terminalType.
            if (role == "pod")
            {
                options.Add(new(catalog, item.Id, item.Name, item.Code, mode, role, item.TerminalType));
                continue;
            }

            if (string.IsNullOrWhiteSpace(item.TransportMode) ||
                string.IsNullOrWhiteSpace(item.TerminalType))
            {
                issues.Add(new(catalog, item.Id, "missing_mode_or_terminal"));
                continue;
            }

            // Filtering for POE is confirmed; for POL it remains provisional
            // until final functional review. Do not expose to the live wizard yet.
            if (!string.Equals(item.TransportMode, mode, StringComparison.OrdinalIgnoreCase))
                continue;

            if (!IsObservedCombination(catalog, mode, item.TerminalType))
            {
                issues.Add(new(catalog, item.Id, "unreviewed_mode_terminal_combination"));
                continue;
            }

            options.Add(new(catalog, item.Id, item.Name, item.Code, mode, role, item.TerminalType));
        }

        // Preserve distinct UUIDs even when names are identical. Stable sorting.
        return new(
            options.OrderBy(x => x.Name, StringComparer.OrdinalIgnoreCase)
                .ThenBy(x => x.ExternalId, StringComparer.Ordinal).ToArray(),
            issues.OrderBy(x => x.ExternalId, StringComparer.Ordinal).ToArray());
    }

    private static bool IsObservedCombination(string catalog, string mode, string terminal) =>
        (mode, terminal.ToUpperInvariant()) switch
        {
            ("Air", "APT") => true,
            ("Land", "SD") => true,
            ("Maritime", "CY") => true,
            // Moin, Costa Rica in the POL feed was corrected to POL/Maritime/SD.
            // Do not assume the same exception applies to POE.
            ("Maritime", "SD") when catalog == "pol" => true,
            _ => false
        };
}
