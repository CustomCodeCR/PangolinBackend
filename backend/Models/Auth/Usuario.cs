namespace CastroFallas.MiniQuote.Api.Models.Auth;
public sealed class Usuario
{
    public Guid Uuid { get; set; } = Guid.NewGuid();
    public string Correo { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.SpecifyKind(DateTime.UtcNow, DateTimeKind.Unspecified);
    public DateTime UpdatedAt { get; set; } = DateTime.SpecifyKind(DateTime.UtcNow, DateTimeKind.Unspecified);
    public DateTime? DeletedAt { get; set; }
    public DateTime? LastLoginAt { get; set; }
    public bool Status { get; set; } = true;
    public Guid ClienteId { get; set; }
    public string TipoAcceso { get; set; } = "usuario";
    public Cliente Cliente { get; set; } = null!;
}
