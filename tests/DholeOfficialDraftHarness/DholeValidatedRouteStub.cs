// Test-only stub for the value returned by the production Dhole route validator.
namespace CastroFallas.MiniQuote.Api.Services;
public sealed record DholeValidatedRoute(string OriginName, string DestinationName, string? PodName);
