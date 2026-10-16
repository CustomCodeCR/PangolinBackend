using CastroFallas.MiniQuote.Api.Services.Auth;
using Microsoft.AspNetCore.SignalR;

namespace CastroFallas.MiniQuote.Api.Services.Realtime;

// Hub sin métodos invocables por el navegador: las notificaciones de negocio
// solo se emiten desde endpoints .NET después de confirmar la escritura.
public sealed class ContentUpdatesHub : Hub
{
    public const string Path = "/api/hubs/updates";
    public const string Admins = "role:admin";
    public const string Registered = "role:registered";
    public static string User(Guid id) => $"user:{id:N}";
    public static string Customer(Guid id) => $"customer:{id:N}";

    public override async Task OnConnectedAsync()
    {
        var http = Context.GetHttpContext();
        if (http?.Items["auth.identity"] is AuthIdentity identity &&
            http.User.Identity?.IsAuthenticated == true)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, Registered);
            await Groups.AddToGroupAsync(Context.ConnectionId, User(identity.UsuarioId));
            if (identity.Role == "admin")
                await Groups.AddToGroupAsync(Context.ConnectionId, Admins);
            else if (identity.Role == "client")
                await Groups.AddToGroupAsync(Context.ConnectionId, Customer(identity.ClienteId));
        }
        await base.OnConnectedAsync();
    }
}
