namespace CastroFallas.MiniQuote.Api.Models.Auth;
public sealed class AuthSession
{
    public Guid Uuid { get; set; } = Guid.NewGuid();
    public Guid UsuarioId { get; set; }
    public string TokenHash { get; set; } = "";
    public string TipoAcceso { get; set; } = "cliente";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAt { get; set; }
    public DateTime? RevokedAt { get; set; }
    public Usuario Usuario { get; set; } = null!;
}
