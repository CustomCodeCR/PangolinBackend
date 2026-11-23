using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Security.Claims;
using System.Text.Encodings.Web;
using CastroFallas.MiniQuote.Api.Services.Auth;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Configuration;
using Microsoft.EntityFrameworkCore;
using CastroFallas.MiniQuote.Api.Data;
using CastroFallas.MiniQuote.Api.Services;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
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
        // CI-only approval queue: no sender exists; no external POST is possible.
        Environment.SetEnvironmentVariable("DholeSubmission__ApprovalQueueEnabled", "true");

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
            var ddl = await File.ReadAllTextAsync(schemaPath);
            await using (var schema = new NpgsqlCommand(ddl, db))
                await schema.ExecuteNonQueryAsync();
            // A second application must be safe on the same disposable DB:
            // deployment tools can reapply this additive migration.
            await using (var reapplied = new NpgsqlCommand(ddl, db))
                await reapplied.ExecuteNonQueryAsync();
            // Only fictional admin identities. Public users are never created.
            await using var seedUsers = new NpgsqlCommand("""
                INSERT INTO public.usuarios (uuid) VALUES
                ('aaaaaaaa-0000-4000-8000-000000000001'),
                ('aaaaaaaa-0000-4000-8000-000000000002')
                ON CONFLICT (uuid) DO NOTHING;
                INSERT INTO public.official_quote_permissions
                    (user_id, can_view, can_manage, can_authorize) VALUES
                ('aaaaaaaa-0000-4000-8000-000000000001', true, true, true),
                ('aaaaaaaa-0000-4000-8000-000000000002', true, true, false);
                """, db);
            await seedUsers.ExecuteNonQueryAsync();
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
                // TestServer-only authentication: the production JWT + OTP
                // behavior remains unchanged. The header never leaves CI.
                services.AddAuthentication("CI-Admin").AddScheme<AuthenticationSchemeOptions,
                    CiAdminAuthenticationHandler>("CI-Admin", _ => { });
                services.PostConfigure<AuthenticationOptions>(options =>
                {
                    options.DefaultAuthenticateScheme = "CI-Admin";
                    options.DefaultChallengeScheme = "CI-Admin";
                    options.DefaultForbidScheme = "CI-Admin";
                });
            });
        });
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false
        });

        // New private lookup is not accessible to guests, and stays disabled
        // even for fictional admins until separately published/authorized.
        using (var guestLookup = await client.GetAsync("/api/admin/dhole/lookup-catalogs/pricing-services"))
            Assert(guestLookup.StatusCode == HttpStatusCode.Unauthorized,
                "Guest cannot access private Pricing service lookup");
        using (var adminLookup = new HttpRequestMessage(HttpMethod.Get,
            "/api/admin/dhole/lookup-catalogs/pricing-services"))
        {
            adminLookup.Headers.Add("X-CI-Test-Actor", "authorizer");
            using var result = await client.SendAsync(adminLookup);
            Assert(result.StatusCode == HttpStatusCode.NotFound,
                "Read-only Pricing lookup is disabled by default, even for admin");
        }

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
        const string podId = "33333333-3333-4333-8333-333333333333";
        var quote = new Dictionary<string, object?>
        {
            ["catalogSource"] = "dhole",
            ["mode"] = "Maritime",
            ["shipmentType"] = "FCL",
            ["originLocationId"] = polId,
            ["destinationLocationId"] = poeId,
            ["podLocationId"] = podId,
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

        using (var noFclPod = await Submit(new(quote) { ["podLocationId"] = null }))
            Assert(noFclPod.StatusCode == HttpStatusCode.BadRequest,
                "Maritime FCL without POD is rejected before saving");
        using (var noLclPod = await Submit(new(quote) {
            ["shipmentType"] = "LCL", ["podLocationId"] = null
        }))
            Assert(noLclPod.StatusCode == HttpStatusCode.BadRequest,
                "Maritime LCL without POD is rejected before saving");
        using (var invalidPod = await Submit(new(quote) {
            ["podLocationId"] = "00000000-0000-4000-8000-000000000777"
        }))
            Assert(invalidPod.StatusCode == HttpStatusCode.BadRequest,
                "Server rejects a POD UUID not in the Dhole POD catalog");
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

        using (var retiredService = await Submit(new(quote) {
            ["services"] = new[] { "Transporte nacional" }
        }))
            Assert(retiredService.StatusCode == HttpStatusCode.BadRequest,
                "Unlisted national transportation cannot be submitted by old or direct clients");
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
                   savedForm.GetProperty("destinationLocationId").GetString() == poeId &&
                   savedForm.GetProperty("podLocationId").GetString() == podId,
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
        // The approval-outbox is a separate opt-in stage: merely sending a
        // quote (even one whose catalogue is Dhole) must never queue it.
        await using (var db = new NpgsqlConnection(connectionString))
        {
            await db.OpenAsync();
            await using var count = new NpgsqlCommand(
                "SELECT COUNT(*) FROM public.official_quote_dhole_outbox", db);
            Assert(Convert.ToInt64(await count.ExecuteScalarAsync()) == 0,
                "Guest submissions never create a Dhole approval-outbox row");
        }
        await using (var db = new NpgsqlConnection(connectionString))
        {
            await db.OpenAsync();
            await using var count = new NpgsqlCommand(
                "SELECT COUNT(*) FROM public.official_quote_dhole_creation_outbox", db);
            Assert(Convert.ToInt64(await count.ExecuteScalarAsync()) == 0,
                "Direct outbox stays empty with its flag disabled");
        }
        // Verify the authorization/outbox feature against actual HTTP endpoints
        // and the disposable PostgreSQL database; outbound traffic stays fake GET.
        async Task<HttpResponseMessage> AdminRequest(HttpMethod method, string uri, string role)
        {
            using var request = new HttpRequestMessage(method, uri);
            request.Headers.Add("X-CI-Test-Actor", role);
            return await client.SendAsync(request);
        }
        async Task<HttpResponseMessage> Decide(Guid id, string decision,
            string role = "authorizer", string? priority = null) =>
            await AdminRequest(HttpMethod.Put,
                $"/api/admin/quotes/official/{id}/authorization?decision={decision}" +
                (priority is null ? "" : "&priority=" + Uri.EscapeDataString(priority)), role);
        async Task<HttpResponseMessage> Details(Guid id, string role = "authorizer") =>
            await AdminRequest(HttpMethod.Get, $"/api/admin/quotes/official/{id}", role);
        async Task<(long count, string state, int attempts, string priority)> Outbox(Guid id)
        {
            await using var conn = new NpgsqlConnection(connectionString);
            await conn.OpenAsync();
            await using var cmd = new NpgsqlCommand("""
                SELECT COUNT(*)::bigint,
                       COALESCE(MAX(state), 'NotStaged'),
                       COALESCE(MAX(attempt_count), 0),
                       COALESCE(MAX(priority), '')
                FROM public.official_quote_dhole_outbox WHERE quote_id = @id
                """, conn);
            cmd.Parameters.AddWithValue("id", id);
            await using var reader = await cmd.ExecuteReaderAsync();
            Assert(await reader.ReadAsync(), "Outbox aggregate query returns one row");
            return (reader.GetInt64(0), reader.GetString(1), reader.GetInt32(2), reader.GetString(3));
        }
        async Task<long> AuditCount(Guid id, string action)
        {
            await using var conn = new NpgsqlConnection(connectionString);
            await conn.OpenAsync();
            await using var cmd = new NpgsqlCommand("""
                SELECT COUNT(*) FROM public.official_quote_audit
                WHERE quote_id = @id AND action = @action
                """, conn);
            cmd.Parameters.AddWithValue("id", id);
            cmd.Parameters.AddWithValue("action", action);
            return Convert.ToInt64(await cmd.ExecuteScalarAsync());
        }

        using (var perms = await AdminRequest(HttpMethod.Get,
            "/api/admin/quotes/official/permissions/me", "viewer"))
        {
            Assert(perms.StatusCode == HttpStatusCode.OK, "Viewing admin permissions works");
            using var json = JsonDocument.Parse(await perms.Content.ReadAsStringAsync());
            Assert(json.RootElement.GetProperty("canAuthorize").GetBoolean() == false,
                "Regular admin cannot authorize Dhole submission");
            Assert(json.RootElement.GetProperty("dholeApprovalQueueEnabled").GetBoolean(),
                "Approval-only outbox is enabled in CI");
        }
        using (var noAuth = await Decide(createdId, "Authorized", "viewer"))
            Assert(noAuth.StatusCode == HttpStatusCode.Forbidden,
                "Admin without can_authorize denied even with a valid quote");
        Assert((await Outbox(createdId)).count == 0,
            "Unauthorized approval never creates outbox");
        using (var badDecision = await Decide(createdId, "Sent"))
            Assert(badDecision.StatusCode == HttpStatusCode.BadRequest,
                "Cannot set remote status using authorization endpoint");
        using (var badPriority = await Decide(createdId, "Authorized", priority: "Urgent"))
            Assert(badPriority.StatusCode == HttpStatusCode.BadRequest,
                "Unrecognized priority cannot stage a quote");
        Assert((await Outbox(createdId)).count == 0,
            "Invalid priority never stages the quote");

        // Independent rejected quote: never enters integration outbox.
        using var rejectedResponse = await Submit(quote);
        Assert(rejectedResponse.StatusCode == HttpStatusCode.Created,
            "Second fictional quote created for rejection test");
        using var rejectedJson = JsonDocument.Parse(await rejectedResponse.Content.ReadAsStringAsync());
        var rejectedId = rejectedJson.RootElement.GetProperty("id").GetGuid();
        using (var rejected = await Decide(rejectedId, "Rejected"))
            Assert(rejected.StatusCode == HttpStatusCode.OK, "Explicit rejection accepted");
        Assert((await Outbox(rejectedId)).count == 0,
            "Rejected quote never enters outbox");
        Assert(await AuditCount(rejectedId, "Rejected") == 1,
            "Rejected quote audited once");
        using (var rejectAgain = await Decide(rejectedId, "Authorized"))
            Assert(rejectAgain.StatusCode == HttpStatusCode.Conflict,
                "Rejected decision is immutable");

        using (var accepted = await Decide(createdId, "Authorized"))
        {
            Assert(accepted.StatusCode == HttpStatusCode.OK,
                "Authorized quote accepted by admin permission");
            using var json = JsonDocument.Parse(await accepted.Content.ReadAsStringAsync());
            Assert(json.RootElement.GetProperty("dholeDispatchState").GetString() == "AwaitingConnector",
                "Approval returns local staging state, not Sent");
        }
        var stage = await Outbox(createdId);
        Assert(stage.count == 1 && stage.state == "AwaitingConnector" &&
            stage.attempts == 0 && stage.priority == "Green",
            "Default approval creates one local Green outbox row, zero attempts");
        Assert(await AuditCount(createdId, "Authorized") == 1 &&
            await AuditCount(createdId, "DholeStaged") == 1,
            "Approval and local staging each audited once");
        using (var details = await Details(createdId))
        {
            Assert(details.StatusCode == HttpStatusCode.OK, "Admin details available");
            using var json = JsonDocument.Parse(await details.Content.ReadAsStringAsync());
            Assert(json.RootElement.GetProperty("dholeDispatchState").GetString() == "AwaitingConnector",
                "Admin details show local stage without pretending a send");
            Assert(json.RootElement.GetProperty("dholePriority").GetString() == "Green",
                "Default stage priority is visible in admin details");
        }
        using (var again = await Decide(createdId, "Authorized"))
            Assert(again.StatusCode == HttpStatusCode.Conflict,
                "Same approval cannot be repeated");
        Assert((await Outbox(createdId)).count == 1,
            "Duplicate request does not create a second outbox row");

        // Explicit priority overrides must be persisted only for authorized admins.
        foreach (var priority in new[] { "Yellow", "Red" })
        {
            using var overrideResponse = await Submit(quote);
            Assert(overrideResponse.StatusCode == HttpStatusCode.Created,
                "Fictional quote created for override test");
            using var overrideJson = JsonDocument.Parse(await overrideResponse.Content.ReadAsStringAsync());
            var overrideId = overrideJson.RootElement.GetProperty("id").GetGuid();
            using (var denied = await Decide(overrideId, "Authorized", "viewer", priority))
                Assert(denied.StatusCode == HttpStatusCode.Forbidden,
                    "Viewer cannot choose an urgency override");
            Assert((await Outbox(overrideId)).count == 0,
                "Unauthorized priority override never stages a row");
            using (var allowed = await Decide(overrideId, "Authorized", priority: priority))
                Assert(allowed.StatusCode == HttpStatusCode.OK,
                    "Admin may stage a valid " + priority + " priority");
            var overridden = await Outbox(overrideId);
            Assert(overridden.count == 1 && overridden.priority == priority && overridden.attempts == 0,
                "Authorized " + priority + " priority persists without external POST");
        }

        // The public-quote policy intentionally limits a single TestServer IP to
        // 12 requests per 10 minutes. Earlier negative cases consume that budget,
        // so run this independent concurrency fixture in a second isolated host.
        // Do NOT disable or increase production rate limits just to pass CI.
        // Both hosts use the same disposable test DB and fake GET-only provider.
        using var concurrencyFactory = factory.WithWebHostBuilder(_ => { });
        using var concurrencyClient = concurrencyFactory.CreateClient(
            new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        // Simultaneous admin approvals must serialize on the quote row.
        using var simultaneousResponse = await concurrencyClient.PostAsJsonAsync(
            "/api/quotes/official", quote);
        Assert(simultaneousResponse.StatusCode == HttpStatusCode.Created,
            "Third fictional quote created for concurrency test");
        using var simultaneousJson = JsonDocument.Parse(await simultaneousResponse.Content.ReadAsStringAsync());
        var simultaneousId = simultaneousJson.RootElement.GetProperty("id").GetGuid();
        var concurrent = await Task.WhenAll(
            Decide(simultaneousId, "Authorized"), Decide(simultaneousId, "Authorized"));
        Assert(concurrent.Count(x => x.StatusCode == HttpStatusCode.OK) == 1 &&
            concurrent.Count(x => x.StatusCode == HttpStatusCode.Conflict) == 1,
            "Exactly one concurrent approval wins, the other is rejected");
        foreach (var item in concurrent) item.Dispose();
        Assert((await Outbox(simultaneousId)).count == 1 &&
            await AuditCount(simultaneousId, "DholeStaged") == 1,
            "Concurrent approval creates one outbox and one staging audit");

        // Separate HTTP host: direct outbox ON, approval outbox OFF.
        // Production's 12/10-minute public quote rate limit stays unchanged.
        using var directFactory = factory.WithWebHostBuilder(host =>
            host.ConfigureAppConfiguration((_, cfg) => cfg.AddInMemoryCollection(
                new Dictionary<string, string?>
                {
                    ["DholeSubmission:DirectOutboxEnabled"] = "true",
                    ["DholeSubmission:ApprovalQueueEnabled"] = "false"
                })));
        using var directClient = directFactory.CreateClient(
            new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        using (var noInsuredValue = await directClient.PostAsJsonAsync(
            "/api/quotes/official", new Dictionary<string, object?>(quote)
            {
                ["services"] = new[] { "Transporte internacional", "Seguro de carga" }
            }))
            Assert(noInsuredValue.StatusCode == HttpStatusCode.BadRequest,
                "Insurance requires a positive cargo value before quote persistence");
        using (var noCurrency = await directClient.PostAsJsonAsync(
            "/api/quotes/official", new Dictionary<string, object?>(quote)
            {
                ["services"] = new[] { "Transporte internacional", "Seguro de carga" },
                ["cargoValue"] = 1500
            }))
            Assert(noCurrency.StatusCode == HttpStatusCode.BadRequest,
                "Declared value cannot be submitted without explicit currency");
        using var directResponse = await directClient.PostAsJsonAsync("/api/quotes/official", quote);
        Assert(directResponse.StatusCode == HttpStatusCode.Created,
            "Direct opt-in creates one fictional quote and its outbox atomically");
        using var directReceipt = JsonDocument.Parse(await directResponse.Content.ReadAsStringAsync());
        var directId = directReceipt.RootElement.GetProperty("id").GetGuid();
        Assert(directReceipt.RootElement.GetProperty("dholeDispatchState").GetString() == "PendingDispatch",
            "Creation returns pending state, never claims remote delivery");
        await using (var db = new NpgsqlConnection(connectionString))
        {
            await db.OpenAsync();
            await using var query = new NpgsqlCommand("""
                SELECT o.state, o.idempotency_key, o.priority, o.attempt_count,
                       q.approval_status, o.external_reference
                FROM public.official_quote_dhole_creation_outbox o
                JOIN public.official_quote_requests q ON q.id = o.quote_id
                WHERE o.quote_id = @id
                """, db);
            query.Parameters.AddWithValue("id", directId);
            await using var reader = await query.ExecuteReaderAsync();
            Assert(await reader.ReadAsync(), "Outbox and official copy both persisted");
            Assert(reader.GetString(0) == "PendingDispatch" &&
                   reader.GetString(1) == "cf-official-" + directId.ToString("D") &&
                   reader.GetString(2) == "Green" && reader.GetInt32(3) == 0 &&
                   reader.GetString(4) == "Pending" && reader.IsDBNull(5),
                "Stable key, Green default, zero attempts, no approval and no remote ref");
            Assert(!await reader.ReadAsync(), "Only one direct job per quote");
        }
        await using (var db = new NpgsqlConnection(connectionString))
        {
            await db.OpenAsync();
            await using var duplicate = new NpgsqlCommand("""
                INSERT INTO public.official_quote_dhole_creation_outbox
                    (quote_id, idempotency_key, state)
                VALUES (@quote, @key, 'PendingDispatch')
                """, db);
            duplicate.Parameters.AddWithValue("quote", directId);
            duplicate.Parameters.AddWithValue("key", "cf-official-" + directId.ToString("D"));
            var refused = false;
            try { await duplicate.ExecuteNonQueryAsync(); }
            catch (PostgresException ex) when (ex.SqlState == PostgresErrorCodes.UniqueViolation)
            { refused = true; }
            Assert(refused, "PK/UNIQUE refuse a duplicate delivery job");
        }
        using (var detailRequest = new HttpRequestMessage(HttpMethod.Get,
            $"/api/admin/quotes/official/{directId}"))
        {
            detailRequest.Headers.Add("X-CI-Test-Actor", "viewer");
            using var detailResponse = await directClient.SendAsync(detailRequest);
            Assert(detailResponse.StatusCode == HttpStatusCode.OK,
                "Admin can inspect direct delivery status without authorizing it");
            using var detailJson = JsonDocument.Parse(await detailResponse.Content.ReadAsStringAsync());
            Assert(detailJson.RootElement.GetProperty("dholeDispatchState").GetString() == "PendingDispatch",
                "Administration shows direct state independently of approval");
        }
        // Claiming is a separate, fully offline primitive: no hosted worker or
        // Dhole HTTP client is registered. Require two flags (both default off).
        var previewFlags = new ConfigurationBuilder().AddInMemoryCollection(
            new Dictionary<string, string?>
            {
                ["DholeSubmission:DirectOutboxEnabled"] = "true",
                ["DholeSubmission:ClaimPreviewEnabled"] = "true"
            }).Build();
        var disabledFlags = new ConfigurationBuilder().AddInMemoryCollection(
            new Dictionary<string, string?>
            {
                ["DholeSubmission:DirectOutboxEnabled"] = "true",
                ["DholeSubmission:ClaimPreviewEnabled"] = "false"
            }).Build();
        DbContextOptions<AppDbContext> opts = new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql(connectionString).Options;
        await using (var db = new AppDbContext(opts))
        {
            var gated = new DholeOfficialOutboxClaimService(disabledFlags);
            Assert(!gated.Enabled &&
                await gated.ClaimOneForOfflineReviewAsync(db, CancellationToken.None) is null,
                "Claim disabled means zero database state transitions");
        }
        var claimer = new DholeOfficialOutboxClaimService(previewFlags);
        async Task<Guid?> ClaimOnce()
        {
            await using var scoped = new AppDbContext(opts);
            return await claimer.ClaimOneForOfflineReviewAsync(scoped, CancellationToken.None);
        }
        var concurrentClaims = await Task.WhenAll(ClaimOnce(), ClaimOnce());
        Assert(concurrentClaims.Count(id => id == directId) == 1 &&
            concurrentClaims.Count(id => id is null) == 1,
            "Two concurrent claimers can claim exactly one outbox row");
        Assert(await ClaimOnce() is null,
            "An InFlight claim is never automatically re-claimed");
        await using (var db = new NpgsqlConnection(connectionString))
        {
            await db.OpenAsync();
            await using var inspect = new NpgsqlCommand("""
                SELECT state, attempt_count, last_attempt_at_utc,
                       external_reference
                FROM public.official_quote_dhole_creation_outbox
                WHERE quote_id = @id
                """, db);
            inspect.Parameters.AddWithValue("id", directId);
            await using var reader = await inspect.ExecuteReaderAsync();
            Assert(await reader.ReadAsync() &&
                reader.GetString(0) == "InFlight" &&
                reader.GetInt32(1) == 1 &&
                !reader.IsDBNull(2) &&
                reader.IsDBNull(3),
                "Atomic claim increments one attempt without fabricating Dhole confirmation");
        }
        // Force an outbox constraint failure: the official quote MUST roll back.
        long beforeFailure;
        await using (var db = new NpgsqlConnection(connectionString))
        {
            await db.OpenAsync();
            await using var count = new NpgsqlCommand(
                "SELECT COUNT(*) FROM public.official_quote_requests", db);
            beforeFailure = Convert.ToInt64(await count.ExecuteScalarAsync());
            await using var block = new NpgsqlCommand("""
                ALTER TABLE public.official_quote_dhole_creation_outbox
                    ADD CONSTRAINT ck_ci_refuse_pending CHECK (state <> 'PendingDispatch') NOT VALID
                """, db);
            await block.ExecuteNonQueryAsync();
        }
        try
        {
            using var failed = await directClient.PostAsJsonAsync("/api/quotes/official", quote);
            Assert(failed.StatusCode == HttpStatusCode.InternalServerError,
                "Simulated DB outbox failure must not return an issued quote receipt");
            await using var db = new NpgsqlConnection(connectionString);
            await db.OpenAsync();
            await using var count = new NpgsqlCommand(
                "SELECT COUNT(*) FROM public.official_quote_requests", db);
            Assert(Convert.ToInt64(await count.ExecuteScalarAsync()) == beforeFailure,
                "Failure to stage the delivery rolls back the official quote in one transaction");
        }
        finally
        {
            await using var db = new NpgsqlConnection(connectionString);
            await db.OpenAsync();
            await using var unblock = new NpgsqlCommand("""
                ALTER TABLE public.official_quote_dhole_creation_outbox
                    DROP CONSTRAINT IF EXISTS ck_ci_refuse_pending
                """, db);
            await unblock.ExecuteNonQueryAsync();
        }

        // Valid declared insurance amount/currency remain in the ADMIN copy,
        // still with zero external POST and no invented form_currencyId.
        using (var insuredResponse = await directClient.PostAsJsonAsync(
            "/api/quotes/official", new Dictionary<string, object?>(quote)
            {
                ["services"] = new[] { "Transporte internacional", "Seguro de carga" },
                ["cargoValue"] = 1500,
                ["cargoCurrencyCode"] = "USD"
            }))
        {
            Assert(insuredResponse.StatusCode == HttpStatusCode.Created,
                "Insurance quote with ISO currency creates an administrative copy");
            using var created = JsonDocument.Parse(await insuredResponse.Content.ReadAsStringAsync());
            var insuredId = created.RootElement.GetProperty("id").GetGuid();
            await using var conn = new NpgsqlConnection(connectionString);
            await conn.OpenAsync();
            await using var sql = new NpgsqlCommand("""
                SELECT q.form_json::text, o.state, o.attempt_count
                FROM public.official_quote_requests q
                JOIN public.official_quote_dhole_creation_outbox o ON o.quote_id = q.id
                WHERE q.id = @id
                """, conn);
            sql.Parameters.AddWithValue("id", insuredId);
            await using var reader = await sql.ExecuteReaderAsync();
            Assert(await reader.ReadAsync(), "Insurance outbox and admin copy both exist");
            using var saved = JsonDocument.Parse(reader.GetString(0));
            Assert(saved.RootElement.GetProperty("cargoCurrencyCode").GetString() == "USD" &&
                saved.RootElement.GetProperty("cargoValue").GetInt32() == 1500 &&
                reader.GetString(1) == "PendingDispatch" && reader.GetInt32(2) == 0,
                "Currency retained with untouched pending job and no remote transmission");
        }

        Assert(handler.Requests > 0 && handler.ForbiddenRequests == 0,
            "All Dhole traffic was fake HTTPS GET and used the fictional key");
        Console.WriteLine("PASS: HTTP 201 + real isolated PostgreSQL row + external UUID persistence");
        Console.WriteLine("PASS: malformed roles, inactive Incoterm, invented equipment and local bypass rejected");
        Console.WriteLine("PASS: permission denied / rejected / approved / duplicate / concurrent approval");
        Console.WriteLine("PASS: approved Green default, admin-only Yellow/Red priority persisted; zero external POST");
        Console.WriteLine("PASS: each approval stages exactly once; outbox attempts zero, no external POST");
        Console.WriteLine("PASS: direct creation outbox independent; atomic save/rollback, unique key and admin visibility");
        Console.WriteLine("PASS: two concurrent DB claimers select one job, no retry, no remote HTTP");
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

// This handler exists only in the CI TestServer project; it is not registered
// in the production application. No token or external identity is trusted.
sealed class CiAdminAuthenticationHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var actor = Request.Headers["X-CI-Test-Actor"].ToString();
        if (actor is not ("authorizer" or "viewer"))
            return Task.FromResult(AuthenticateResult.NoResult());
        var id = actor == "authorizer"
            ? Guid.Parse("aaaaaaaa-0000-4000-8000-000000000001")
            : Guid.Parse("aaaaaaaa-0000-4000-8000-000000000002");
        var identity = new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, id.ToString()),
            new Claim(ClaimTypes.Role, "admin")], Scheme.Name);
        Context.Items["auth.identity"] = new AuthIdentity(id,
            Guid.Parse("bbbbbbbb-0000-4000-8000-000000000001"),
            "Cliente ficticio", "admin@example.invalid", "usuario", "admin", null);
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(
            new ClaimsPrincipal(identity), Scheme.Name)));
    }
}
