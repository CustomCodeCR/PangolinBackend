using CastroFallas.MiniQuote.Api.Models;
using CastroFallas.MiniQuote.Api.Models.Auth;
using Microsoft.EntityFrameworkCore;

namespace CastroFallas.MiniQuote.Api.Data;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<QuoteRequest> QuoteRequests => Set<QuoteRequest>();
    public DbSet<ManagedNews> ManagedNews => Set<ManagedNews>();
    public DbSet<ManagedMedia> ManagedMedia => Set<ManagedMedia>();
    public DbSet<QuoteContact> QuoteContacts => Set<QuoteContact>();
    public DbSet<QuoteLandDetail> QuoteLandDetails => Set<QuoteLandDetail>();
    public DbSet<QuoteAirDetail> QuoteAirDetails => Set<QuoteAirDetail>();
    public DbSet<QuoteMaritimeDetail> QuoteMaritimeDetails => Set<QuoteMaritimeDetail>();
    public DbSet<QuoteMultimodalDetail> QuoteMultimodalDetails => Set<QuoteMultimodalDetail>();
    public DbSet<Cliente> Clientes => Set<Cliente>();
    public DbSet<Usuario> Usuarios => Set<Usuario>();
    public DbSet<OtpChallenge> OtpChallenges => Set<OtpChallenge>();
    public DbSet<AuthSession> AuthSessions => Set<AuthSession>();
    public DbSet<Itinerario> Itinerarios => Set<Itinerario>();

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

        var contact = modelBuilder.Entity<QuoteContact>();
        contact.ToTable("quote_contacts");
        contact.HasKey(x => x.QuoteId);
        contact.Property(x => x.QuoteId).HasColumnName("quote_id");
        contact.Property(x => x.FullName).HasColumnName("full_name").HasMaxLength(150);
        contact.Property(x => x.Company).HasColumnName("company").HasMaxLength(200);
        contact.Property(x => x.Email).HasColumnName("email").HasMaxLength(255);
        contact.Property(x => x.Phone).HasColumnName("phone").HasMaxLength(40);
        contact.Property(x => x.Country).HasColumnName("country").HasMaxLength(100);
        quote.HasOne(x => x.Contact).WithOne().HasForeignKey<QuoteContact>(x => x.QuoteId)
            .OnDelete(DeleteBehavior.Cascade);

        var land = modelBuilder.Entity<QuoteLandDetail>();
        land.ToTable("quote_land_details");
        land.HasKey(x => x.QuoteId);
        land.Property(x => x.QuoteId).HasColumnName("quote_id");
        land.Property(x => x.TransportKind).HasColumnName("transport_kind").HasMaxLength(3);
        land.Property(x => x.Equipment).HasColumnName("equipment").HasMaxLength(100);
        land.Property(x => x.Insured).HasColumnName("insured");
        land.Property(x => x.CustomerType).HasColumnName("customer_type").HasMaxLength(30);
        quote.HasOne(x => x.Land).WithOne().HasForeignKey<QuoteLandDetail>(x => x.QuoteId)
            .OnDelete(DeleteBehavior.Cascade);

        var air = modelBuilder.Entity<QuoteAirDetail>();
        air.ToTable("quote_air_details");
        air.HasKey(x => x.QuoteId);
        air.Property(x => x.QuoteId).HasColumnName("quote_id");
        air.Property(x => x.Operation).HasColumnName("operation").HasMaxLength(20);
        air.Property(x => x.Incoterm).HasColumnName("incoterm").HasMaxLength(3);
        air.Property(x => x.Nationalization).HasColumnName("nationalization");
        air.Property(x => x.Description).HasColumnName("description");
        air.Property(x => x.EquipmentType).HasColumnName("equipment_type").HasMaxLength(100);
        air.Property(x => x.Quantity).HasColumnName("quantity");
        air.Property(x => x.DangerousGoods).HasColumnName("dangerous_goods");
        air.Property(x => x.AdditionalDetails).HasColumnName("additional_details");
        quote.HasOne(x => x.Air).WithOne().HasForeignKey<QuoteAirDetail>(x => x.QuoteId)
            .OnDelete(DeleteBehavior.Cascade);

        var maritime = modelBuilder.Entity<QuoteMaritimeDetail>();
        maritime.ToTable("quote_maritime_details");
        maritime.HasKey(x => x.QuoteId);
        maritime.Property(x => x.QuoteId).HasColumnName("quote_id");
        maritime.Property(x => x.Operation).HasColumnName("operation").HasMaxLength(20);
        maritime.Property(x => x.Incoterm).HasColumnName("incoterm").HasMaxLength(3);
        maritime.Property(x => x.Nationalization).HasColumnName("nationalization");
        maritime.Property(x => x.ShippingType).HasColumnName("shipping_type").HasMaxLength(3);
        maritime.Property(x => x.Description).HasColumnName("description");
        maritime.Property(x => x.ContainerType).HasColumnName("container_type").HasMaxLength(100);
        maritime.Property(x => x.Quantity).HasColumnName("quantity");
        maritime.Property(x => x.DangerousGoods).HasColumnName("dangerous_goods");
        maritime.Property(x => x.AdditionalDetails).HasColumnName("additional_details");
        quote.HasOne(x => x.Maritime).WithOne().HasForeignKey<QuoteMaritimeDetail>(x => x.QuoteId)
            .OnDelete(DeleteBehavior.Cascade);

        var multimodal = modelBuilder.Entity<QuoteMultimodalDetail>();
        multimodal.ToTable("quote_multimodal_details");
        multimodal.HasKey(x => x.QuoteId);
        multimodal.Property(x => x.QuoteId).HasColumnName("quote_id");
        multimodal.Property(x => x.Operation).HasColumnName("operation").HasMaxLength(20);
        multimodal.Property(x => x.Incoterm).HasColumnName("incoterm").HasMaxLength(3);
        multimodal.Property(x => x.Nationalization).HasColumnName("nationalization");
        multimodal.Property(x => x.EntryCountry).HasColumnName("entry_country").HasMaxLength(100);
        multimodal.Property(x => x.Description).HasColumnName("description");
        multimodal.Property(x => x.ContainerType).HasColumnName("container_type").HasMaxLength(100);
        multimodal.Property(x => x.Quantity).HasColumnName("quantity");
        multimodal.Property(x => x.DangerousGoods).HasColumnName("dangerous_goods");
        multimodal.Property(x => x.AdditionalDetails).HasColumnName("additional_details");
        quote.HasOne(x => x.Multimodal).WithOne().HasForeignKey<QuoteMultimodalDetail>(x => x.QuoteId)
            .OnDelete(DeleteBehavior.Cascade);

        var news = modelBuilder.Entity<ManagedNews>();
        news.ToTable("cms_news", "public");
        news.HasKey(x => x.Id);
        news.Property(x => x.Id).HasColumnName("id");
        news.Property(x => x.Title).HasColumnName("title").HasMaxLength(160).IsRequired();
        news.Property(x => x.Category).HasColumnName("category").HasMaxLength(60).IsRequired();
        news.Property(x => x.Description).HasColumnName("description").HasMaxLength(1200).IsRequired();
        news.Property(x => x.Image).HasColumnName("image").HasColumnType("text").IsRequired();
        news.Property(x => x.Published).HasColumnName("published");
        news.Property(x => x.CreatedAt).HasColumnName("created_at").HasColumnType("timestamp with time zone");
        news.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasColumnType("timestamp with time zone");

        var media = modelBuilder.Entity<ManagedMedia>();
        media.ToTable("cms_media", "public");
        media.HasKey(x => x.Id);
        media.Property(x => x.Id).HasColumnName("id");
        media.Property(x => x.Name).HasColumnName("name").HasMaxLength(200).IsRequired();
        media.Property(x => x.Kind).HasColumnName("kind").HasMaxLength(30).IsRequired();
        media.Property(x => x.Src).HasColumnName("src").HasColumnType("text").IsRequired();
        media.Property(x => x.CreatedAt).HasColumnName("created_at").HasColumnType("timestamp with time zone");
        media.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasColumnType("timestamp with time zone");

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


        var itinerario = modelBuilder.Entity<Itinerario>();
        itinerario.ToTable("itinerarios", "public");
        itinerario.HasKey(x => x.Id);
        itinerario.Property(x => x.Id).HasColumnName("id");
        itinerario.Property(x => x.Pol).HasColumnName("pol").HasMaxLength(150).IsRequired();
        itinerario.Property(x => x.Pod).HasColumnName("pod").HasMaxLength(150).IsRequired();
        itinerario.Property(x => x.Closing).HasColumnName("closing").HasColumnType("date");
        itinerario.Property(x => x.Etd).HasColumnName("etd").HasColumnType("date");
        itinerario.Property(x => x.Eta).HasColumnName("eta").HasColumnType("date");
        itinerario.Property(x => x.Status).HasColumnName("status").HasMaxLength(20).IsRequired();
        itinerario.Property(x => x.Transporte).HasColumnName("transporte").HasMaxLength(20).IsRequired();
        itinerario.Property(x => x.Modalidad).HasColumnName("modalidad").HasMaxLength(3).IsRequired();
        itinerario.Property(x => x.Carrier).HasColumnName("carrier").HasMaxLength(150);
        itinerario.Property(x => x.Vessel).HasColumnName("vessel").HasMaxLength(150);
        itinerario.Property(x => x.Voyage).HasColumnName("voyage").HasMaxLength(50);
        itinerario.Property(x => x.CreatedAt).HasColumnName("created_at")
        .HasColumnType("timestamp with time zone").HasDefaultValueSql("now()");
    }
}
