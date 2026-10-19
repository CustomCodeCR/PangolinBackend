namespace CastroFallas.MiniQuote.Api.Models;

// Contrato público de GIO: POST /api/chat recibe message y history.
public sealed record ChatRequest(
    string? Message,
    IReadOnlyList<AssistantChatTurn>? History = null
);

// Contrato anterior conservado temporalmente para clientes existentes.
public sealed record AssistantChatTurn(string Role, string Content);

public sealed record AssistantChatRequest(
    string Question,
    string? Language = "es",
    IReadOnlyList<AssistantChatTurn>? History = null
);
