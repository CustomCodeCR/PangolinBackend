namespace CastroFallas.MiniQuote.Api.Models;

public sealed record CreateQuoteRequest(
    string? ServiceType = null,
    string? Origin = null,
    string? Destination = null,
    string? CargoType = null,
    decimal? WeightKg = null,
    int? Pieces = null,
    string? Notes = null,
    QuoteContactInput? Contact = null,
    QuoteLandInput? Land = null,
    QuoteAirInput? Air = null,
    QuoteMaritimeInput? Maritime = null,
    QuoteMultimodalInput? Multimodal = null);
