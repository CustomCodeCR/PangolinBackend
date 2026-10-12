namespace CastroFallas.MiniQuote.Api.Models.Auth;
public sealed class OtpChallenge
{
    public Guid Uuid { get; set; } = Guid.NewGuid();
    public Guid UsuarioId { get; set; }
    public string TipoAcceso { get; set; } = "cliente";
    public string OtpHash { get; set; } = "";
    public int Attempts { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAt { get; set; }
    public DateTime? UsedAt { get; set; }
    public Usuario Usuario { get; set; } = null!;
}
