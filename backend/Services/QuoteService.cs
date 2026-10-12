using CastroFallas.MiniQuote.Api.Data;
using CastroFallas.MiniQuote.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace CastroFallas.MiniQuote.Api.Services;

// Para el entorno local, PostgreSQL es la única fuente de datos.
// Redis y MongoDB no son necesarios para registrar y consultar cotizaciones.
public sealed class QuoteService(AppDbContext db, ILogger<QuoteService> logger)
{
    public async Task<QuoteRequest> CreateAsync(CreateQuoteRequest input, Guid clienteId, Guid usuarioId, CancellationToken ct)
    {
        Validate(input);
        var quote = new QuoteRequest
        {
            ClienteId = clienteId,
            UsuarioId = usuarioId,
            ServiceType = input.ServiceType.Trim(),
            Origin = input.Origin.Trim(),
            Destination = input.Destination.Trim(),
            CargoType = input.CargoType.Trim(),
            WeightKg = input.WeightKg,
            Pieces = input.Pieces,
            Notes = string.IsNullOrWhiteSpace(input.Notes) ? null : input.Notes.Trim()
        };
        db.QuoteRequests.Add(quote);
        await db.SaveChangesAsync(ct);
        logger.LogInformation("Cotización creada: {QuoteId}, cliente {ClienteId}", quote.Id, clienteId);
        return quote;
    }

    public async Task<(QuoteRequest? Quote, string Source)> GetAsync(Guid id, CancellationToken ct)
        => (await db.QuoteRequests.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct), "postgres");

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
    }
}
