namespace CastroFallas.MiniQuote.Api.Models;

public sealed record CreateQuoteRequest(
    string ServiceType,
    string Origin,
    string Destination,
    string CargoType,
    decimal WeightKg,
    int Pieces,
    string? Notes
);
