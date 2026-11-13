namespace CastroFallas.MiniQuote.Api.Services;

// Media bytes stored by the upload endpoint are immutable under a unique UUID.
// Public media can be stored in a browser cache but must be validated on EVERY
// request because removing a CMS publication must immediately revoke access.
internal static class MediaHttpCachePolicy
{
    internal const string PublishedMedia = "private, no-cache, must-revalidate";
    internal const string NoStore = "private, no-store";

    internal static string EntityTag(Guid mediaId, long? bytes) =>
        $"\"cms-{mediaId:N}-{bytes.GetValueOrDefault()}\"";

    internal static bool IsNotModified(string? ifNoneMatch, string? range, string entityTag)
    {
        // Conditional responses may not short-circuit byte-range downloads.
        if (!string.IsNullOrWhiteSpace(range) || string.IsNullOrWhiteSpace(ifNoneMatch))
            return false;

        foreach (var candidate in ifNoneMatch.Split(','))
        {
            var token = candidate.Trim();
            if (token == "*") return true;
            // If-None-Match uses weak comparison for safe GET revalidation.
            if (token.StartsWith("W/", StringComparison.OrdinalIgnoreCase))
                token = token[2..].TrimStart();
            if (string.Equals(token, entityTag, StringComparison.Ordinal))
                return true;
        }
        return false;
    }
}
