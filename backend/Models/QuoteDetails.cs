namespace CastroFallas.MiniQuote.Api.Models;

// Los cuatro formularios tienen contratos independientes. Los detalles solo
// existen para solicitudes nuevas; las cotizaciones históricas quedan legibles.
public sealed record QuoteContactInput(string? FullName, string? Company, string? Email, string? Phone, string? Country);
public sealed record QuoteLandInput(string? TransportKind, string? Equipment, bool? Insured, string? CustomerType);
public sealed record QuoteAirInput(string? Operation, string? Incoterm, bool? Nationalization, string? Description,
    string? EquipmentType, int? Quantity, bool? DangerousGoods, string? AdditionalDetails);
public sealed record QuoteMaritimeInput(string? Operation, string? Incoterm, bool? Nationalization, string? ShippingType,
    string? Description, string? ContainerType, int? Quantity, bool? DangerousGoods, string? AdditionalDetails);
public sealed record QuoteMultimodalInput(string? Operation, string? Incoterm, bool? Nationalization, string? EntryCountry,
    string? Description, string? ContainerType, int? Quantity, bool? DangerousGoods, string? AdditionalDetails);

public sealed class QuoteContact
{
    public Guid QuoteId { get; set; }
    public string FullName { get; set; } = "";
    public string Company { get; set; } = "";
    public string Email { get; set; } = "";
    public string Phone { get; set; } = "";
    public string? Country { get; set; }
}
public sealed class QuoteLandDetail
{
    public Guid QuoteId { get; set; }
    public string TransportKind { get; set; } = "";
    public string Equipment { get; set; } = "";
    public bool Insured { get; set; }
    public string CustomerType { get; set; } = "";
}
public sealed class QuoteAirDetail
{
    public Guid QuoteId { get; set; }
    public string Operation { get; set; } = "";
    public string Incoterm { get; set; } = "";
    public bool Nationalization { get; set; }
    public string Description { get; set; } = "";
    public string EquipmentType { get; set; } = "";
    public int Quantity { get; set; }
    public bool? DangerousGoods { get; set; }
    public string? AdditionalDetails { get; set; }
}
public sealed class QuoteMaritimeDetail
{
    public Guid QuoteId { get; set; }
    public string Operation { get; set; } = "";
    public string Incoterm { get; set; } = "";
    public bool Nationalization { get; set; }
    public string ShippingType { get; set; } = "";
    public string Description { get; set; } = "";
    public string ContainerType { get; set; } = "";
    public int Quantity { get; set; }
    public bool? DangerousGoods { get; set; }
    public string? AdditionalDetails { get; set; }
}
public sealed class QuoteMultimodalDetail
{
    public Guid QuoteId { get; set; }
    public string Operation { get; set; } = "";
    public string Incoterm { get; set; } = "";
    public bool Nationalization { get; set; }
    public string EntryCountry { get; set; } = "";
    public string Description { get; set; } = "";
    public string ContainerType { get; set; } = "";
    public int Quantity { get; set; }
    public bool? DangerousGoods { get; set; }
    public string? AdditionalDetails { get; set; }
}

// DTO público: nunca expone propiedades de navegación ni crea ciclos JSON.
public sealed record QuoteResponse(
    Guid Id, Guid? ClienteId, Guid? UsuarioId, string ServiceType, string Origin,
    string Destination, string CargoType, decimal? WeightKg, int? Pieces,
    string? Notes, string Status, DateTime CreatedAtUtc,
    QuoteContactInput? Contact, QuoteLandInput? Land, QuoteAirInput? Air,
    QuoteMaritimeInput? Maritime, QuoteMultimodalInput? Multimodal);
