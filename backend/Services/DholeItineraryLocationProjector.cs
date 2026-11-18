namespace CastroFallas.MiniQuote.Api.Services;

// The itinerary search uses strings (POL and POD) rather than quote UUIDs.
// Itinerary destination is POD, NOT the POE field used in official quotes.
// Preserve this contract so published/historical itineraries are not changed.
public static class DholeItineraryLocationProjector
{
    public static string[] Project(
        string transport, string routeRole,
        IReadOnlyList<DholeCatalogItem> pol,
        IReadOnlyList<DholeCatalogItem> pod)
    {
        if (transport is not ("all" or "maritime" or "ground") ||
            routeRole is not ("origin" or "destination"))
            throw new ArgumentException("Invalid itinerary location filters.");

        IEnumerable<string> candidates;
        if (routeRole == "destination")
        {
            // Business rule: all active POD locations, regardless of mode.
            candidates = DholeQuoteLocationProjector.Project("pod", "Maritime", pod)
                .Options.Select(x => x.Name);
        }
        else
        {
            var names = new List<string>();
            if (transport is "all" or "maritime")
                names.AddRange(DholeQuoteLocationProjector.Project("origin", "Maritime", pol)
                    .Options.Select(x => x.Name));
            if (transport is "all" or "ground")
                names.AddRange(DholeQuoteLocationProjector.Project("origin", "Land", pol)
                    .Options.Select(x => x.Name));
            candidates = names;
        }

        // The existing itinerary UI stores/filters by name. Deduplicate by
        // display text here only; never deduplicate or rewrite Dhole UUIDs in quotes.
        return candidates
            .Select(name => name.Trim())
            .Where(name => name.Length is > 0 and <= 300)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(name => name, StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }
}
