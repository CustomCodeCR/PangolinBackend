using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text.Json;
using CastroFallas.MiniQuote.Api.Services.Auth;

namespace CastroFallas.MiniQuote.Api.Services;

// Canal de solo lectura: el backend es el único publicador de cambios persistidos.
// Las sesiones se verifican durante el handshake y se renuevan cada cinco minutos.
public sealed class RealtimeNotifier(ILogger<RealtimeNotifier> logger)
{
    private sealed class Client(WebSocket socket, AuthIdentity? identity)
    {
        public WebSocket Socket { get; } = socket;
        public Guid? ClienteId { get; } = identity?.ClienteId;
        public string? Role { get; } = identity?.Role;
        public SemaphoreSlim SendLock { get; } = new(1, 1);
    }

    private readonly ConcurrentDictionary<Guid, Client> _clients = new();

    public async Task HandleAsync(HttpContext http, AuthService auth)
    {
        if (!http.WebSockets.IsWebSocketRequest)
        {
            http.Response.StatusCode = StatusCodes.Status400BadRequest;
            return;
        }

        // El Origin no autentica. Es una defensa adicional contra conexiones cross-site.
        var origin = http.Request.Headers.Origin.ToString();
        if (!Uri.TryCreate(origin, UriKind.Absolute, out var source)
            || !string.Equals(source.Authority, http.Request.Host.Value, StringComparison.OrdinalIgnoreCase)
            || source.Scheme is not ("http" or "https")
            || (!http.RequestServices.GetRequiredService<IHostEnvironment>().IsDevelopment()
                && source.Scheme != "https"))
        {
            http.Response.StatusCode = StatusCodes.Status403Forbidden;
            return;
        }

        // El middleware JWT valida la cookie y comprueba su sesión revocable en PostgreSQL.
        // Una visita anónima solo recibe avisos de noticias públicas.
        var identity = await auth.GetIdentityAsync(http, http.RequestAborted);
        using var socket = await http.WebSockets.AcceptWebSocketAsync();
        var client = new Client(socket, identity);
        var id = Guid.NewGuid();
        _clients[id] = client;
        using var lifetime = CancellationTokenSource.CreateLinkedTokenSource(http.RequestAborted);
        lifetime.CancelAfter(TimeSpan.FromMinutes(5));
        try
        {
            await SendAsync(id, client, JsonSerializer.SerializeToUtf8Bytes(new
            {
                type = "connected", message = "Conexión WebSocket establecida"
            }));

            var buffer = new byte[1024];
            while (socket.State == WebSocketState.Open && !lifetime.IsCancellationRequested)
            {
                var received = await socket.ReceiveAsync(buffer.AsMemory(), lifetime.Token);
                if (received.MessageType == WebSocketMessageType.Close) break;

                // Nunca se admiten eventos enviados por navegadores.
                await socket.CloseAsync(WebSocketCloseStatus.PolicyViolation,
                    "Canal de notificaciones de solo lectura", lifetime.Token);
                break;
            }
        }
        catch (OperationCanceledException) { /* desconexión / renovación de sesión */ }
        catch (WebSocketException) { /* conexión cerrada por el cliente */ }
        catch (ObjectDisposedException) { /* cierre simultáneo */ }
        finally
        {
            _clients.TryRemove(id, out _);
            if (socket.State is WebSocketState.Open or WebSocketState.CloseReceived)
            {
                using var closeTimeout = new CancellationTokenSource(TimeSpan.FromSeconds(2));
                try { await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Reconectar", closeTimeout.Token); }
                catch (Exception ex) when (ex is WebSocketException or OperationCanceledException or ObjectDisposedException)
                { socket.Abort(); }
            }
            client.SendLock.Dispose();
        }
    }

    public Task ItinerariesChangedAsync() =>
        PublishAsync("itinerarios", client => client.Role is "client" or "admin");

    public Task QuoteChangedAsync(Guid clienteId) =>
        PublishAsync("quotes", client => client.ClienteId == clienteId && client.Role is "client" or "admin");

    public Task NewsChangedAsync() =>
        PublishAsync("news", _ => true);

    public Task MediaChangedAsync() =>
        PublishAsync("media", client => client.Role == "admin");

    private async Task PublishAsync(string resource, Func<Client, bool> allowed)
    {
        var bytes = JsonSerializer.SerializeToUtf8Bytes(new
        {
            type = "data-changed",
            eventId = Guid.NewGuid().ToString(),
            resource,
            timestamp = DateTimeOffset.UtcNow.ToString("O")
        });
        try
        {
            await Task.WhenAll(_clients.ToArray()
                .Where(entry => allowed(entry.Value))
                .Select(entry => SendAsync(entry.Key, entry.Value, bytes)));
        }
        catch (Exception ex)
        {
            // Un error de entrega nunca debe cambiar el resultado de un CRUD exitoso.
            logger.LogWarning(ex, "No se pudo difundir el aviso para {Resource}", resource);
        }
    }

    private async Task SendAsync(Guid id, Client client, byte[] payload)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(2));
        var locked = false;
        try
        {
            await client.SendLock.WaitAsync(timeout.Token);
            locked = true;
            if (client.Socket.State == WebSocketState.Open)
                await client.Socket.SendAsync(payload.AsMemory(), WebSocketMessageType.Text, true, timeout.Token);
        }
        catch (Exception ex) when (ex is WebSocketException or OperationCanceledException or
            ObjectDisposedException or InvalidOperationException)
        {
            _clients.TryRemove(id, out _);
            client.Socket.Abort();
            logger.LogDebug("Socket desconectado durante difusión: {ConnectionId}", id);
        }
        finally
        {
            if (locked) client.SendLock.Release();
        }
    }
}
