using CastroFallas.MiniQuote.Api.Data;
using CastroFallas.MiniQuote.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace CastroFallas.MiniQuote.Api.Services;

// El frontend recibe JSON camelCase (transport/modality) sin exponer nombres de columnas.
public sealed record UpsertItinerarioRequest(
    string? Pol,
    string? Pod,
    DateOnly? Closing,
    DateOnly? Etd,
    DateOnly? Eta,
    string? Status,
    string? Transport,
    string? Modality,
    string? Carrier,
    string? Vessel,
    string? Voyage);

public sealed record ItinerarioResponse(
    Guid Id,
    string Pol,
    string Pod,
    DateOnly? Closing,
    DateOnly Etd,
    DateOnly Eta,
    string Status,
    string Transport,
    string Modality,
    string? Carrier,
    string? Vessel,
    string? Voyage,
    DateTime CreatedAt);

public static class ItinerariosCrudEndpoints
{
    public static void MapItinerariosCrud(this IEndpointRouteBuilder app)
    {
        // La consulta individual, igual que el listado existente, admite client y admin.
        app.MapGet("/api/itinerarios/{id:guid}", async (
            Guid id, AppDbContext db, HttpContext http, CancellationToken ct) =>
        {
            http.Response.Headers.CacheControl = "no-store";
            var item = await db.Itinerarios.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
            return item is null
                ? Results.NotFound(new { error = "Itinerario no encontrado." })
                : Results.Ok(ToResponse(item));
        }).RequireAuthorization("registered");

        // Todos los cambios requieren JWT con role=admin, además de la sesión
        // revocable comprobada por JwtBearer/OnTokenValidated.
        var admin = app.MapGroup("/api/admin/itinerarios").RequireAuthorization("admin");

        admin.MapPost("", async (
            UpsertItinerarioRequest input, AppDbContext db, RealtimeNotifier realtime, HttpContext http, CancellationToken ct) =>
        {
            http.Response.Headers.CacheControl = "no-store";
            var item = new Itinerario { Id = Guid.NewGuid() };
            var errors = ValidateAndApply(input, item);
            if (errors.Count > 0) return Results.ValidationProblem(errors);

            db.Itinerarios.Add(item);
            await db.SaveChangesAsync(ct);
            await realtime.ItinerariesChangedAsync();
            return Results.Created($"/api/itinerarios/{item.Id}", ToResponse(item));
        });

        // PUT reemplaza los campos editables; id y createdAt siempre son inmutables.
        admin.MapPut("/{id:guid}", async (
            Guid id, UpsertItinerarioRequest input, AppDbContext db, RealtimeNotifier realtime,
            HttpContext http, CancellationToken ct) =>
        {
            http.Response.Headers.CacheControl = "no-store";
            var item = await db.Itinerarios.FirstOrDefaultAsync(x => x.Id == id, ct);
            if (item is null) return Results.NotFound(new { error = "Itinerario no encontrado." });

            var errors = ValidateAndApply(input, item);
            if (errors.Count > 0) return Results.ValidationProblem(errors);

            try
            {
                await db.SaveChangesAsync(ct);
            }
            catch (DbUpdateConcurrencyException)
            {
                return Results.Conflict(new { error = "El itinerario cambió o fue eliminado. Volvé a cargarlo." });
            }
            await realtime.ItinerariesChangedAsync();
            return Results.Ok(ToResponse(item));
        });

        admin.MapDelete("/{id:guid}", async (
            Guid id, AppDbContext db, RealtimeNotifier realtime, HttpContext http, CancellationToken ct) =>
        {
            http.Response.Headers.CacheControl = "no-store";
            var item = await db.Itinerarios.FirstOrDefaultAsync(x => x.Id == id, ct);
            if (item is null) return Results.NotFound(new { error = "Itinerario no encontrado." });

            db.Itinerarios.Remove(item);
            try
            {
                await db.SaveChangesAsync(ct);
            }
            catch (DbUpdateConcurrencyException)
            {
                return Results.Conflict(new { error = "El itinerario cambió o fue eliminado. Volvé a cargarlo." });
            }
            await realtime.ItinerariesChangedAsync();
            return Results.NoContent();
        });
    }

    private static ItinerarioResponse ToResponse(Itinerario item) => new(
        item.Id, item.Pol, item.Pod, item.Closing, item.Etd, item.Eta,
        item.Status, item.Transporte, item.Modalidad,
        item.Carrier, item.Vessel, item.Voyage, item.CreatedAt);

    private static Dictionary<string, string[]> ValidateAndApply(
        UpsertItinerarioRequest input, Itinerario item)
    {
        var errors = new Dictionary<string, string[]>();
        var pol = (input.Pol ?? "").Trim();
        var pod = (input.Pod ?? "").Trim();
        var status = (input.Status ?? "").Trim().ToLowerInvariant();
        var transport = (input.Transport ?? "").Trim().ToLowerInvariant();
        var modality = (input.Modality ?? "").Trim().ToUpperInvariant();
        var carrier = NormalizeOptional(input.Carrier);
        var vessel = NormalizeOptional(input.Vessel);
        var voyage = NormalizeOptional(input.Voyage);

        if (pol.Length is < 1 or > 150)
            errors["pol"] = ["POL es obligatorio y no puede superar 150 caracteres."];
        if (pod.Length is < 1 or > 150)
            errors["pod"] = ["POD es obligatorio y no puede superar 150 caracteres."];
        if (status is not ("planning" or "transit" or "delivered" or "delayed"))
            errors["status"] = ["Valores permitidos: planning, transit, delivered, delayed."];
        if (transport is not ("maritime" or "ground"))
            errors["transport"] = ["Valores permitidos: maritime, ground."];
        if (transport == "maritime" && modality is not ("FCL" or "LCL") ||
            transport == "ground" && modality != "LTL")
            errors["modality"] = ["Marítimo admite FCL/LCL; terrestre admite LTL."];
        if (input.Etd is null)
            errors["etd"] = ["ETD es obligatorio (YYYY-MM-DD)."];
        if (input.Eta is null)
            errors["eta"] = ["ETA es obligatorio (YYYY-MM-DD)."];
        if (input.Etd.HasValue && input.Eta.HasValue && input.Eta.Value < input.Etd.Value)
            errors["eta"] = ["ETA no puede ser anterior a ETD."];
        if (input.Closing.HasValue && input.Etd.HasValue && input.Closing.Value > input.Etd.Value)
            errors["closing"] = ["Closing no puede ser posterior a ETD."];
        if (carrier is { Length: > 150 })
            errors["carrier"] = ["Carrier no puede superar 150 caracteres."];
        if (vessel is { Length: > 150 })
            errors["vessel"] = ["Vessel no puede superar 150 caracteres."];
        if (voyage is { Length: > 50 })
            errors["voyage"] = ["Voyage no puede superar 50 caracteres."];

        if (errors.Count > 0) return errors;

        item.Pol = pol;
        item.Pod = pod;
        item.Closing = input.Closing;
        item.Etd = input.Etd!.Value;
        item.Eta = input.Eta!.Value;
        item.Status = status;
        item.Transporte = transport;
        item.Modalidad = modality;
        item.Carrier = carrier;
        item.Vessel = vessel;
        item.Voyage = voyage;
        return errors;
    }

    private static string? NormalizeOptional(string? value)
    {
        var normalized = value?.Trim();
        return string.IsNullOrEmpty(normalized) ? null : normalized;
    }
}
