namespace CastroFallas.MiniQuote.Api.Models;

// Una ubicación concreta y estable de la web. El borrador nunca se expone públicamente.
public sealed class SiteCmsSlot
{
    public string Key { get; set; } = "";
    public string? DraftEs { get; set; }
    public string? DraftEn { get; set; }
    public Guid? DraftMediaId { get; set; }
    public string? PublishedEs { get; set; }
    public string? PublishedEn { get; set; }
    public Guid? PublishedMediaId { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? PublishedAt { get; set; }
}

public sealed record SaveSiteDraftRequest(string? TextEs, string? TextEn, Guid? MediaId);
