using System.Globalization;
using System.Text;

namespace CastroFallas.MiniQuote.Api.Services;

/// <summary>
/// Reproduce el slug histórico de Nuxt al publicar una noticia. Nunca se
/// recalcula tras editar el título ni la fecha; el CMS conserva Slug.
/// </summary>
public static class NewsPermalink
{
    public static string Create(string title, DateTime? publishedAt, Guid id)
    {
        var normalized = title.Normalize(NormalizationForm.FormD).ToLowerInvariant();
        var text = new StringBuilder(normalized.Length);
        foreach (var ch in normalized)
        {
            // Equivale al /[\\u0300-\\u036f]/g de la URL legada de Nuxt.
            if (ch is >= '\u0300' and <= '\u036f') continue;
            if (ch is >= 'a' and <= 'z' or >= '0' and <= '9') text.Append(ch);
            else if (text.Length > 0 && text[^1] != '-') text.Append('-');
        }
        var words = text.ToString().Trim('-');
        if (words.Length == 0) words = "noticia";
        var day = publishedAt?.ToUniversalTime().ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) ?? "sin-fecha";
        return day + "-" + words + "-" + id.ToString("N")[^8..];
    }
}
