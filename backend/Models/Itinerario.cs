namespace CastroFallas.MiniQuote.Api.Models;

public sealed class Itinerario
{
    public Guid Id { get; set; }
    public string Pol { get; set; } = "";
    public string Pod { get; set; } = "";
    public DateOnly? Closing { get; set; }
    public DateOnly Etd { get; set; }
    public DateOnly Eta { get; set; }
    public string Status { get; set; } = "planning";
    public string Transporte { get; set; } = "maritime";
    public string Modalidad { get; set; } = "FCL";
    public string? Carrier { get; set; }
    public string? Vessel { get; set; }
    public string? Voyage { get; set; }
    public DateTime CreatedAt { get; set; }
}