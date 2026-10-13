using CastroFallas.MiniQuote.Api.Models;
using CastroFallas.MiniQuote.Api.Models.Auth;
using Microsoft.EntityFrameworkCore;

namespace CastroFallas.MiniQuote.Api.Data;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<QuoteRequest> QuoteRequests => Set<QuoteRequest>();
    public DbSet<Cliente> Clientes => Set<Cliente>();
    public DbSet<Usuario> Usuarios => Set<Usuario>();
    public DbSet<OtpChallenge> OtpChallenges => Set<OtpChallenge>();
    public DbSet<AuthSession> AuthSessions => Set<AuthSession>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var quote = modelBuilder.Entity<QuoteRequest>();
        quote.ToTable("quote_requests");
        quote.HasKey(x => x.Id);
        quote.Property(x => x.ServiceType).HasMaxLength(30).IsRequired();
        quote.Property(x => x.Origin).HasMaxLength(150).IsRequired();
        quote.Property(x => x.Destination).HasMaxLength(150).IsRequired();
        quote.Property(x => x.CargoType).HasMaxLength(100).IsRequired();
        quote.Property(x => x.WeightKg).HasPrecision(18, 2);
        quote.Property(x => x.Status).HasMaxLength(30).IsRequired();
        quote.Property(x => x.Notes).HasColumnType("text");

        var cliente = modelBuilder.Entity<Cliente>();
        cliente.ToTable("clientes");
        cliente.HasKey(x => x.Uuid);
        cliente.Property(x => x.Uuid).HasColumnName("uuid");
        cliente.Property(x => x.Nombre).HasColumnName("nombre").HasMaxLength(500).IsRequired();
        cliente.Property(x => x.CodigoDynamics).HasColumnName("codigo_dynamics").IsRequired();
        cliente.HasIndex(x => x.CodigoDynamics).IsUnique();
        cliente.Property(x => x.CreatedAt).HasColumnName("created_at").HasColumnType("timestamp without time zone");
        cliente.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasColumnType("timestamp without time zone");
        cliente.Property(x => x.DeletedAt).HasColumnName("deleted_at").HasColumnType("timestamp without time zone");
        cliente.Property(x => x.LastLoginAt).HasColumnName("last_login_at").HasColumnType("timestamp without time zone");
        cliente.Property(x => x.Status).HasColumnName("status");

        var usuario = modelBuilder.Entity<Usuario>();
        usuario.ToTable("usuarios");
        usuario.HasKey(x => x.Uuid);
        usuario.Property(x => x.Uuid).HasColumnName("uuid");
        usuario.Property(x => x.Correo).HasColumnName("correo").HasMaxLength(255).IsRequired();
        usuario.HasIndex(x => x.Correo).IsUnique();
        usuario.Property(x => x.CreatedAt).HasColumnName("created_at").HasColumnType("timestamp without time zone");
        usuario.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasColumnType("timestamp without time zone");
        usuario.Property(x => x.DeletedAt).HasColumnName("deleted_at").HasColumnType("timestamp without time zone");
        usuario.Property(x => x.LastLoginAt).HasColumnName("last_login_at").HasColumnType("timestamp without time zone");
        usuario.Property(x => x.Status).HasColumnName("status");
        usuario.Property(x => x.ClienteId).HasColumnName("cliente_id");
        usuario.Property(x => x.TipoAcceso).HasColumnName("tipo_acceso").HasMaxLength(20);
        usuario.HasOne(x => x.Cliente).WithMany(x => x.Usuarios)
            .HasForeignKey(x => x.ClienteId).OnDelete(DeleteBehavior.Cascade);

        var otp = modelBuilder.Entity<OtpChallenge>();
        otp.ToTable("otp_challenges");
        otp.HasKey(x => x.Uuid);
        otp.Property(x => x.Uuid).HasColumnName("uuid");
        otp.Property(x => x.UsuarioId).HasColumnName("usuario_id");
        otp.Property(x => x.TipoAcceso).HasColumnName("tipo_acceso");
        otp.Property(x => x.OtpHash).HasColumnName("otp_hash").HasMaxLength(64);
        otp.Property(x => x.Attempts).HasColumnName("attempts");
        otp.Property(x => x.CreatedAt).HasColumnName("created_at");
        otp.Property(x => x.ExpiresAt).HasColumnName("expires_at");
        otp.Property(x => x.UsedAt).HasColumnName("used_at");
        otp.HasOne(x => x.Usuario).WithMany().HasForeignKey(x => x.UsuarioId).OnDelete(DeleteBehavior.Cascade);

        var session = modelBuilder.Entity<AuthSession>();
        session.ToTable("auth_sessions");
        session.HasKey(x => x.Uuid);
        session.Property(x => x.Uuid).HasColumnName("uuid");
        session.Property(x => x.UsuarioId).HasColumnName("usuario_id");
        session.Property(x => x.TokenHash).HasColumnName("token_hash").HasMaxLength(64);
        session.HasIndex(x => x.TokenHash).IsUnique();
        session.Property(x => x.TipoAcceso).HasColumnName("tipo_acceso");
        session.Property(x => x.CreatedAt).HasColumnName("created_at");
        session.Property(x => x.ExpiresAt).HasColumnName("expires_at");
        session.Property(x => x.RevokedAt).HasColumnName("revoked_at");
        session.HasOne(x => x.Usuario).WithMany().HasForeignKey(x => x.UsuarioId).OnDelete(DeleteBehavior.Cascade);
    }
}
