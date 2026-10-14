using System.Globalization;
using System.Text.Json;
using CastroFallas.MiniQuote.Api.Data;
using CastroFallas.MiniQuote.Api.Models;
using Microsoft.EntityFrameworkCore;
using MongoDB.Bson;
using MongoDB.Driver;
using StackExchange.Redis;

namespace CastroFallas.MiniQuote.Api.Services;

// PostgreSQL es la fuente de verdad. Redis/Mongo son complementos opcionales:
// su caída NO afecta la autenticación ni el registro de cotizaciones.
public sealed class QuoteService(AppDbContext db, ILogger<QuoteService> logger, IServiceProvider services)
{
    public async Task<QuoteRequest> CreateAsync(CreateQuoteRequest input, Guid clienteId, Guid usuarioId, CancellationToken ct)
    {
        Validate(input);
        var quote = new QuoteRequest
        {
            ClienteId = clienteId,
            UsuarioId = usuarioId,
            ServiceType = input.ServiceType!.Trim(),
            Origin = input.Origin!.Trim(),
            Destination = input.Destination!.Trim(),
            CargoType = input.CargoType!.Trim(),
            WeightKg = input.WeightKg,
            Pieces = input.Pieces,
            Notes = string.IsNullOrWhiteSpace(input.Notes) ? null : input.Notes.Trim()
        };
        db.QuoteRequests.Add(quote);
        await db.SaveChangesAsync(ct);
        logger.LogInformation("Cotización creada: {QuoteId} para cliente {ClienteId}", quote.Id, clienteId);
        await TryCacheAsync(quote);
        await TryLogAsync(quote, ct);
        return quote;
    }

    public async Task<(QuoteRequest? Quote, string Source)> GetAsync(Guid id, CancellationToken ct)
    {
        var cache = services.GetService<IConnectionMultiplexer>();
        if (cache is not null)
        {
            try
            {
                var value = await cache.GetDatabase().StringGetAsync(CacheKey(id));
                if (value.HasValue)
                {
                    var quote = JsonSerializer.Deserialize<QuoteRequest>((string)value!);
                    if (quote is not null && quote.Id == id)
                        return (quote, "redis");
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "Cache Redis no disponible para {QuoteId}", id);
            }
        }
        var result = await db.QuoteRequests.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
        if (result is not null) await TryCacheAsync(result);
        return (result, "postgres");
    }

    private async Task TryCacheAsync(QuoteRequest quote)
    {
        try
        {
            var redis = services.GetService<IConnectionMultiplexer>();
            if (redis is null) return;
            await redis.GetDatabase().StringSetAsync(CacheKey(quote.Id),
                JsonSerializer.Serialize(quote), TimeSpan.FromMinutes(10));
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "No se pudo cachear la cotización {QuoteId} en Redis", quote.Id);
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
                    { "weightKg", quote.WeightKg.ToString(CultureInfo.InvariantCulture) },
                    { "pieces", quote.Pieces }
                }
            }, cancellationToken: ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "No se pudo registrar auditoría {QuoteId} en MongoDB", quote.Id);
        }
    }

    private static string CacheKey(Guid id) => $"quote:{id:N}";

    private static void Validate(CreateQuoteRequest input)
    {
        if (input.ServiceType is null ||
            !new[] { "Maritime", "Air", "Land" }.Contains(input.ServiceType, StringComparer.OrdinalIgnoreCase))
            throw new ArgumentException("ServiceType debe ser Maritime, Air o Land.");
        if (string.IsNullOrWhiteSpace(input.Origin)) throw new ArgumentException("El origen es obligatorio.");
        if (string.IsNullOrWhiteSpace(input.Destination)) throw new ArgumentException("El destino es obligatorio.");
        if (string.IsNullOrWhiteSpace(input.CargoType)) throw new ArgumentException("El tipo de carga es obligatorio.");
        if (input.WeightKg <= 0) throw new ArgumentException("El peso debe ser mayor que cero.");
        if (input.Pieces <= 0) throw new ArgumentException("La cantidad de piezas debe ser mayor que cero.");
        if (input.Notes is { Length: > 8000 }) throw new ArgumentException("Los detalles superan el máximo permitido (8000 caracteres).");
    }
}
