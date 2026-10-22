namespace CastroFallas.MiniQuote.Api.Models;

// Datos demostrativos sin información real de clientes.
public sealed class TrackingDemoShipment
{
    public Guid Id { get; set; }
    public string ReferenceType { get; set; } = "";
    public string ReferenceCode { get; set; } = "";
    public string OriginName { get; set; } = "";
    public double OriginLat { get; set; }
    public double OriginLon { get; set; }
    public string DestinationName { get; set; } = "";
    public double DestinationLat { get; set; }
    public double DestinationLon { get; set; }
    public string Status { get; set; } = "";
    public short ProgressPercent { get; set; }
    public DateOnly Etd { get; set; }
    public DateOnly Eta { get; set; }
    public DateTime UpdatedAtUtc { get; set; }
    public bool IsDemo { get; set; }
}
