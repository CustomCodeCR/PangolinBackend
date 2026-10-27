using System.Net.Mail;
using CastroFallas.MiniQuote.Api.Data;
using CastroFallas.MiniQuote.Api.Models.Auth;
using CastroFallas.MiniQuote.Api.Services.Auth;
using CastroFallas.MiniQuote.Api.Services.Realtime;
using Microsoft.EntityFrameworkCore;

namespace CastroFallas.MiniQuote.Api.Services;

// Administradores gestionan cuentas ya registradas; no hay autorregistro público.
// Los invitados no tienen usuario ni rol persistente en PostgreSQL.
public sealed record UpdateUserAccessRequest(string? Role, bool? Activo);
public sealed record CreateManagedUserRequest(string? Nombre, string? Correo, string? Role, string? CodigoDynamics);

public static class AdminUsersEndpoints
{
    public static void MapAdminUsers(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/admin/users").RequireAuthorization("admin");

        group.MapGet("", async (AppDbContext db, int? page, int? pageSize, CancellationToken ct) =>
        {
            var currentPage = page ?? 1;
            var size = pageSize ?? 50;
            if (currentPage < 1 || size is < 1 or > 100 || ((long)currentPage - 1) * size > int.MaxValue)
                return Results.BadRequest(new { error = "page >= 1 y pageSize entre 1 y 100." });

            var query = db.Usuarios.AsNoTracking().Include(u => u.Cliente).Where(u => u.DeletedAt == null);
            var total = await query.CountAsync(ct);
            var items = await query.OrderBy(u => u.Correo).ThenBy(u => u.Uuid)
                .Skip((currentPage - 1) * size).Take(size)
                .Select(u => new
                {
                    id = u.Uuid,
                    correo = u.Correo,
                    nombre = u.Cliente.Nombre,
                    role = u.TipoAcceso == "usuario" ? "administrador" : "cliente",
                    activo = u.Status,
                    createdAt = u.CreatedAt
                })
                .ToListAsync(ct);
            return Results.Ok(new
            {
                users = items,
                total,
                page = currentPage,
                pageSize = size,
                totalPages = (int)Math.Ceiling((double)total / size)
            });
        });


        group.MapPost("", async (
            CreateManagedUserRequest input, AppDbContext db, AuthService auth,
            ContentUpdatesPublisher updates, HttpContext http, CancellationToken ct) =>
        {
            var actor = await auth.GetIdentityAsync(http, ct);
            if (actor is null) return Results.Unauthorized();

            var email = input.Correo?.Trim().ToLowerInvariant() ?? "";
            var name = input.Nombre?.Trim() ?? "";
            var role = input.Role?.Trim().ToLowerInvariant();
            var code = input.CodigoDynamics?.Trim() ?? "";
            if (name.Length is < 2 or > 500 || email.Length is < 3 or > 255 ||
                !MailAddress.TryCreate(email, out var address) ||
                !string.Equals(address.Address, email, StringComparison.OrdinalIgnoreCase) ||
                role is not ("administrador" or "cliente") ||
                code.Length > 200)
                return Results.BadRequest(new { error = "Indica nombre, correo válido y rol. El código Dynamics es opcional." });

            await using var tx = await db.Database.BeginTransactionAsync(ct);
            // Serializa altas concurrentes de correo y de empresa.
            await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(20261027)", ct);
            if (await db.Usuarios.AnyAsync(u => u.Correo.ToLower() == email, ct))
                return Results.Conflict(new { error = "Ya existe una cuenta con ese correo." });

            Cliente? customer = null;
            if (role == "cliente" && code.Length > 0)
            {
                customer = await db.Clientes.FirstOrDefaultAsync(c => c.CodigoDynamics == code, ct);
                if (customer is not null && (!customer.Status || customer.DeletedAt != null))
                    return Results.Conflict(new { error = "La empresa asociada está desactivada." });
            }
            if (customer is null)
            {
                customer = new Cliente
                {
                    Nombre = name,
                    CodigoDynamics = code.Length > 0 && role == "cliente" ? code : "INTERNO-" + Guid.NewGuid().ToString("N")
                };
                db.Clientes.Add(customer);
            }

            var user = new Usuario
            {
                Correo = email,
                TipoAcceso = role == "administrador" ? "usuario" : "cliente",
                Cliente = customer,
                Status = true
            };
            db.Usuarios.Add(user);
            await db.SaveChangesAsync(ct);
            await db.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO auth_admin_user_audit
                    (actor_usuario_id, target_usuario_id, old_role, new_role, old_active, new_active)
                VALUES ({actor.UsuarioId}, {user.Uuid}, {"creado"}, {role}, {false}, {true})
                """, ct);
            await tx.CommitAsync(ct);
            await updates.AdminsAsync("users");
            return Results.Created($"/api/admin/users/{user.Uuid}", new
            {
                id = user.Uuid, correo = user.Correo, nombre = customer.Nombre,
                role, activo = true, createdAt = user.CreatedAt
            });
        });

        group.MapPatch("/{id:guid}", async (
            Guid id, UpdateUserAccessRequest input, AppDbContext db, AuthService auth, ContentUpdatesPublisher updates,
            HttpContext http, CancellationToken ct) =>
        {
            var actor = await auth.GetIdentityAsync(http, ct);
            if (actor is null) return Results.Unauthorized();
            var role = input.Role?.Trim().ToLowerInvariant();
            if (role is not ("administrador" or "cliente") || input.Activo is null)
                return Results.BadRequest(new { error = "role debe ser administrador o cliente, y activo es obligatorio. Invitado no es un tipo de cuenta." });
            if (actor.UsuarioId == id)
                return Results.Conflict(new { error = "No puedes cambiar tu propio rol o estado desde esta pantalla." });

            await using var tx = await db.Database.BeginTransactionAsync(ct);
            // Evita dos cambios simultáneos que dejarían cero administradores.
            await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(20261015)", ct);
            var user = await db.Usuarios.Include(u => u.Cliente)
                .FirstOrDefaultAsync(u => u.Uuid == id && u.DeletedAt == null, ct);
            if (user is null) return Results.NotFound(new { error = "Cuenta no encontrada." });

            var newRole = role == "administrador" ? "usuario" : "cliente";
            var newStatus = input.Activo.Value;
            if (user.TipoAcceso == "usuario" && user.Status && (newRole != "usuario" || !newStatus))
            {
                var others = await db.Usuarios.CountAsync(u =>
                    u.Uuid != id && u.TipoAcceso == "usuario" && u.Status &&
                    u.DeletedAt == null && u.Cliente.Status && u.Cliente.DeletedAt == null, ct);
                if (others == 0)
                    return Results.Conflict(new { error = "Debe permanecer al menos un administrador activo." });
            }

            var oldRole = user.TipoAcceso;
            var oldStatus = user.Status;
            user.TipoAcceso = newRole;
            user.Status = newStatus;
            if (oldRole != newRole || oldStatus != newStatus)
            {
                await db.SaveChangesAsync(ct);
                await db.AuthSessions.Where(s => s.UsuarioId == id && s.RevokedAt == null)
                    .ExecuteUpdateAsync(set => set.SetProperty(s => s.RevokedAt, DateTime.UtcNow), ct);
                await db.Database.ExecuteSqlInterpolatedAsync($"""
                    INSERT INTO auth_admin_user_audit
                        (actor_usuario_id, target_usuario_id, old_role, new_role, old_active, new_active)
                    VALUES ({actor.UsuarioId}, {id}, {oldRole}, {newRole}, {oldStatus}, {newStatus})
                    """, ct);
            }
            await tx.CommitAsync(ct);
            await updates.AdminsAsync("users");
            return Results.Ok(new
            {
                id = user.Uuid, correo = user.Correo, nombre = user.Cliente.Nombre,
                role = newRole == "usuario" ? "administrador" : "cliente",
                activo = newStatus, createdAt = user.CreatedAt
            });
        });
    }
}
