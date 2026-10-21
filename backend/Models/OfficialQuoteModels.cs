namespace CastroFallas.MiniQuote.Api.Models;

// Solicitudes oficiales: independientes del cotizador V2 y de cualquier integración Dhole.
public sealed class OfficialQuoteRequest
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ClienteId { get; set; }
    public Guid UsuarioId { get; set; }
    public string CustomerName { get; set; } = "";
    public string ContactName { get; set; } = "";
    public string ContactEmail { get; set; } = "";
    public string ContactPhone { get; set; } = "";
    public string Mode { get; set; } = "";
    public string ShipmentType { get; set; } = "";
    public string OriginName { get; set; } = "";
    public string DestinationName { get; set; } = "";
    // JSONB conserva la captura sin convertir medidas/pesos ni calcular precios.
    public string FormJson { get; set; } = "{}";
    public string Status { get; set; } = "Received";
    public string Authorization { get; set; } = "Pending";
    public Guid? AuthorizedById { get; set; }
    public DateTime? AuthorizedAtUtc { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}
public sealed class OfficialQuoteLocation
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Kind { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public string? Code { get; set; }
    public bool Active { get; set; } = true;
}
public sealed class OfficialQuoteLocationUsage
{
    public Guid LocationId { get; set; }
    public string ShipmentType { get; set; } = "";
    public string RouteRole { get; set; } = "";
}
public sealed class OfficialQuotePermission
{
    public Guid UserId { get; set; }
    public bool CanView { get; set; }
    public bool CanManage { get; set; }
    public bool CanAuthorize { get; set; }
}
public sealed class OfficialQuoteAudit
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid QuoteId { get; set; }
    public Guid? ActorUserId { get; set; }
    public string Action { get; set; } = "";
    public string? Comment { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed record OfficialContainerInput(
    string? Size, string? Type, int? Quantity, List<decimal>? UnitWeightsKg);
public sealed record OfficialPackageInput(
    string? Description, int? Quantity, decimal? Weight,
    decimal? Length, decimal? Width, decimal? Height, string? Stackability);
public sealed record OfficialQuoteSubmit(
    string? Mode, string? ShipmentType,
    Guid? OriginLocationId, Guid? DestinationLocationId, Guid? PodLocationId,
    string? ContactName, string? ContactEmail, string? ContactPhone,
    string? Incoterm, DateOnly? CargoReadyDate, List<string>? Services,
    List<OfficialContainerInput>? Equipment, List<OfficialPackageInput>? Packages,
    string? DimensionUnit, string? WeightUnit,
    string? ExwCargoStatus, string? ExwPickupAddress,
    string? CargoDescription, string? CabysCode,
    decimal? CargoValue, decimal? DeclaredWeight, int? DeclaredPackages,
    string? Observations, List<string>? CargoFlags,
    string? DestinationHandling,
    string? DeliveryAddress = null, string? PickupAddress = null, int? FiscalStorageDays = null);
public sealed record OfficialReviewUpdate(string? Status, string? Comment);

