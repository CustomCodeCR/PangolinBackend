namespace CastroFallas.MiniQuote.Api.Models;

public sealed class QuoteRequest
{
    public Guid? ClienteId { get; set; }
    public Guid? UsuarioId { get; set; }
    public Guid Id { get; set; } = Guid.NewGuid();
    public string ServiceType { get; set; } = string.Empty;
    public string Origin { get; set; } = string.Empty;
    public string Destination { get; set; } = string.Empty;
    public string CargoType { get; set; } = string.Empty;
    public decimal WeightKg { get; set; }
    public int Pieces { get; set; }
    public string? Notes { get; set; }
    public string Status { get; set; } = "Received";
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
