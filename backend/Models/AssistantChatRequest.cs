namespace CastroFallas.MiniQuote.Api.Models;

public sealed record AssistantChatTurn(string Role, string Content);

public sealed record AssistantChatRequest(
    string Question,
    string? Language = "es",
    IReadOnlyList<AssistantChatTurn>? History = null
);
