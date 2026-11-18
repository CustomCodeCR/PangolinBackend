using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Npgsql;

internal static class DholeQuoteHttpTest
{
    private static void Assert(bool condition, string description)
    {
        if (!condition) throw new InvalidOperationException("FAILED: " + description);
    }

    public static async Task Main()
    {
        const string fakeKey = "fictional-ci-only-key";
        var connectionString = Environment.GetEnvironmentVariable("QUOTE_E2E_POSTGRES")
            ?? throw new InvalidOperationException("QUOTE_E2E_POSTGRES must refer to a disposable PostgreSQL database.");

        // The only valid target is the test database. This tool is deliberately NOT
        // suitable for production database connections or real Dhole API keys.
        var database = new NpgsqlConnectionStringBuilder(connectionString);
        Assert(database.Database == "dhole_quote_e2e" &&
            database.Host is "127.0.0.1" or "localhost" &&
            database.Username == "ci_dhole" &&
            database.Port == 5432,
            "Refuse any database except the isolated CI PostgreSQL service");
        Assert(Environment.GetEnvironmentVariable("CI") == "true",
            "Harness may run ONLY in GitHub Actions with a disposable PostgreSQL service");

        Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", "Production");
        Environment.SetEnvironmentVariable("DOTNET_ENVIRONMENT", "Production");
        Environment.SetEnvironmentVariable("ConnectionStrings__Postgres", connectionString);
        Environment.SetEnvironmentVariable("Development__ApplySchema", "false");
        // Official quote routes have a separate opt-in, OFF in production.
        // Enable them only inside the disposable PostgreSQL HTTP test.
        Environment.SetEnvironmentVariable("Features__OfficialQuotesEnabled", "true");
        Environment.SetEnvironmentVariable("Auth__OtpPepper", new string('p', 64));
        Environment.SetEnvironmentVariable("Auth__JwtSigningKey", new string('a', 64));
        Environment.SetEnvironmentVariable("DholeCatalogs__Enabled", "true");
        Environment.SetEnvironmentVariable("DholeCatalogs__FormEnabled", "true");
        Environment.SetEnvironmentVariable("DholeCatalogs__SubmissionEnabled", "true");
        Environment.SetEnvironmentVariable("DholeCatalogs__ItinerariesEnabled", "false");
        Environment.SetEnvironmentVariable("DholeCatalogs__ApiKey", fakeKey);
        Environment.SetEnvironmentVariable("DholeTracking__Enabled", "false");

        await using (var db = new NpgsqlConnection(connectionString))
        {
            await db.OpenAsync();
            // Minimal FK dependencies; create no customers or authenticated accounts.
            await using (var prerequisites = new NpgsqlCommand("""
                CREATE TABLE public.clientes (uuid uuid PRIMARY KEY);
                CREATE TABLE public.usuarios (uuid uuid PRIMARY KEY);
                """, db))
                await prerequisites.ExecuteNonQueryAsync();

            var schemaPath = Path.Combine(
                Directory.GetCurrentDirectory(), "backend", "Database", "OfficialQuotesSchema.sql");
            Assert(File.Exists(schemaPath), "Run the harness from the repository root");
            await using var schema = new NpgsqlCommand(await File.ReadAllTextAsync(schemaPath), db);
            await schema.ExecuteNonQueryAsync();
        }

        var handler = new FakeDholeHttpHandler(fakeKey);
        using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            // The assembly is named CastroFallas.MiniQuote.Api but the source
            // directory is "backend", not "CastroFallas.MiniQuote.Api".
            builder.UseContentRoot(Path.Combine(Directory.GetCurrentDirectory(), "backend"));
            builder.ConfigureTestServices(services =>
            {
                // The real backend routes and persistence run unchanged. Only the
                // outbound named HTTP factory is replaced so no internet calls occur.
                services.RemoveAll<IHttpClientFactory>();
                services.AddSingleton<IHttpClientFactory>(new FakeDholeHttpClientFactory(handler));
            });
        });
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false
        });

        // Check form options from the same host before the submitted POST.
        var formResponse = await client.GetAsync(
            "/api/quotes/official/dhole-options?mode=Maritime&shipmentType=FCL");
        Assert(formResponse.StatusCode == HttpStatusCode.OK, "Dhole form options HTTP 200");
        using var form = JsonDocument.Parse(await formResponse.Content.ReadAsStringAsync());
        var options = form.RootElement;
        Assert(options.GetProperty("source").GetString() == "dhole", "Source explicitly Dhole");
        Assert(options.GetProperty("origins").GetArrayLength() == 1 &&
            options.GetProperty("destinations").GetArrayLength() == 1,
            "Expected exactly one mocked POL and POE");
        Assert(options.GetProperty("equipmentTypesBySize").GetProperty("20 pies")[0].GetString() == "Dry Van",
            "Only real Dhole size/type combinations shown");

        var nextDay = DateTime.UtcNow.AddDays(14).ToString("yyyy-MM-dd");
        const string polId = "11111111-1111-4111-8111-111111111111";
        const string poeId = "22222222-2222-4222-8222-222222222222";
        var quote = new Dictionary<string, object?>
        {
            ["catalogSource"] = "dhole",
            ["mode"] = "Maritime",
            ["shipmentType"] = "FCL",
            ["originLocationId"] = polId,
            ["destinationLocationId"] = poeId,
            ["incoterm"] = "CIF",
            ["cargoReadyDate"] = nextDay,
            ["contactName"] = "CI Dhole Test",
            ["contactEmail"] = "dhole-qa@example.invalid",
            ["contactPhone"] = "+506 2222 2222",
            ["services"] = new[] { "Transporte internacional" },
            ["equipment"] = new[] { new {
                size = "20 pies", type = "Dry Van", quantity = 1,
                unitWeightsKg = new[] { 1200 }
            }},
            ["cargoDescription"] = "Mock-only cargo test; never send to a real provider."
        };

        async Task<HttpResponseMessage> Submit(Dictionary<string, object?> payload) =>
            await client.PostAsJsonAsync("/api/quotes/official", payload);

        using (var rejectedLegacy = await Submit(new(quote) { ["catalogSource"] = null }))
            Assert(rejectedLegacy.StatusCode == HttpStatusCode.Conflict,
                "Missing catalog source rejects after Dhole rollout");

        using (var wrongRole = await Submit(new(quote) { ["originLocationId"] = poeId }))
            Assert(wrongRole.StatusCode == HttpStatusCode.BadRequest,
                "Server rejects a destination UUID submitted as POL");

        using (var wrongType = await Submit(new(quote)
        {
            ["equipment"] = new[] { new {
                size = "20 pies", type = "High Cube", quantity = 1, unitWeightsKg = new[] { 1200 }
            }}
        }))
            Assert(wrongType.StatusCode == HttpStatusCode.BadRequest,
                "Server rejects invented equipment size/type pair");

        using (var retiredTerm = await Submit(new(quote) { ["incoterm"] = "EXW" }))
            Assert(retiredTerm.StatusCode == HttpStatusCode.BadRequest,
                "Server rejects inactive Dhole Incoterm");

        using var response = await Submit(quote);
        Assert(response.StatusCode == HttpStatusCode.Created,
            "Valid Dhole-backed guest quote is created in isolated PostgreSQL");
        using var receipt = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var createdId = receipt.RootElement.GetProperty("id").GetGuid();
        Assert(createdId != Guid.Empty, "Created quote has UUID");

        await using (var db = new NpgsqlConnection(connectionString))
        {
            await db.OpenAsync();
            await using var sql = new NpgsqlCommand("""
                SELECT origin_name, destination_name, form_json::text,
                       status, approval_status, cliente_id, usuario_id
                FROM public.official_quote_requests WHERE id = @id
                """, db);
            sql.Parameters.AddWithValue("id", createdId);
            await using var reader = await sql.ExecuteReaderAsync();
            Assert(await reader.ReadAsync(), "Quote persisted to real PostgreSQL");
            Assert(reader.GetString(0) == "Puerto Seguro - POL", "POL human-readable name stored");
            Assert(reader.GetString(1) == "Puerto Seguro - POE", "POE human-readable name stored");
            using var saved = JsonDocument.Parse(reader.GetString(2));
            var savedForm = saved.RootElement;
            Assert(savedForm.GetProperty("catalogSource").GetString() == "dhole",
                "Stored JSON retains catalog source discriminator");
            Assert(savedForm.GetProperty("originLocationId").GetString() == polId &&
                   savedForm.GetProperty("destinationLocationId").GetString() == poeId,
                "Stored JSON retains original external UUIDs without local-name migration");
            Assert(savedForm.GetProperty("equipment")[0].GetProperty("size").GetString() == "20 pies" &&
                   savedForm.GetProperty("equipment")[0].GetProperty("type").GetString() == "Dry Van",
                "Stored JSON retains validated equipment pair");
            Assert(reader.GetString(3) == "Received" && reader.GetString(4) == "Pending",
                "Quote starts with safe internal status, no authorization or Dhole send");
            Assert(reader.IsDBNull(5) && reader.IsDBNull(6),
                "Guest quote does not forge customer or registered user association");
            Assert(!await reader.ReadAsync(), "Exactly one row for returned quote");
        }
        await using (var db = new NpgsqlConnection(connectionString))
        {
            await db.OpenAsync();
            await using var count = new NpgsqlCommand(
                "SELECT COUNT(*) FROM public.official_quote_requests", db);
            Assert(Convert.ToInt64(await count.ExecuteScalarAsync()) == 1,
                "Rejected submissions did not create rows");
        }
        Assert(handler.Requests > 0 && handler.ForbiddenRequests == 0,
            "All Dhole traffic was fake HTTPS GET and used the fictional key");
        Console.WriteLine("PASS: HTTP 201 + real isolated PostgreSQL row + external UUID persistence");
        Console.WriteLine("PASS: malformed roles, inactive Incoterm, invented equipment and local bypass rejected");
        Console.WriteLine("PASS: all Dhole upstream traffic simulated; no real API, no mail, no production data");
    }
}

sealed class FakeDholeHttpClientFactory(FakeDholeHttpHandler handler) : IHttpClientFactory
{
    public HttpClient CreateClient(string name)
    {
        if (name != "DholeCatalogs")
            return new HttpClient(new RejectAnyOutgoingHttpHandler());
        return new HttpClient(handler, disposeHandler: false)
        {
            BaseAddress = new Uri("https://api.logisticacastrofallas.com/"),
            Timeout = TimeSpan.FromSeconds(12)
        };
    }
}

sealed class RejectAnyOutgoingHttpHandler : HttpMessageHandler
{
    protected override Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request, CancellationToken cancellationToken) =>
        throw new InvalidOperationException("Unexpected external HTTP request in quote CI.");
}

sealed class FakeDholeHttpHandler(string key) : HttpMessageHandler
{
    public int Requests { get; private set; }
    public int ForbiddenRequests { get; private set; }

    private static readonly Dictionary<string, string> Feeds = new(StringComparer.Ordinal)
    {
        ["api/external/v1/incoterms-wi15gr9"] = """
            [
              {"id":"a1000000-0000-4000-8000-000000000001","name":"CIF","value":"CIF"},
              {"id":"a1000000-0000-4000-8000-000000000002","name":"EXW","value":"EXW","isActive":false}
            ]
            """,
        ["api/external/v1/pol-puerto-de-origen-wi11hg7"] = """
            [
              {"id":"11111111-1111-4111-8111-111111111111","name":"Puerto Seguro - POL",
               "value":"Puerto Seguro - POL","routeRole":"POL","transportMode":"Maritime",
               "terminalType":"CY"}
            ]
            """,
        ["api/external/v1/poe-puerto-de-entrada-wi14b3j"] = """
            [
              {"id":"22222222-2222-4222-8222-222222222222","name":"Puerto Seguro - POE",
               "value":"Puerto Seguro - POE","routeRole":"POE","transportMode":"Maritime",
               "terminalType":"CY"}
            ]
            """,
        ["api/external/v1/pod-puerto-de-destino-wi14v6w"] = """
            [
              {"id":"33333333-3333-4333-8333-333333333333","name":"Puerto Seguro - POD",
               "value":"Puerto Seguro - POD","routeRole":"POD","transportMode":"Land",
               "terminalType":"SD"}
            ]
            """,
        ["api/external/v1/tamano-de-contenedor-wja5k6l"] = """
            [
              {"id":"44444444-4444-4444-8444-444444444444","name":"20 pies",
               "value":"20"}
            ]
            """,
        ["api/external/v1/tipo-de-contenedor-wja62r8"] = """
            [
              {"id":"55555555-5555-4555-8555-555555555555","name":"20 Dry Van",
               "value":"20DV", "metadata":{"size":"20","kind":"dry-van",
               "shipmentModes":["FCL"],"modalities":["Maritime"]}}
            ]
            """,
        ["api/external/v1/tamano-de-furgon-wja6f0k"] = """
            [
              {"id":"66666666-6666-4666-8666-666666666666","name":"48 pies",
               "value":"48","metadata":{"feet":48,"modality":"Land"}}
            ]
            """
    };

    protected override Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request, CancellationToken cancellationToken)
    {
        Requests++;
        var url = request.RequestUri;
        if (request.Method != HttpMethod.Get ||
            url?.Scheme != Uri.UriSchemeHttps ||
            url.Host != "api.logisticacastrofallas.com" ||
            !request.Headers.TryGetValues("X-Api-Key", out var keys) ||
            keys.SingleOrDefault() != key ||
            !Feeds.TryGetValue(url.AbsolutePath.TrimStart('/'), out var body))
        {
            ForbiddenRequests++;
            throw new InvalidOperationException("Unexpected outbound call, host, method, or key.");
        }
        return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json")
        });
    }
}
