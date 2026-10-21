namespace CastroFallas.MiniQuote.Api.Models;

// Solo datos operativos aprobados para consulta pública. Nunca almacenar aquí
// nombres de clientes, facturas, documentos privados ni datos de contacto.
public sealed class ShipmentTracking
{
    public Guid Id { get; set; }
    public string ReferenceKind { get; set; } = "";
    public string ReferenceNormalized { get; set; } = "";
    public string Status { get; set; } = "";
    public string Origin { get; set; } = "";
    public string Destination { get; set; } = "";
    public DateOnly? Eta { get; set; }
    public bool IsPublic { get; set; }
    public bool IsDemo { get; set; }
    public string Source { get; set; } = "manual";
    public DateTime UpdatedAtUtc { get; set; }
}

public sealed class ShipmentTrackingEvent
{
    public Guid Id { get; set; }
    public Guid TrackingId { get; set; }
    public DateTime EventAtUtc { get; set; }
    public string Status { get; set; } = "";
    public string Location { get; set; } = "";
    public string Description { get; set; } = "";
}
