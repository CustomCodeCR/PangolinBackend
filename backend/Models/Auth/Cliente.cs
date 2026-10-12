namespace CastroFallas.MiniQuote.Api.Models.Auth;
public sealed class Cliente
{
    public Guid Uuid { get; set; } = Guid.NewGuid();
    public string Nombre { get; set; } = "";
    public string CodigoDynamics { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.SpecifyKind(DateTime.UtcNow, DateTimeKind.Unspecified);
    public DateTime UpdatedAt { get; set; } = DateTime.SpecifyKind(DateTime.UtcNow, DateTimeKind.Unspecified);
    public DateTime? DeletedAt { get; set; }
    public DateTime? LastLoginAt { get; set; }
    public bool Status { get; set; } = true;
    public ICollection<Usuario> Usuarios { get; set; } = new List<Usuario>();
}
