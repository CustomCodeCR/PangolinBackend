using System.Globalization;
using System.Net.Mail;
using System.Text.Json;
using CastroFallas.MiniQuote.Api.Data;
using CastroFallas.MiniQuote.Api.Models;
using Microsoft.EntityFrameworkCore;
using MongoDB.Bson;
using MongoDB.Driver;
using StackExchange.Redis;

namespace CastroFallas.MiniQuote.Api.Services;

// PostgreSQL conserva el registro canónico y los cuatro detalles independientes.
// Redis mantiene solo una copia temporal de lectura y Mongo la auditoría opcional.
public sealed class QuoteService(AppDbContext db, ILogger<QuoteService> logger, IServiceProvider services)
{
    private static readonly string[] Services = ["Land", "Air", "Maritime", "Multimodal"];
    private static readonly string[] Incoterms = ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"];

    public async Task<QuoteResponse> CreateAsync(CreateQuoteRequest input, Guid clienteId, Guid usuarioId, CancellationToken ct)
    {
        var type = Required(input.ServiceType, "serviceType", 30);
        type = Services.FirstOrDefault(x => x.Equals(type, StringComparison.OrdinalIgnoreCase))
            ?? throw new ArgumentException("serviceType debe ser Land, Air, Maritime o Multimodal.");
        var origin = Required(input.Origin, "origin", 150);
        var destination = Required(input.Destination, "destination", 150);
        if (input.WeightKg is <= 0) throw new ArgumentException("weightKg debe ser mayor que cero si se proporciona.");
        if (input.Pieces is <= 0) throw new ArgumentException("pieces debe ser mayor que cero si se proporciona.");
        var notes = Optional(input.Notes, "notes", 8000);
        var detailCount = (input.Land is null ? 0 : 1) + (input.Air is null ? 0 : 1)
            + (input.Maritime is null ? 0 : 1) + (input.Multimodal is null ? 0 : 1);
        var legacy = input.Contact is null && detailCount == 0;
        if (!legacy && (input.Contact is null || detailCount != 1
            || (type == "Land" && input.Land is null)
            || (type == "Air" && input.Air is null)
            || (type == "Maritime" && input.Maritime is null)
            || (type == "Multimodal" && input.Multimodal is null)))
            throw new ArgumentException("contact y exactamente el detalle correspondiente a serviceType son obligatorios.");

        var quote = new QuoteRequest
        {
            ClienteId = clienteId, UsuarioId = usuarioId, ServiceType = type,
            Origin = origin, Destination = destination, WeightKg = input.WeightKg,
            Notes = notes, Status = "Received"
        };

        if (legacy)
        {
            // Compatibilidad temporal con las integraciones que todavía usan
            // el contrato anterior; nunca se reescriben las filas históricas.
            quote.CargoType = Required(input.CargoType, "cargoType", 100);
            if (input.WeightKg is null || input.Pieces is null)
                throw new ArgumentException("El contrato anterior exige weightKg y pieces positivos.");
            quote.Pieces = input.Pieces;
        }
        else
        {
            var contact = input.Contact!;
            var email = Required(contact.Email, "contact.email", 255);
            if (!MailAddress.TryCreate(email, out var parsed) || !parsed.Address.Equals(email, StringComparison.OrdinalIgnoreCase))
                throw new ArgumentException("contact.email no es válido.");
            quote.Contact = new QuoteContact
            {
                QuoteId = quote.Id,
                FullName = Required(contact.FullName, "contact.fullName", 150),
                Company = Required(contact.Company, "contact.company", 200),
                Email = email, Phone = Required(contact.Phone, "contact.phone", 40),
                Country = Optional(contact.Country, "contact.country", 100)
            };
            switch (type)
            {
                case "Land":
                    var land = input.Land!;
                    var kind = Required(land.TransportKind, "land.transportKind", 3).ToUpperInvariant();
                    if (kind is not ("FTL" or "LTL"))
                        throw new ArgumentException("land.transportKind debe ser FTL o LTL.");
                    quote.CargoType = $"Transporte terrestre {kind}";
                    quote.Land = new QuoteLandDetail
                    {
                        QuoteId = quote.Id, TransportKind = kind,
                        Equipment = Required(land.Equipment, "land.equipment", 100),
                        Insured = RequireBool(land.Insured, "land.insured"),
                        CustomerType = Required(land.CustomerType, "land.customerType", 30)
                    };
                    break;
                case "Air":
                    var air = input.Air!;
                    quote.Air = new QuoteAirDetail
                    {
                        QuoteId = quote.Id, Operation = Operation(air.Operation), Incoterm = Incoterm(air.Incoterm),
                        Nationalization = RequireBool(air.Nationalization, "air.nationalization"),
                        Description = Required(air.Description, "air.description", 4000),
                        EquipmentType = Required(air.EquipmentType, "air.equipmentType", 100),
                        Quantity = Quantity(air.Quantity, "air.quantity"),
                        DangerousGoods = air.DangerousGoods,
                        AdditionalDetails = Optional(air.AdditionalDetails, "air.additionalDetails", 4000)
                    };
                    quote.CargoType = Abbreviate(quote.Air.Description);
                    quote.Pieces = quote.Air.Quantity;
                    break;
                case "Maritime":
                    var sea = input.Maritime!;
                    var shippingType = Required(sea.ShippingType, "maritime.shippingType", 3).ToUpperInvariant();
                    if (shippingType is not ("FCL" or "LCL"))
                        throw new ArgumentException("maritime.shippingType debe ser FCL o LCL.");
                    quote.Maritime = new QuoteMaritimeDetail
                    {
                        QuoteId = quote.Id, Operation = Operation(sea.Operation), Incoterm = Incoterm(sea.Incoterm),
                        Nationalization = RequireBool(sea.Nationalization, "maritime.nationalization"),
                        ShippingType = shippingType,
                        Description = Required(sea.Description, "maritime.description", 4000),
                        ContainerType = Required(sea.ContainerType, "maritime.containerType", 100),
                        Quantity = Quantity(sea.Quantity, "maritime.quantity"),
                        DangerousGoods = sea.DangerousGoods,
                        AdditionalDetails = Optional(sea.AdditionalDetails, "maritime.additionalDetails", 4000)
                    };
                    quote.CargoType = Abbreviate(quote.Maritime.Description);
                    quote.Pieces = quote.Maritime.Quantity;
                    break;
                case "Multimodal":
                    var multi = input.Multimodal!;
                    quote.Multimodal = new QuoteMultimodalDetail
                    {
                        QuoteId = quote.Id, Operation = Operation(multi.Operation), Incoterm = Incoterm(multi.Incoterm),
                        Nationalization = RequireBool(multi.Nationalization, "multimodal.nationalization"),
                        EntryCountry = Required(multi.EntryCountry, "multimodal.entryCountry", 100),
                        Description = Required(multi.Description, "multimodal.description", 4000),
                        ContainerType = Required(multi.ContainerType, "multimodal.containerType", 100),
                        Quantity = Quantity(multi.Quantity, "multimodal.quantity"),
                        DangerousGoods = multi.DangerousGoods,
                        AdditionalDetails = Optional(multi.AdditionalDetails, "multimodal.additionalDetails", 4000)
                    };
                    quote.CargoType = Abbreviate(quote.Multimodal.Description);
                    quote.Pieces = quote.Multimodal.Quantity;
                    break;
            }
        }

        db.QuoteRequests.Add(quote);
        // EF inserta encabezado + contacto + un único detalle de forma atómica.
        await using (var transaction = await db.Database.BeginTransactionAsync(ct))
        {
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
        }
        logger.LogInformation("Cotización creada: {QuoteId} para cliente {ClienteId}", quote.Id, clienteId);
        var response = ToResponse(quote);
        // La primera lectura carga siempre los detalles confirmados de PostgreSQL.
        // Solo después del GET se almacena en Redis (lecturas posteriores).
        await TryLogAsync(quote, ct);
        return response;
    }

    public async Task<(QuoteResponse? Quote, string Source)> GetAsync(Guid id, CancellationToken ct)
    {
        var cache = services.GetService<IConnectionMultiplexer>();
        if (cache is not null)
        {
            try
            {
                var value = await cache.GetDatabase().StringGetAsync(CacheKey(id));
                if (value.HasValue)
                {
                    var cached = JsonSerializer.Deserialize<QuoteResponse>((string)value!);
                    if (cached is not null && cached.Id == id) return (cached, "redis");
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "Cache Redis no disponible para {QuoteId}", id);
            }
        }
        var quote = await db.QuoteRequests.AsNoTracking()
            .Include(q => q.Contact).Include(q => q.Land).Include(q => q.Air)
            .Include(q => q.Maritime).Include(q => q.Multimodal)
            .FirstOrDefaultAsync(q => q.Id == id, ct);
        if (quote is null) return (null, "postgres");
        var result = ToResponse(quote);
        await TryCacheAsync(result);
        return (result, "postgres");
    }

    private static QuoteResponse ToResponse(QuoteRequest q) => new(
        q.Id, q.ClienteId, q.UsuarioId, q.ServiceType, q.Origin, q.Destination,
        q.CargoType, q.WeightKg, q.Pieces, q.Notes, q.Status, q.CreatedAtUtc,
        q.Contact is { } c ? new QuoteContactInput(c.FullName, c.Company, c.Email, c.Phone, c.Country) : null,
        q.Land is { } l ? new QuoteLandInput(l.TransportKind, l.Equipment, l.Insured, l.CustomerType) : null,
        q.Air is { } a ? new QuoteAirInput(a.Operation, a.Incoterm, a.Nationalization, a.Description,
            a.EquipmentType, a.Quantity, a.DangerousGoods, a.AdditionalDetails) : null,
        q.Maritime is { } m ? new QuoteMaritimeInput(m.Operation, m.Incoterm, m.Nationalization, m.ShippingType,
            m.Description, m.ContainerType, m.Quantity, m.DangerousGoods, m.AdditionalDetails) : null,
        q.Multimodal is { } u ? new QuoteMultimodalInput(u.Operation, u.Incoterm, u.Nationalization, u.EntryCountry,
            u.Description, u.ContainerType, u.Quantity, u.DangerousGoods, u.AdditionalDetails) : null);

    private static string Required(string? value, string field, int max)
    {
        var result = value?.Trim();
        if (string.IsNullOrEmpty(result) || result.Length > max)
            throw new ArgumentException($"{field} es obligatorio y admite hasta {max} caracteres.");
        return result;
    }

    private static string? Optional(string? value, string field, int max)
    {
        var result = value?.Trim();
        if (result is { Length: > 0 } && result.Length > max)
            throw new ArgumentException($"{field} admite hasta {max} caracteres.");
        return string.IsNullOrEmpty(result) ? null : result;
    }

    private static string Operation(string? op)
    {
        var result = Required(op, "operation", 20);
        if (result is not ("Exportación" or "Importación"))
            throw new ArgumentException("operation debe ser Exportación o Importación.");
        return result;
    }

    private static string Incoterm(string? term)
    {
        var result = Required(term, "incoterm", 3).ToUpperInvariant();
        if (!Incoterms.Contains(result)) throw new ArgumentException("Incoterm no permitido.");
        return result;
    }

    private static bool RequireBool(bool? value, string field) => value
        ?? throw new ArgumentException($"{field} es obligatorio.");

    private static int Quantity(int? qty, string field)
    {
        if (qty is null or <= 0 or > 1000000)
            throw new ArgumentException($"{field} debe estar entre 1 y 1000000.");
        return qty.Value;
    }

    private static string Abbreviate(string description) => description[..Math.Min(description.Length, 100)];

    private static string CacheKey(Guid id) => $"quote:{id:N}";

    private async Task TryCacheAsync(QuoteResponse response)
    {
        try
        {
            var redis = services.GetService<IConnectionMultiplexer>();
            if (redis is null) return;
            await redis.GetDatabase().StringSetAsync(CacheKey(response.Id),
                JsonSerializer.Serialize(response), TimeSpan.FromMinutes(10));
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "No se pudo cachear la cotización {QuoteId} en Redis", response.Id);
        }
    }

    private async Task TryLogAsync(QuoteRequest quote, CancellationToken ct)
    {
        try
        {
            var mongo = services.GetService<IMongoDatabase>();
            if (mongo is null) return;
            await mongo.GetCollection<ActivityLog>("activity_logs").InsertOneAsync(new ActivityLog
            {
                Action = "QuoteCreated",
                QuoteId = quote.Id.ToString(),
                Data = new BsonDocument
                {
                    { "clientId", quote.ClienteId.ToString() },
                    { "serviceType", quote.ServiceType },
                    { "origin", quote.Origin },
                    { "destination", quote.Destination },
                    { "weightKg", quote.WeightKg?.ToString(CultureInfo.InvariantCulture) ?? "unknown" },
                    { "pieces", quote.Pieces ?? 0 }
                }
            }, cancellationToken: ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "No se pudo registrar auditoría {QuoteId} en MongoDB", quote.Id);
        }
    }
}
