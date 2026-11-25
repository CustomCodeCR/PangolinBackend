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
using CastroFallas.MiniQuote.Api.Models;
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

        // The optional key-table migration is intentionally absent when
        // checking the historic submission route with the feature disabled.
        await using (var db = new NpgsqlConnection(connectionString))
        {
            await db.OpenAsync();
            await using var removeOptional = new NpgsqlCommand(
                "DROP TABLE public.official_quote_client_submissions", db);
            await removeOptional.ExecuteNonQueryAsync();
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
        Assert(!options.GetProperty("clientCreateIdempotencyEnabled").GetBoolean(),
            "Server without the dedup flag must explicitly advertise that safe retry is unavailable");
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
        // The original quote succeeded with the key table absent.
        // Install only its additive migration before testing opted-in replays.
        await using (var db = new NpgsqlConnection(connectionString))
        {
            await db.OpenAsync();
            await using var install = new NpgsqlCommand("""
                CREATE TABLE IF NOT EXISTS public.official_quote_client_submissions (
                    submission_key UUID PRIMARY KEY,
                    quote_id UUID NOT NULL UNIQUE
                        REFERENCES public.official_quote_requests(id) ON DELETE RESTRICT,
                    request_digest VARCHAR(64) NOT NULL
                        CHECK (request_digest ~ '^[0-9a-f]{64}$'),
                    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now()
                )
                """, db);
            await install.ExecuteNonQueryAsync();
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

        // Active, unlinked quotes still need human attention. Even a manager
        // cannot silently remove them before review or closure.
        using (var pendingArchive = await AdminRequest(HttpMethod.Delete,
            $"/api/admin/quotes/official/{createdId}", "authorizer"))
        {
            Assert(pendingArchive.StatusCode == HttpStatusCode.Conflict,
                "Received quote cannot disappear from the inbox");
            using var pendingError = JsonDocument.Parse(
                await pendingArchive.Content.ReadAsStringAsync());
            Assert(pendingError.RootElement.GetProperty("code").GetString() ==
                "quote_archive_not_final", "Active archive has explicit conflict code");
        }
        Assert(await AuditCount(createdId, "Archived") == 0,
            "Rejected premature archival cannot create an audit event");

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

        // Removing a quote means an auditable archive, never a physical DELETE.
        using (var guestRemove = await AdminRequest(HttpMethod.Delete,
            $"/api/admin/quotes/official/{rejectedId}", "guest"))
            Assert(guestRemove.StatusCode == HttpStatusCode.Unauthorized,
                "A guest cannot remove an administrative quote");
        using (var remove = await AdminRequest(HttpMethod.Delete,
            $"/api/admin/quotes/official/{rejectedId}", "authorizer"))
            Assert(remove.StatusCode == HttpStatusCode.OK,
                "Manager archives a quote without a Dhole outbox");
        using (var repeatRemove = await AdminRequest(HttpMethod.Delete,
            $"/api/admin/quotes/official/{rejectedId}", "authorizer"))
            Assert(repeatRemove.StatusCode == HttpStatusCode.NotFound,
                "A quote already removed cannot be removed twice");
        using (var archivedDetail = await Details(rejectedId))
            Assert(archivedDetail.StatusCode == HttpStatusCode.NotFound,
                "Archived quote cannot be opened from Administration");
        using (var staleReview = new HttpRequestMessage(HttpMethod.Put,
            $"/api/admin/quotes/official/{rejectedId}/review"))
        {
            staleReview.Headers.Add("X-CI-Test-Actor", "authorizer");
            staleReview.Content = JsonContent.Create(
                new { status = "InReview", comment = "No corresponde" });
            using var reviewArchived = await client.SendAsync(staleReview);
            Assert(reviewArchived.StatusCode == HttpStatusCode.NotFound,
                "Archived quote cannot be reviewed or reopened by a stale admin tab");
        }
        using (var list = await AdminRequest(HttpMethod.Get,
            "/api/admin/quotes/official?page=1", "authorizer"))
        {
            Assert(list.StatusCode == HttpStatusCode.OK, "Admin inbox available after removal");
            using var json = JsonDocument.Parse(await list.Content.ReadAsStringAsync());
            Assert(!json.RootElement.GetProperty("items").EnumerateArray()
                .Any(x => x.GetProperty("id").GetGuid() == rejectedId),
                "Archived quote is hidden from admin inbox");
        }
        Assert(await AuditCount(rejectedId, "Archived") == 1 &&
            await AuditCount(rejectedId, "Rejected") == 1,
            "Archive keeps the original review/decision audit and records actor action");
        await using (var db = new NpgsqlConnection(connectionString))
        {
            await db.OpenAsync();
            await using var check = new NpgsqlCommand("""
                SELECT archived_at_utc IS NOT NULL, archived_by_id IS NOT NULL
                FROM public.official_quote_requests WHERE id = @id
                """, db);
            check.Parameters.AddWithValue("id", rejectedId);
            await using var row = await check.ExecuteReaderAsync();
            Assert(await row.ReadAsync() && row.GetBoolean(0) && row.GetBoolean(1),
                "Archived quote remains persisted with actor and timestamp");
        }

        // PERMANENT DELETE: separate TestServer to keep production rate limits
        // unchanged while exercising all destructive-route safeguards.
        using var purgeFactory = factory.WithWebHostBuilder(_ => { });
        using var purgeClient = purgeFactory.CreateClient(
            new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        async Task<HttpResponseMessage> Purge(Guid quoteId, string role,
            string reason = "Prueba", bool active = false)
        {
            using var request = new HttpRequestMessage(HttpMethod.Delete,
                active ? $"/api/admin/quotes/official/{quoteId}/purge" :
                    $"/api/admin/quotes/official/archived/{quoteId}");
            request.Headers.Add("X-CI-Test-Actor", role);
            request.Content = JsonContent.Create(new { reason });
            return await purgeClient.SendAsync(request);
        }
        using (var archivedList = new HttpRequestMessage(HttpMethod.Get,
            "/api/admin/quotes/official/archived?page=1"))
        {
            archivedList.Headers.Add("X-CI-Test-Actor", "viewer");
            using var archivedResponse = await purgeClient.SendAsync(archivedList);
            Assert(archivedResponse.StatusCode == HttpStatusCode.OK,
                "Archived list is admin-only and available to non-purging admins");
            using var payload = JsonDocument.Parse(await archivedResponse.Content.ReadAsStringAsync());
            Assert(payload.RootElement.GetProperty("canPurge").GetBoolean() &&
                payload.RootElement.GetProperty("items").EnumerateArray()
                    .Any(x => x.GetProperty("id").GetGuid() == rejectedId),
                "Any admin can see archived rows and is eligible to purge them");
        }
        using (var guestPurge = await Purge(rejectedId, "guest"))
            Assert(guestPurge.StatusCode == HttpStatusCode.Unauthorized,
                "Guest cannot permanently delete quotes");
        using (var invalidReason = await Purge(rejectedId, "viewer",
            reason: "Otro"))
            Assert(invalidReason.StatusCode == HttpStatusCode.BadRequest,
                "Every admin reaches the purge endpoint, but invalid reasons are rejected");
        // There is no longer a 24-hour wait for a completed archived quote.
        // Simulate a protected client idempotency link. The deletion still
        // preserves the random request key as an irreversible replay tombstone.
        await using (var db = new NpgsqlConnection(connectionString))
        {
            await db.OpenAsync();
            await using var key = new NpgsqlCommand("""
                INSERT INTO public.official_quote_client_submissions
                    (submission_key, quote_id, request_digest)
                VALUES ('f8100000-0000-4000-8000-000000000015', @id, @digest)
                """, db);
            key.Parameters.AddWithValue("id", rejectedId);
            key.Parameters.AddWithValue("digest", new string('a', 64));
            Assert(await key.ExecuteNonQueryAsync() == 1,
                "Insert fictional client retry key only in disposable PostgreSQL");
        }
        // A key alone is NOT a blocker anymore: the purge will store its UUID
        // in a PII-free tombstone and atomically drop the old FK and hash.
        // However, a Dhole relation must still block deletion unconditionally.
        await using (var db = new NpgsqlConnection(connectionString))
        {
            await db.OpenAsync();
            await using var link = new NpgsqlCommand(
                "INSERT INTO public.official_quote_dhole_outbox (quote_id) VALUES (@id)", db);
            link.Parameters.AddWithValue("id", rejectedId);
            Assert(await link.ExecuteNonQueryAsync() == 1,
                "Insert fictional Dhole approval link in isolated PostgreSQL");
        }
        using (var dholePurge = await Purge(rejectedId, "viewer"))
            Assert(dholePurge.StatusCode == HttpStatusCode.Conflict,
                "Any Dhole outbox must protect archived quotes from ALL admins");
        await using (var db = new NpgsqlConnection(connectionString))
        {
            await db.OpenAsync();
            await using var clear = new NpgsqlCommand(
                "DELETE FROM public.official_quote_dhole_outbox WHERE quote_id = @id", db);
            clear.Parameters.AddWithValue("id", rejectedId);
            Assert(await clear.ExecuteNonQueryAsync() == 1,
                "Remove fabricated Dhole link from isolated test DB only");
        }
        using (var allowedPurge = await Purge(rejectedId, "authorizer", reason: "Defectuosa"))
            Assert(allowedPurge.StatusCode == HttpStatusCode.OK,
                "Eligible archived quote can be permanently deleted immediately after archival");
        using (var repeatedPurge = await Purge(rejectedId, "authorizer"))
            Assert(repeatedPurge.StatusCode == HttpStatusCode.NotFound,
                "Already-purged quote cannot be deleted twice");
        await using (var db = new NpgsqlConnection(connectionString))
        {
            await db.OpenAsync();
            await using var verify = new NpgsqlCommand("""
                SELECT
                    (SELECT COUNT(*) FROM public.official_quote_requests WHERE id = @id),
                    (SELECT COUNT(*) FROM public.official_quote_audit WHERE quote_id = @id),
                    (SELECT COUNT(*) FROM public.official_quote_client_submissions WHERE quote_id = @id),
                    (SELECT COUNT(*) FROM public.official_quote_purge_audit
                     WHERE quote_id = @id AND reason = 'Defectuosa' AND actor_user_id IS NOT NULL
                       AND submission_key = 'f8100000-0000-4000-8000-000000000015')
                """, db);
            verify.Parameters.AddWithValue("id", rejectedId);
            await using var reader = await verify.ExecuteReaderAsync();
            Assert(await reader.ReadAsync() &&
                reader.GetInt64(0) == 0 && reader.GetInt64(1) == 0 &&
                reader.GetInt64(2) == 0 && reader.GetInt64(3) == 1,
                "Deleted quote, audit and keyed FK; only random-key purge tombstone survives");
        }

        // A browser can retry the same UUID even after its original quote and
        // request digest have been erased. It must receive an explicit 409
        // before any fresh catalog lookups or outbound Dhole operations.
        using var replayFactory = factory.WithWebHostBuilder(host =>
            host.ConfigureAppConfiguration((_, cfg) => cfg.AddInMemoryCollection(
                new Dictionary<string, string?>
                {
                    ["DholeSubmission:ClientCreateIdempotencyEnabled"] = "true"
                })));
        using var replayClient = replayFactory.CreateClient(
            new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        foreach (var staleBody in new Dictionary<string, object?>[] {
            quote, new(quote) { ["contactName"] = "Changed stale retry" }
        })
        {
            using var stale = new HttpRequestMessage(HttpMethod.Post, "/api/quotes/official");
            stale.Headers.Add("X-CF-Quote-Request-Key", "f8100000-0000-4000-8000-000000000015");
            stale.Content = JsonContent.Create(staleBody);
            using var result = await replayClient.SendAsync(stale);
            Assert(result.StatusCode == HttpStatusCode.Conflict,
                "Purged request key must remain blocked for original and changed payloads");
            using var body = JsonDocument.Parse(await result.Content.ReadAsStringAsync());
            Assert(body.RootElement.GetProperty("code").GetString() == "quote_request_key_purged",
                "Deleted key has a stable conflict code and cannot create a new quote");
        }
        await using (var db = new NpgsqlConnection(connectionString))
        {
            await db.OpenAsync();
            await using var verify = new NpgsqlCommand(
                "SELECT COUNT(*) FROM public.official_quote_requests", db);
            Assert(Convert.ToInt64(await verify.ExecuteScalarAsync()) == 1,
                "Stale replay never creates a second quote after permanent deletion");
        }

        // NEW DIRECT FLOW: active quote -> cancelled with a reason -> immediate
        // irreversible deletion. No archive step, no wait, no actual Dhole POST.
        // New test submissions use the isolated purge host. The original
        // shared test host must retain its rate-limit budget for older tests.
        using var cancelResponse = await purgeClient.PostAsJsonAsync(
            "/api/quotes/official", quote);
        Assert(cancelResponse.StatusCode == HttpStatusCode.Created,
            "Independent fictional request created for direct cancellation");
        using var cancelJson = JsonDocument.Parse(await cancelResponse.Content.ReadAsStringAsync());
        var cancelId = cancelJson.RootElement.GetProperty("id").GetGuid();
        using (var prematurePurge = await Purge(cancelId, "authorizer", active: true))
            Assert(prematurePurge.StatusCode == HttpStatusCode.Conflict,
                "An active Received quote is protected from irreversible deletion");
        async Task<HttpResponseMessage> ReviewForCancellation(Guid id, string status, string? reason)
        {
            using var request = new HttpRequestMessage(HttpMethod.Put,
                $"/api/admin/quotes/official/{id}/review");
            request.Headers.Add("X-CI-Test-Actor", "authorizer");
            request.Content = JsonContent.Create(new { status, comment = reason });
            return await purgeClient.SendAsync(request);
        }
        using (var noReason = await ReviewForCancellation(cancelId, "Cancelled", null))
            Assert(noReason.StatusCode == HttpStatusCode.BadRequest,
                "Cancelling an administrative quote requires an auditable reason");
        using (var cancelled = await ReviewForCancellation(cancelId, "Cancelled",
            "Prueba defectuosa, sin despacho externo"))
            Assert(cancelled.StatusCode == HttpStatusCode.OK,
                "Admin can cancel only the independent local quote");
        Assert(await AuditCount(cancelId, "Cancelled") == 1,
            "Cancellation is audited separately from ordinary reviews");
        using (var reactivate = await ReviewForCancellation(cancelId, "Received",
            "Unexpected reopen"))
            Assert(reactivate.StatusCode == HttpStatusCode.Conflict,
                "Cancelled cannot be reactivated via stale admin tab");
        // Keep the original host's auth-rate-limit budget unchanged for
        // existing tests later in this suite; use the isolated purge host.
        using (var attemptAuthorization = new HttpRequestMessage(HttpMethod.Put,
            $"/api/admin/quotes/official/{cancelId}/authorization?decision=Authorized"))
        {
            attemptAuthorization.Headers.Add("X-CI-Test-Actor", "authorizer");
            using var authCancelled = await purgeClient.SendAsync(attemptAuthorization);
            Assert(authCancelled.StatusCode == HttpStatusCode.Conflict,
                "Cancelled must not authorize a new Dhole outbox");
        }
        using (var viewerPurgeActive = await Purge(cancelId, "viewer", active: true))
            Assert(viewerPurgeActive.StatusCode == HttpStatusCode.OK,
                "Any authenticated admin can permanently delete an eligible Cancelled quote");
        using (var repeatCancelled = await Purge(cancelId, "authorizer", active: true))
            Assert(repeatCancelled.StatusCode == HttpStatusCode.NotFound,
                "Direct purge cannot be repeated after tombstone commit");
        await using (var db = new NpgsqlConnection(connectionString))
        {
            await db.OpenAsync();
            await using var verifyCancel = new NpgsqlCommand("""
                SELECT (SELECT COUNT(*) FROM public.official_quote_requests WHERE id = @id),
                       (SELECT COUNT(*) FROM public.official_quote_audit WHERE quote_id = @id),
                       (SELECT COUNT(*) FROM public.official_quote_purge_audit
                        WHERE quote_id = @id AND reason = 'Prueba')
                """, db);
            verifyCancel.Parameters.AddWithValue("id", cancelId);
            await using var reader = await verifyCancel.ExecuteReaderAsync();
            Assert(await reader.ReadAsync() && reader.GetInt64(0)==0 &&
                reader.GetInt64(1)==0 && reader.GetInt64(2)==1,
                "Local quote content erased; only minimal audit tombstone retained");
        }

        // Another local quote may have a Dhole outbox even if it has not
        // attempted delivery yet. No admin may mark it Cancelled or purge it.
        using var linkedResponse = await purgeClient.PostAsJsonAsync(
            "/api/quotes/official", quote);
        Assert(linkedResponse.StatusCode == HttpStatusCode.Created,
            "Independent fictional request created for Dhole-link protection");
        using var linkedJson = JsonDocument.Parse(await linkedResponse.Content.ReadAsStringAsync());
        var linkedId = linkedJson.RootElement.GetProperty("id").GetGuid();
        await using (var db = new NpgsqlConnection(connectionString))
        {
            await db.OpenAsync();
            await using var link = new NpgsqlCommand(
                "INSERT INTO public.official_quote_dhole_outbox (quote_id) VALUES (@id)", db);
            link.Parameters.AddWithValue("id", linkedId);
            Assert(await link.ExecuteNonQueryAsync() == 1,
                "Insert fictitious pending Dhole relation in disposable PostgreSQL");
        }
        using (var protectedCancel = await ReviewForCancellation(linkedId, "Cancelled",
            "Prueba relacionada con Dhole"))
            Assert(protectedCancel.StatusCode == HttpStatusCode.Conflict,
                "Dhole relation blocks administrative cancellation before deleting");
        using (var protectedPurge = await Purge(linkedId, "authorizer", active: true))
            Assert(protectedPurge.StatusCode == HttpStatusCode.Conflict,
                "Dhole-linked quote cannot be purged while still Received");

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
        using (var protectedRemoval = await AdminRequest(HttpMethod.Delete,
            $"/api/admin/quotes/official/{createdId}", "authorizer"))
            Assert(protectedRemoval.StatusCode == HttpStatusCode.Conflict,
                "Quotes with approval outboxes must remain visible for reconciliation");
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
        // Use the second isolated host for BOTH creation and approvals.
        // The original helper uses the first host's normal rate-limit budget;
        // the new archive tests must not accidentally turn its 429 into a
        // false negative for the atomic 200/409 approval invariant.
        async Task<HttpResponseMessage> ConcurrentDecision()
        {
            using var request = new HttpRequestMessage(HttpMethod.Put,
                $"/api/admin/quotes/official/{simultaneousId}/authorization?decision=Authorized");
            request.Headers.Add("X-CI-Test-Actor", "authorizer");
            return await concurrencyClient.SendAsync(request);
        }
        var concurrent = await Task.WhenAll(
            ConcurrentDecision(), ConcurrentDecision());
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
        using (var unexpectedKey = new HttpRequestMessage(
            HttpMethod.Post, "/api/quotes/official") { Content = JsonContent.Create(quote) })
        {
            unexpectedKey.Headers.Add("X-CF-Quote-Request-Key", Guid.NewGuid().ToString("D"));
            using var blockedKey = await directClient.SendAsync(unexpectedKey);
            Assert(blockedKey.StatusCode == HttpStatusCode.ServiceUnavailable,
                "If key support was disabled between GET and POST, refuse rather than create duplicates");
        }
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
        foreach (var unsupportedCurrency in new[] { "ARS", "JPY", "usd", "XXX", "USD " })
        {
            using var unsupported = await directClient.PostAsJsonAsync(
                "/api/quotes/official", new Dictionary<string, object?>(quote)
                {
                    ["services"] = new[] { "Transporte internacional", "Seguro de carga" },
                    ["cargoValue"] = 1500,
                    ["cargoCurrencyCode"] = unsupportedCurrency
                });
            Assert(unsupported.StatusCode == HttpStatusCode.BadRequest,
                "Unsupported currency must be rejected before quote persistence");
        }
        using var directResponse = await directClient.PostAsJsonAsync("/api/quotes/official", quote);
        Assert(directResponse.StatusCode == HttpStatusCode.Created,
            "Direct opt-in creates one fictional quote and its outbox atomically");
        using var directReceipt = JsonDocument.Parse(await directResponse.Content.ReadAsStringAsync());
        var directId = directReceipt.RootElement.GetProperty("id").GetGuid();
        // Even with the approval flag off, direct outbox links block removal.
        using (var directRemove = await AdminRequest(HttpMethod.Delete,
            $"/api/admin/quotes/official/{directId}", "authorizer"))
            Assert(directRemove.StatusCode == HttpStatusCode.Conflict,
                "Direct Dhole outbox makes a quote non-removable from the inbox");
        Assert(directReceipt.RootElement.GetProperty("dholeDispatchState").GetString() == "PendingDispatch",
            "Creation returns pending state, never claims remote delivery");
        // Legacy administrator authorization must not become a hidden gate or
        // mutate direct submissions even if an old client invokes the API.
        using (var manualApproval = new HttpRequestMessage(
            HttpMethod.Put, $"/api/admin/quotes/official/{directId}/authorization?decision=Authorized"))
        {
            manualApproval.Headers.Add("X-CI-Test-Actor", "authorizer");
            using var directDecision = await directClient.SendAsync(manualApproval);
            Assert(directDecision.StatusCode == HttpStatusCode.Conflict,
                "Direct Dhole submission cannot require or accept legacy admin approval");
        }
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
        await using (var db = new AppDbContext(opts))
        {
            Assert(await DholeOfficialDispatchPass.RecordPreflightBlockAsync(db, directId,
                DholePreflightBlockReason.CatalogUnavailable, CancellationToken.None),
                "Record a controlled diagnostic for a pending, never-attempted job");
            Assert(!await DholeOfficialDispatchPass.RecordPreflightBlockAsync(db, directId,
                DholePreflightBlockReason.CatalogUnavailable, CancellationToken.None),
                "Repeated identical preflight diagnostics do not rewrite the row");
            var pending = await db.OfficialQuoteDholeCreationOutbox.AsNoTracking()
                .SingleAsync(x => x.QuoteId == directId);
            Assert(pending.State == "PendingDispatch" && pending.AttemptCount == 0 &&
                pending.LastErrorCode == "PreflightCatalogUnavailable" && pending.LastAttemptAtUtc == null,
                "Preflight reason is durable without reserving an attempt");
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
        await using (var db = new AppDbContext(opts))
        {
            Assert(!await DholeOfficialDispatchPass.RecordPreflightBlockAsync(db, directId,
                DholePreflightBlockReason.InvalidPayload, CancellationToken.None),
                "A preflight diagnostic cannot overwrite an already claimed row");
            var claimed = await db.OfficialQuoteDholeCreationOutbox.AsNoTracking()
                .SingleAsync(x => x.QuoteId == directId);
            Assert(claimed.State == "InFlight" && claimed.AttemptCount == 1 &&
                claimed.LastErrorCode == null,
                "A successful claim clears the obsolete preflight diagnostic");
        }
        // Isolated result recording: even a successful mock HTTP result is
        // never equivalent to a verified Pricing-created request.
        var outcomeFlags = new ConfigurationBuilder().AddInMemoryCollection(
            new Dictionary<string, string?>
            {
                ["DholeSubmission:DirectOutboxEnabled"] = "true",
                ["DholeSubmission:OutcomePreviewEnabled"] = "true"
            }).Build();
        var noOutcomeFlags = new ConfigurationBuilder().AddInMemoryCollection(
            new Dictionary<string, string?>
            {
                ["DholeSubmission:DirectOutboxEnabled"] = "true",
                ["DholeSubmission:OutcomePreviewEnabled"] = "false"
            }).Build();
        await using (var db = new AppDbContext(opts))
        {
            var gated = new DholeOfficialOutboxOutcomeService(noOutcomeFlags);
            Assert(!gated.Enabled &&
                !await gated.RecordAttemptOutcomeForOfflineReviewAsync(
                    db, directId, DholeDeliveryEvent.HttpAcceptedButUnverified,
                    CancellationToken.None),
                "Disabled result recorder makes no state changes");
        }
        var recorder = new DholeOfficialOutboxOutcomeService(outcomeFlags);
        await using (var db = new AppDbContext(opts))
        {
            var forbidden = false;
            try
            {
                await recorder.RecordAttemptOutcomeForOfflineReviewAsync(
                    db, directId, DholeDeliveryEvent.ManualConfirmInPricing,
                    CancellationToken.None);
            }
            catch (InvalidOperationException) { forbidden = true; }
            Assert(forbidden, "Automatic completion cannot mark remote quote Confirmed");
        }
        async Task<bool> RecordAcceptedOnce()
        {
            await using var scoped = new AppDbContext(opts);
            return await recorder.RecordAttemptOutcomeForOfflineReviewAsync(
                scoped, directId, DholeDeliveryEvent.HttpAcceptedButUnverified,
                CancellationToken.None);
        }
        var outcomes = await Task.WhenAll(RecordAcceptedOnce(), RecordAcceptedOnce());
        Assert(outcomes.Count(x => x) == 1 && outcomes.Count(x => !x) == 1,
            "Concurrent result recording allows exactly one state update");
        Assert(!await RecordAcceptedOnce(), "HTTP 2xx cannot re-complete an already recorded quote");
        await using (var db = new NpgsqlConnection(connectionString))
        {
            await db.OpenAsync();
            await using var result = new NpgsqlCommand("""
                SELECT state, attempt_count, last_error_code, external_reference,
                       verified_at_utc
                FROM public.official_quote_dhole_creation_outbox WHERE quote_id = @id
                """, db);
            result.Parameters.AddWithValue("id", directId);
            await using var row = await result.ExecuteReaderAsync();
            Assert(await row.ReadAsync() &&
                row.GetString(0) == "HttpAcceptedUnverified" &&
                row.GetInt32(1) == 1 &&
                row.IsDBNull(2) &&
                row.IsDBNull(3) && row.IsDBNull(4),
                "Accepted HTTP status is unverified and never fabricates a Pricing reference");
        }
        // Read-only diagnostic for future manual reconciliation. It cannot
        // confirm provider creation or authorize another automatic POST.
        var reconciliationFlags = new ConfigurationBuilder().AddInMemoryCollection(
            new Dictionary<string, string?>
            {
                ["DholeSubmission:DirectOutboxEnabled"] = "true",
                ["DholeSubmission:ReconciliationPreviewEnabled"] = "true"
            }).Build();
        var reconciliationDisabled = new ConfigurationBuilder().AddInMemoryCollection(
            new Dictionary<string, string?>
            {
                ["DholeSubmission:DirectOutboxEnabled"] = "true",
                ["DholeSubmission:ReconciliationPreviewEnabled"] = "false"
            }).Build();
        await using (var db = new AppDbContext(opts))
        {
            var disabledPreview = new DholeOfficialOutboxReconciliationPreview(reconciliationDisabled);
            Assert(!disabledPreview.Enabled &&
                await disabledPreview.PreviewAsync(db, directId, CancellationToken.None) is null,
                "Reconciliation cannot read optional table when preview flag is off");
        }
        var reconciliation = new DholeOfficialOutboxReconciliationPreview(reconciliationFlags);
        await using (var db = new AppDbContext(opts))
        {
            var review = await reconciliation.PreviewAsync(db, directId, CancellationToken.None);
            Assert(review is not null &&
                review.IdempotencyKey == "cf-official-" + directId.ToString("D") &&
                review.State == "HttpAcceptedUnverified" &&
                review.AttemptCount == 1 &&
                review.NextReviewAction == "VerifyProviderCreationInPricing" &&
                !review.LocalConfirmationRecorded &&
                !review.AutomaticRetryAllowed &&
                !review.DataIntegrityProblem,
                "Accepted HTTP requires independent Pricing verification; no retry");
            var absent = await reconciliation.PreviewAsync(db, Guid.NewGuid(), CancellationToken.None);
            Assert(absent is null, "Unknown quote has no preview, not a fake success");
        }
        await using (var db = new NpgsqlConnection(connectionString))
        {
            await db.OpenAsync();
            await using var unchanged = new NpgsqlCommand("""
                SELECT state, attempt_count, external_reference
                FROM public.official_quote_dhole_creation_outbox WHERE quote_id = @id
                """, db);
            unchanged.Parameters.AddWithValue("id", directId);
            await using var row = await unchanged.ExecuteReaderAsync();
            Assert(await row.ReadAsync() && row.GetString(0) == "HttpAcceptedUnverified" &&
                   row.GetInt32(1) == 1 && row.IsDBNull(2),
                "Read-only reconciliation preview makes no state or reference changes");
        }
        // New dispatcher-preparation path: first build a genuinely validated,
        // unsendable flat review for a separate fictional ADMIN quote. Claim
        // only this exact quote; no worker or network sender is registered.
        var reviewedId = Guid.NewGuid();
        var storedReviewForm = JsonSerializer.Serialize(quote);
        var reviewedRoute = new DholeValidatedRoute(
            "Puerto Seguro - POL", "Puerto Seguro - POE", "Puerto Seguro - POD");
        var reviewedInput = JsonSerializer.Deserialize<OfficialQuoteSubmit>(
            storedReviewForm, new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
        var reviewedDraft = DholeOfficialQuoteDraftBuilder.Project(
            reviewedInput, reviewedId, reviewedRoute);
        var resolved = new DholeOfficialCatalogResolution(
            DateTime.UtcNow,
            Guid.Parse("f1000000-0000-4000-8000-000000000001"), "CIF",
            [new DholeOfficialServiceResolution(
                "Transporte internacional", "INT_TRANSPORT",
                Guid.Parse("f2000000-0000-4000-8000-000000000001"), true)],
            [new DholeOfficialEquipmentResolution(
                "Fcl", "20 pies", "Dry Van",
                Guid.Parse("f3000000-0000-4000-8000-000000000001"),
                "20 Dry Van", "20DV", true)]);
        var reviewedFlat = DholeOfficialQuoteFlatPreviewBuilder.BuildReview(
            reviewedDraft, resolved, DateTime.UtcNow);
        Assert(reviewedFlat.ReadyForContractReview &&
            !reviewedFlat.RemoteSubmissionPermitted,
            "An offline flat review is complete but never authorizes a POST");
        await using (var db = new AppDbContext(opts))
        {
            db.OfficialQuotes.Add(new OfficialQuoteRequest
            {
                Id = reviewedId,
                CustomerName = "CI Dhole Test",
                ContactName = "CI Dhole Test",
                ContactEmail = "dhole-qa@example.invalid",
                ContactPhone = "+506 2222 2222",
                Mode = "Maritime", ShipmentType = "FCL",
                OriginName = reviewedRoute.OriginName,
                DestinationName = reviewedRoute.DestinationName,
                FormJson = storedReviewForm
            });
            // EF has no navigation relationship between the optional tables;
            // persist the fictional ADMIN parent first to satisfy its FK.
            await db.SaveChangesAsync();
            db.OfficialQuoteDholeCreationOutbox.Add(
                new OfficialQuoteDholeCreationOutbox
                {
                    QuoteId = reviewedId,
                    IdempotencyKey = reviewedFlat.IdempotencyKey,
                    State = "PendingDispatch"
                });
            await db.SaveChangesAsync();
        }
        await using (var db = new AppDbContext(opts))
        {
            Assert(await claimer.ClaimReviewedQuoteForOfflineReviewAsync(
                db, reviewedFlat with { BlockingIssues = ["cargoValue: unresolved currency"] },
                CancellationToken.None) is null,
                "Unresolved contract blockers must prevent even an offline claim");
            Assert(await claimer.ClaimReviewedQuoteForOfflineReviewAsync(
                db, reviewedFlat with {
                    Body = JsonSerializer.SerializeToElement(new { priority = "Green" }) },
                CancellationToken.None) is null,
                "A JSON shell is never a valid Dhole payload or permission to claim");
            Assert(await claimer.ClaimReviewedQuoteForOfflineReviewAsync(
                db, reviewedFlat with { IdempotencyKey = "cf-official-" + Guid.NewGuid().ToString("D") },
                CancellationToken.None) is null,
                "A mismatched idempotency key must never claim a different quote");
            Assert(await claimer.ClaimReviewedQuoteForOfflineReviewAsync(
                db, reviewedFlat with { OfficialQuoteId = Guid.NewGuid() },
                CancellationToken.None) is null,
                "A mismatched review identity never claims an outbox row");
            var disabledReviewedClaim = new DholeOfficialOutboxClaimService(disabledFlags);
            Assert(await disabledReviewedClaim.ClaimReviewedQuoteForOfflineReviewAsync(
                db, reviewedFlat, CancellationToken.None) is null,
                "Default-off claim cannot mutate even a fully reviewed quote");
        }
        async Task<Guid?> ClaimReviewedOnce()
        {
            await using var db = new AppDbContext(opts);
            return await claimer.ClaimReviewedQuoteForOfflineReviewAsync(
                db, reviewedFlat, CancellationToken.None);
        }
        var reviewedClaims = await Task.WhenAll(ClaimReviewedOnce(), ClaimReviewedOnce());
        Assert(reviewedClaims.Count(x => x == reviewedId) == 1 &&
            reviewedClaims.Count(x => x is null) == 1,
            "Two concurrent reviewed claimers can claim the selected quote exactly once");
        Assert(await ClaimReviewedOnce() is null,
            "Reviewed quote cannot be reclaimed once InFlight");
        await using (var conn = new NpgsqlConnection(connectionString))
        {
            await conn.OpenAsync();
            await using var query = new NpgsqlCommand("""
                SELECT state, attempt_count, last_attempt_at_utc,
                       external_reference, verified_at_utc
                FROM public.official_quote_dhole_creation_outbox
                WHERE quote_id = @quote
                """, conn);
            query.Parameters.AddWithValue("quote", reviewedId);
            await using var reader = await query.ExecuteReaderAsync();
            Assert(await reader.ReadAsync() &&
                reader.GetString(0) == "InFlight" &&
                reader.GetInt32(1) == 1 &&
                !reader.IsDBNull(2) && reader.IsDBNull(3) && reader.IsDBNull(4),
                "Offline reviewed claim persists exactly one attempt and no fictitious Pricing receipt");
        }
        Console.WriteLine("PASS: scoped offline dispatcher claim refuses blockers, duplicate claims and false Pricing confirmation.");

        // Full one-shot composition is intentionally NOT registered in Program:
        // use a strict in-process fake for its only outbound HTTP client.
        var coordinatorQuoteId = Guid.NewGuid();
        var coordinatorDraft = DholeOfficialQuoteDraftBuilder.Project(
            reviewedInput, coordinatorQuoteId, reviewedRoute);
        var coordinatorFlat = DholeOfficialQuoteFlatPreviewBuilder.BuildReview(
            coordinatorDraft, resolved, DateTime.UtcNow);
        await using (var db = new AppDbContext(opts))
        {
            db.OfficialQuotes.Add(new OfficialQuoteRequest
            {
                Id = coordinatorQuoteId,
                CustomerName = "CI Dhole Test",
                ContactName = "CI Dhole Test",
                ContactEmail = "dhole-qa@example.invalid",
                ContactPhone = "+506 2222 2222",
                Mode = "Maritime", ShipmentType = "FCL",
                OriginName = reviewedRoute.OriginName,
                DestinationName = reviewedRoute.DestinationName,
                FormJson = storedReviewForm
            });
            await db.SaveChangesAsync();
            db.OfficialQuoteDholeCreationOutbox.Add(
                new OfficialQuoteDholeCreationOutbox
                {
                    QuoteId = coordinatorQuoteId,
                    IdempotencyKey = coordinatorFlat.IdempotencyKey,
                    State = "PendingDispatch"
                });
            await db.SaveChangesAsync();
        }
        var fictionalPostKey = "dh_ext_" + new string('a', 64);
        var fakePost = new CiFakeDholeQuotePostHandler(fictionalPostKey, coordinatorQuoteId);
        var fakePostFactory = new CiFakeDholeQuotePostFactory(fakePost);
        IConfiguration CoordinatorConfig(bool enabled) =>
            new ConfigurationBuilder().AddInMemoryCollection(
                new Dictionary<string, string?>
                {
                    ["DholeSubmission:DirectOutboxEnabled"] = "true",
                    ["DholeSubmission:ClaimPreviewEnabled"] = "true",
                    ["DholeSubmission:OutcomePreviewEnabled"] = "true",
                    ["DholeSubmission:PostEnabled"] = "true",
                    ["DholeSubmission:DispatcherEnabled"] = enabled.ToString(),
                    ["DholeSubmission:ApiKey"] = fictionalPostKey
                }).Build();
        DholeOfficialDispatchAttemptCoordinator Coordinator(IConfiguration cfg) =>
            new(cfg, new DholeOfficialOutboxClaimService(cfg),
                new DholeOfficialOutboxOutcomeService(cfg),
                new DholeQuotePostTransport(cfg, fakePostFactory));
        await using (var db = new AppDbContext(opts))
        {
            var disarmed = Coordinator(CoordinatorConfig(false));
            var off = await disarmed.AttemptOnceAsync(
                db, coordinatorFlat, CancellationToken.None);
            Assert(off.State == "Disabled" && !off.Claimed && fakePost.Calls == 0,
                "Dispatcher opt-in disabled: zero database changes and zero HTTP, even fake");
        }
        var coordinator = Coordinator(CoordinatorConfig(true));
        await using (var db = new AppDbContext(opts))
        {
            var sent = await coordinator.AttemptOnceAsync(
                db, coordinatorFlat, CancellationToken.None);
            Assert(sent.Claimed && sent.State == "HttpAcceptedUnverified" &&
                sent.ProviderReferenceCandidate == Guid.Parse("f8000000-0000-4000-8000-000000000001") &&
                sent.TransportAcceptedLocally && !sent.RemoteCreationConfirmed &&
                !sent.AutomaticRetryAllowed && fakePost.Calls == 1,
                "Mock HTTP 200 only proves accepted transport, never Pricing creation");
            var duplicate = await coordinator.AttemptOnceAsync(
                db, coordinatorFlat, CancellationToken.None);
            Assert(duplicate.State == "AlreadyClaimedOrInvalid" &&
                !duplicate.Claimed && fakePost.Calls == 1,
                "Completed attempt cannot issue a second fake POST");
        }
        await using (var db = new NpgsqlConnection(connectionString))
        {
            await db.OpenAsync();
            await using var state = new NpgsqlCommand("""
                SELECT state, attempt_count, external_reference, verified_at_utc, provider_reference_candidate
                FROM public.official_quote_dhole_creation_outbox
                WHERE quote_id = @id
                """, db);
            state.Parameters.AddWithValue("id", coordinatorQuoteId);
            await using var row = await state.ExecuteReaderAsync();
            Assert(await row.ReadAsync() &&
                row.GetString(0) == "HttpAcceptedUnverified" &&
                row.GetInt32(1) == 1 &&
                row.IsDBNull(2) && row.IsDBNull(3) &&
                row.GetGuid(4) == Guid.Parse("f8000000-0000-4000-8000-000000000001"),
                "Gateway receipt is retained separately, without confirmation or another attempt");
        }
        Console.WriteLine("PASS: dormant one-shot coordinator uses fake-only HTTP, keeps 2xx unverified and refuses replay.");

        // The offline result state and claim are isolated and cannot dispatch HTTP.
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

        // Independent, default-OFF quote-creation idempotency gate.
        // New host only; tests never enable it in a production environment.
        using var idempotentFactory = factory.WithWebHostBuilder(host =>
            host.ConfigureAppConfiguration((_, cfg) => cfg.AddInMemoryCollection(
                new Dictionary<string, string?>
                {
                    ["DholeSubmission:DirectOutboxEnabled"] = "true",
                    ["DholeSubmission:ClientCreateIdempotencyEnabled"] = "true",
                    ["DholeSubmission:ApprovalQueueEnabled"] = "false"
                })));
        using var idempotentClient = idempotentFactory.CreateClient(
            new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        using (var capability = await idempotentClient.GetAsync(
            "/api/quotes/official/dhole-options?mode=Maritime&shipmentType=FCL"))
        {
            Assert(capability.StatusCode == HttpStatusCode.OK,
                "Explicit dedup rollout still returns Dhole catalogue choices");
            using var advertised = JsonDocument.Parse(await capability.Content.ReadAsStringAsync());
            Assert(advertised.RootElement.GetProperty("clientCreateIdempotencyEnabled").GetBoolean(),
                "Creation-key support must be truthfully advertised to both quote clients");
        }
        async Task<HttpResponseMessage> CreateWithClientKey(
            Guid? key, Dictionary<string, object?> body)
        {
            using var request = new HttpRequestMessage(
                HttpMethod.Post, "/api/quotes/official") {
                Content = JsonContent.Create(body)
            };
            if (key.HasValue)
                request.Headers.Add("X-CF-Quote-Request-Key", key.Value.ToString("D"));
            return await idempotentClient.SendAsync(request);
        }
        using (var missing = await CreateWithClientKey(null, quote))
            Assert(missing.StatusCode == HttpStatusCode.BadRequest,
                "Opted-in submission requires a nonempty client request key");
        using (var malformed = await CreateWithClientKey(Guid.Empty, quote))
            Assert(malformed.StatusCode == HttpStatusCode.BadRequest,
                "Empty client request keys cannot bypass creation uniqueness");
        using (var weak = await CreateWithClientKey(
            Guid.Parse("11111111-1111-1111-8111-111111111111"), quote))
            Assert(weak.StatusCode == HttpStatusCode.BadRequest,
                "Predictable non-v4 request keys cannot be used to retrieve receipts");

        var firstKey = Guid.NewGuid();
        Guid idempotentId;
        using (var first = await CreateWithClientKey(firstKey, quote))
        {
            Assert(first.StatusCode == HttpStatusCode.Created,
                "First valid keyed request creates an original official quote");
            using var json = JsonDocument.Parse(await first.Content.ReadAsStringAsync());
            idempotentId = json.RootElement.GetProperty("id").GetGuid();
        }
        // The public status route is a receipt capability, not an ID-only lookup.
        async Task<HttpResponseMessage> ReadDelivery(Guid? key)
        {
            using var request = new HttpRequestMessage(HttpMethod.Get,
                "/api/quotes/official/" + idempotentId.ToString("D") + "/delivery-status");
            if (key.HasValue)
                request.Headers.Add("X-CF-Quote-Request-Key", key.Value.ToString("D"));
            return await idempotentClient.SendAsync(request);
        }
        using (var absent = await ReadDelivery(null))
            Assert(absent.StatusCode == HttpStatusCode.NotFound, "Quote ID alone is not a receipt capability");
        using (var wrong = await ReadDelivery(Guid.NewGuid()))
            Assert(wrong.StatusCode == HttpStatusCode.NotFound, "A different quote key cannot read this receipt");
        using (var status = await ReadDelivery(firstKey))
        {
            Assert(status.StatusCode == HttpStatusCode.OK, "Original quote receipt is readable");
            using var json = JsonDocument.Parse(await status.Content.ReadAsStringAsync());
            Assert(json.RootElement.EnumerateObject().Count() == 1 &&
                json.RootElement.GetProperty("dholeDispatchState").GetString() == "PendingDispatch",
                "Pending receipt has no personal data and does not claim remote success");
        }
        using (var replay = await CreateWithClientKey(firstKey, quote))
        {
            Assert(replay.StatusCode == HttpStatusCode.Created,
                "Lost receipt can be replayed with the exact same random key");
            using var json = JsonDocument.Parse(await replay.Content.ReadAsStringAsync());
            Assert(json.RootElement.GetProperty("id").GetGuid() == idempotentId &&
                json.RootElement.GetProperty("idempotentReplay").GetBoolean(),
                "Repeat returns original ID, never a new quote or outbox");
        }
        using (var changed = await CreateWithClientKey(firstKey,
            new Dictionary<string, object?>(quote) {
                ["cargoDescription"] = "Changed cargo must not reuse the previous key"
            }))
            Assert(changed.StatusCode == HttpStatusCode.Conflict,
                "Same key with different cargo cannot replace an earlier submission");
        // Simulate an outage or paused catalog rollout AFTER a quote was saved.
        // The exact keyed replay must still return its original receipt,
        // without requesting any live Dhole GET catalog or creating a second job.
        using (var catalogOfflineFactory = factory.WithWebHostBuilder(host =>
            host.ConfigureAppConfiguration((_, cfg) => cfg.AddInMemoryCollection(
                new Dictionary<string, string?>
                {
                    ["DholeCatalogs:FormEnabled"] = "false",
                    ["DholeSubmission:DirectOutboxEnabled"] = "true",
                    ["DholeSubmission:ClientCreateIdempotencyEnabled"] = "true",
                    ["DholeSubmission:ApprovalQueueEnabled"] = "false"
                }))))
        using (var offlineClient = catalogOfflineFactory.CreateClient(
            new WebApplicationFactoryClientOptions { AllowAutoRedirect = false }))
        {
            using var previous = new HttpRequestMessage(
                HttpMethod.Post, "/api/quotes/official") { Content = JsonContent.Create(quote) };
            previous.Headers.Add("X-CF-Quote-Request-Key", firstKey.ToString("D"));
            using var replayOffline = await offlineClient.SendAsync(previous);
            Assert(replayOffline.StatusCode == HttpStatusCode.Created,
                "Exact previous quote can be recovered while live catalogs are disabled");
            using var recovery = JsonDocument.Parse(await replayOffline.Content.ReadAsStringAsync());
            Assert(recovery.RootElement.GetProperty("id").GetGuid() == idempotentId &&
                recovery.RootElement.GetProperty("idempotentReplay").GetBoolean(),
                "Catalog outage replay gives the original request only");
            using var fresh = new HttpRequestMessage(
                HttpMethod.Post, "/api/quotes/official") { Content = JsonContent.Create(quote) };
            fresh.Headers.Add("X-CF-Quote-Request-Key", Guid.NewGuid().ToString("D"));
            using var blockedNew = await offlineClient.SendAsync(fresh);
            Assert(blockedNew.StatusCode == HttpStatusCode.ServiceUnavailable,
                "A catalog outage must still prevent NEW quote creation");
        }

        var raceKey = Guid.NewGuid();
        var parallel = await Task.WhenAll(
            CreateWithClientKey(raceKey, quote),
            CreateWithClientKey(raceKey, quote));
        Guid? raceResultId = null;
        foreach (var result in parallel)
        {
            using (result)
            {
                Assert(result.StatusCode == HttpStatusCode.Created,
                    "Two concurrent requests with same key must share an existing receipt");
                using var json = JsonDocument.Parse(await result.Content.ReadAsStringAsync());
                var receivedId = json.RootElement.GetProperty("id").GetGuid();
                Assert(raceResultId is null || raceResultId == receivedId,
                    "Race must not generate different official quote IDs");
                raceResultId = receivedId;
            }
        }
        await using (var db = new NpgsqlConnection(connectionString))
        {
            await db.OpenAsync();
            await using var query = new NpgsqlCommand("""
                SELECT q.id, s.request_digest, count(o.quote_id)
                FROM public.official_quote_client_submissions s
                JOIN public.official_quote_requests q ON q.id = s.quote_id
                LEFT JOIN public.official_quote_dhole_creation_outbox o ON o.quote_id = q.id
                WHERE s.submission_key = @key
                GROUP BY q.id, s.request_digest
                """, db);
            query.Parameters.AddWithValue("key", firstKey);
            await using var row = await query.ExecuteReaderAsync();
            Assert(await row.ReadAsync() && row.GetGuid(0) == idempotentId &&
                   row.GetString(1).Length == 64 && row.GetInt64(2) == 1 &&
                   !await row.ReadAsync(),
                "Exactly one quote with a SHA256 digest and one delivery job per client key");
        }
        await using (var db = new NpgsqlConnection(connectionString))
        {
            await db.OpenAsync();
            await using var query = new NpgsqlCommand("""
                SELECT count(*) FROM public.official_quote_client_submissions
                WHERE submission_key = @key
                """, db);
            query.Parameters.AddWithValue("key", raceKey);
            Assert(Convert.ToInt64(await query.ExecuteScalarAsync()) == 1,
                "Concurrent keyed requests persist exactly one official quote");
        }

        // Exercise the new notification path on one fictional row. A real
        // Pricing request is never created: the isolated DB and mock GET prove
        // the transition and the exact same Graph handler counts one email.
        var receiptReference = Guid.Parse("f8100000-0000-4000-8000-000000000001");
        await using (var db = new NpgsqlConnection(connectionString))
        {
            await db.OpenAsync();
            await using var seed = new NpgsqlCommand("""
                UPDATE public.official_quote_dhole_creation_outbox
                SET state = 'HttpAcceptedUnverified', attempt_count = 1,
                    last_attempt_at_utc = now(), provider_reference_candidate = @reference
                WHERE quote_id = @id
                """, db);
            seed.Parameters.AddWithValue("id", idempotentId);
            seed.Parameters.AddWithValue("reference", receiptReference);
            Assert(await seed.ExecuteNonQueryAsync() == 1, "Seed only the isolated fake receipt");
        }
        // A default host must not schedule an outbound worker. Scope can be
        // prepared locally with a single synthetic quote ID, never enabled in CI.
        Assert(DholeOfficialWorkerScope.Read(new ConfigurationBuilder().Build()) is null,
            "Default configuration cannot schedule any Dhole dispatch");
        var scopeConfig = new ConfigurationBuilder().AddInMemoryCollection(
            new Dictionary<string, string?>
            {
                ["DholeSubmission:WorkerEnabled"] = "true",
                ["DholeSubmission:ApplicantContactSharingApproved"] = "true",
                ["DholeSubmission:ClientCreateIdempotencyEnabled"] = "true",
                ["DholeSubmission:PilotQuoteId"] = idempotentId.ToString("D")
            }).Build();
        Assert(DholeOfficialWorkerScope.Read(scopeConfig)?.PilotQuoteId == idempotentId,
            "Pilot scope is restricted to its exact quote");
        scopeConfig["DholeSubmission:AllNewQuotesEnabled"] = "true";
        Assert(DholeOfficialWorkerScope.Read(scopeConfig) is null,
            "Conflicting pilot and broad scope is rejected");
        // Pricing dispatch must not depend on Graph credentials or on a
        // catalog used only by another mode. All original rollout and evidence
        // gates remain mandatory. No actual worker or network is started here.
        var dispatchGateConfig = new ConfigurationBuilder().AddInMemoryCollection(
            new Dictionary<string, string?>
            {
                ["Features:OfficialQuotesEnabled"] = "true",
                ["DholeCatalogs:FormEnabled"] = "true",
                ["DholeCatalogs:SubmissionEnabled"] = "true"
            }).Build();
        Assert(DholeOfficialDispatchWorker.CanDispatchNewQuotes(dispatchGateConfig, true, true),
            "Pricing dispatch gate remains open without Graph or unrelated catalog configuration");
        Assert(!DholeOfficialDispatchWorker.CanDispatchNewQuotes(dispatchGateConfig, false, true) &&
            !DholeOfficialDispatchWorker.CanDispatchNewQuotes(dispatchGateConfig, true, false),
            "Missing dispatch authorization or receipt evidence still blocks POST");
        foreach (var gate in new[] { "Features:OfficialQuotesEnabled",
            "DholeCatalogs:FormEnabled", "DholeCatalogs:SubmissionEnabled" })
        {
            dispatchGateConfig[gate] = "false";
            Assert(!DholeOfficialDispatchWorker.CanDispatchNewQuotes(dispatchGateConfig, true, true),
                "Disabled rollout gate blocks dispatch: " + gate);
            dispatchGateConfig[gate] = "true";
        }
        var notifyConfig = new ConfigurationBuilder().AddInMemoryCollection(
            new Dictionary<string, string?>
            {
                ["DholeSubmission:DirectOutboxEnabled"] = "true",
                ["DholeSubmission:VerificationEnabled"] = "true",
                ["DholeSubmission:VerificationPath"] = "api/external/v1/ci-fake-verification",
                ["DholeSubmission:VerificationApiKey"] = "dh_ext_" + new string('b', 64),
                ["DholeSubmission:ConfirmationEmailEnabled"] = "true",
                ["Email:Mode"] = "Graph",
                ["Graph:TenantId"] = "f8200000-0000-4000-8000-000000000001",
                ["Graph:ClientId"] = "f8200000-0000-4000-8000-000000000002",
                ["Graph:ClientSecret"] = "ci-fictional",
                ["Graph:From"] = "sender@example.invalid"
            }).Build();
        var fakeNotification = new CiFakeReceiptNotificationHandler(receiptReference);
        using var notificationHttp = new HttpClient(fakeNotification);
        var verifier = new DholeOfficialPricingVerification(notifyConfig,
            new CiFakeReceiptNotificationFactory(notificationHttp));
        var notifier = new DholeOfficialConfirmationEmail(notifyConfig,
            new GraphEmailSender(notificationHttp, notifyConfig));
        await using (var db = new AppDbContext(opts))
        {
            Assert(await notifier.RunAsync(db, CancellationToken.None) == 0 &&
                fakeNotification.MailCalls == 0, "Unverified receipt cannot send a confirmation email");
            Assert(await verifier.VerifyAsync(db, idempotentId, CancellationToken.None),
                "Matching independent fake GET confirms exactly the stored receipt");
            Assert(!await verifier.VerifyAsync(db, idempotentId, CancellationToken.None) &&
                fakeNotification.VerificationCalls == 1, "Confirmation is not repeated");
            Assert(await notifier.RunAsync(db, CancellationToken.None) == 1 &&
                await notifier.RunAsync(db, CancellationToken.None) == 0 &&
                fakeNotification.MailCalls == 1, "Exactly one mock email after confirmed receipt");
        }
        using (var status = await ReadDelivery(firstKey))
        {
            using var json = JsonDocument.Parse(await status.Content.ReadAsStringAsync());
            Assert(status.StatusCode == HttpStatusCode.OK &&
                json.RootElement.GetProperty("dholeDispatchState").GetString() == "Confirmed",
                "Same receipt reports confirmed creation after independent fake verification");
        }

        // Temporary POST-receipt policy: no independent GET needed, but no
        // retroactive promotion of a previously recorded ambiguous receipt.
        var temporaryKey = Guid.NewGuid();
        Guid temporaryId;
        using (var created = await CreateWithClientKey(temporaryKey, quote))
        {
            Assert(created.StatusCode == HttpStatusCode.Created, "Temporary-policy quote saved");
            using var json = JsonDocument.Parse(await created.Content.ReadAsStringAsync());
            temporaryId = json.RootElement.GetProperty("id").GetGuid();
        }
        await using (var db = new NpgsqlConnection(connectionString))
        {
            await db.OpenAsync();
            await using var seed = new NpgsqlCommand("""
                UPDATE public.official_quote_dhole_creation_outbox
                SET state='InFlight', attempt_count=1, last_attempt_at_utc=now()
                WHERE quote_id=@id
                """, db);
            seed.Parameters.AddWithValue("id", temporaryId);
            Assert(await seed.ExecuteNonQueryAsync() == 1, "Isolated mock attempt");
        }
        notifyConfig["DholeSubmission:VerificationEnabled"] = "false";
        notifyConfig["DholeSubmission:AcceptCreationReceiptEnabled"] = "true";
        notifyConfig["DholeSubmission:OutcomePreviewEnabled"] = "true";
        var temporaryRecorder = new DholeOfficialOutboxOutcomeService(notifyConfig);
        var tempReference = Guid.Parse("f8100000-0000-4000-8000-000000000002");
        await using (var db = new AppDbContext(opts))
        {
            Assert(temporaryRecorder.AcceptCreationReceipt &&
                await temporaryRecorder.RecordAttemptOutcomeForOfflineReviewAsync(db, temporaryId,
                    DholeDeliveryEvent.HttpAcceptedButUnverified, CancellationToken.None, tempReference),
                "New valid creation receipt is recorded without independent verification");
            var saved = await db.OfficialQuoteDholeCreationOutbox.AsNoTracking()
                .SingleAsync(x => x.QuoteId == temporaryId);
            Assert(saved.State == "HttpAcceptedUnverified" &&
                saved.CreationReceiptAcceptedAtUtc != null &&
                saved.VerifiedAtUtc == null && saved.ExternalReference == null,
                "Creation evidence never masquerades as independent verification");
            var pilotScope = new DholeOfficialWorkerScope(temporaryId, null);
            notifyConfig["Graph:ClientSecret"] = "";
            Assert(!notifier.Enabled &&
                await notifier.RunAsync(db, CancellationToken.None, pilotScope) == 0,
                "Missing Graph configuration defers notification without discarding the accepted receipt");
            var deferred = await db.OfficialQuoteDholeCreationOutbox.AsNoTracking()
                .SingleAsync(x => x.QuoteId == temporaryId);
            Assert(deferred.CreationReceiptAcceptedAtUtc != null &&
                deferred.ConfirmationEmailClaimedAtUtc == null && deferred.AttemptCount == 1,
                "Deferred notification leaves the accepted Pricing attempt untouched and claimable");
            notifyConfig["Graph:ClientSecret"] = "ci-fictional";
            Assert(await notifier.RunAsync(db, CancellationToken.None, pilotScope) == 1 &&
                await notifier.RunAsync(db, CancellationToken.None, pilotScope) == 0 &&
                fakeNotification.MailCalls == 2 &&
                fakeNotification.VerificationCalls == 1,
                "One additional mock email, no additional verification GET");
        }
        using (var request = new HttpRequestMessage(HttpMethod.Get,
            "/api/quotes/official/" + temporaryId.ToString("D") + "/delivery-status"))
        {
            request.Headers.Add("X-CF-Quote-Request-Key", temporaryKey.ToString("D"));
            using var status = await idempotentClient.SendAsync(request);
            using var json = JsonDocument.Parse(await status.Content.ReadAsStringAsync());
            Assert(status.StatusCode == HttpStatusCode.OK &&
                json.RootElement.GetProperty("dholeDispatchState").GetString() == "AcceptedByProvider",
                "Customer success from valid authorized creation receipt");
        }

        // Force a DB constraint failure during a keyed transaction. The
        // official copy and the client key must BOTH roll back so that the same
        // key can safely be used after the isolated DB fault is removed.
        var recoverableKey = Guid.NewGuid();
        await using (var db = new NpgsqlConnection(connectionString))
        {
            await db.OpenAsync();
            await using var block = new NpgsqlCommand("""
                ALTER TABLE public.official_quote_dhole_creation_outbox
                    ADD CONSTRAINT ck_ci_dedup_rollback CHECK (state <> 'PendingDispatch') NOT VALID
                """, db);
            await block.ExecuteNonQueryAsync();
        }
        try
        {
            using var failed = await CreateWithClientKey(recoverableKey, quote);
            Assert(failed.StatusCode == HttpStatusCode.InternalServerError,
                "Outbox error in keyed request prevents issuing an incorrect receipt");
            await using var db = new NpgsqlConnection(connectionString);
            await db.OpenAsync();
            await using var probe = new NpgsqlCommand("""
                SELECT COUNT(*) FROM public.official_quote_client_submissions
                WHERE submission_key = @key
                """, db);
            probe.Parameters.AddWithValue("key", recoverableKey);
            Assert(Convert.ToInt64(await probe.ExecuteScalarAsync()) == 0,
                "Failed outbox insert rolls back keyed official quote as well");
        }
        finally
        {
            await using var db = new NpgsqlConnection(connectionString);
            await db.OpenAsync();
            await using var unblock = new NpgsqlCommand("""
                ALTER TABLE public.official_quote_dhole_creation_outbox
                    DROP CONSTRAINT IF EXISTS ck_ci_dedup_rollback
                """, db);
            await unblock.ExecuteNonQueryAsync();
        }
        using (var recovered = await CreateWithClientKey(recoverableKey, quote))
            Assert(recovered.StatusCode == HttpStatusCode.Created,
                "Exact keyed retry after proven rollback creates original quote once");

        // GIO adds a fixed uncertainty note to the applicant's observations.
        // Use a separate TestServer rate-limit bucket, no production traffic.
        using (var observationFactory = factory.WithWebHostBuilder(_ => { }))
        using (var observationClient = observationFactory.CreateClient(
            new WebApplicationFactoryClientOptions { AllowAutoRedirect = false }))
        {
            const string prefix = "La peligrosidad de la carga está pendiente de confirmar.\n";
            var maxNotes = new string('n', 4000);
            foreach (var tooLong in new[] { maxNotes + "x", prefix + maxNotes + "x" })
            {
                using var invalid = await observationClient.PostAsJsonAsync("/api/quotes/official",
                    new Dictionary<string, object?>(quote) { ["observations"] = tooLong });
                Assert(invalid.StatusCode == HttpStatusCode.BadRequest,
                    "Ordinary observations and uncertainty-prefixed applicant text retain the 4000-character limit");
            }
            using var accepted = await observationClient.PostAsJsonAsync("/api/quotes/official",
                new Dictionary<string, object?>(quote) { ["observations"] = prefix + maxNotes });
            Assert(accepted.StatusCode == HttpStatusCode.Created,
                "GIO's fixed uncertainty metadata must not consume the user's observation budget");
            using var responseJson = JsonDocument.Parse(await accepted.Content.ReadAsStringAsync());
            var notesId = responseJson.RootElement.GetProperty("id").GetGuid();
            await using var db = new AppDbContext(opts);
            var saved = await db.OfficialQuotes.AsNoTracking().SingleAsync(x => x.Id == notesId);
            using var savedForm = JsonDocument.Parse(saved.FormJson);
            Assert(savedForm.RootElement.GetProperty("observations").GetString() == prefix + maxNotes,
                "Persist the full applicant text and uncertainty note without truncation");
            var restored = JsonSerializer.Deserialize<OfficialQuoteSubmit>(saved.FormJson,
                new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
            var reviewDraft = DholeOfficialQuoteDraftBuilder.Project(restored, notesId,
                new DholeValidatedRoute(saved.OriginName, saved.DestinationName,
                    savedForm.RootElement.GetProperty("verifiedPodName").GetString()));
            Assert(reviewDraft.Observations == prefix + maxNotes && !reviewDraft.DangerousCargo,
                "Uncertainty remains a note and is not silently promoted to dangerous cargo");
        }
        Assert(handler.Requests > 0 && handler.ForbiddenRequests == 0,
            "All Dhole traffic was fake HTTPS GET and used the fictional key");
        Console.WriteLine("PASS: legacy quote created with optional client key table missing");
        Console.WriteLine("PASS: HTTP 201 + real isolated PostgreSQL row + external UUID persistence");
        Console.WriteLine("PASS: malformed roles, inactive Incoterm, invented equipment and local bypass rejected");
        Console.WriteLine("PASS: permission denied / rejected / approved / duplicate / concurrent approval");
        Console.WriteLine("PASS: approved Green default, admin-only Yellow/Red priority persisted; zero external POST");
        Console.WriteLine("PASS: each approval stages exactly once; outbox attempts zero, no external POST");
        Console.WriteLine("PASS: direct creation outbox independent; atomic save/rollback, unique key and admin visibility");
        Console.WriteLine("PASS: two concurrent DB claimers select one job, no retry, no remote HTTP");
        Console.WriteLine("PASS: offline outcomes record exactly once and never claim verified creation");
        Console.WriteLine("PASS: disabled-by-default reconciliation flags accepted HTTP as unverified; zero retries");
        Console.WriteLine("PASS: opt-in quote creation deduplication returns one ID and outbox across replays/races");
        Console.WriteLine("PASS: exact retry remains recoverable through catalog outage; new creations fail closed");
        Console.WriteLine("PASS: failed keyed transaction rolls back both quote and outbox and accepts same-key recovery");
        Console.WriteLine("PASS: all Dhole upstream traffic simulated; no real API, no mail, no production data");
    }
}

// Strictly fake sender for the CI-only coordinator. Production never registers
// this factory and no test sends HTTP to a real Pricing/Gateway service.
sealed class CiFakeReceiptNotificationFactory(HttpClient client) : IHttpClientFactory
{
    public HttpClient CreateClient(string name) => name == "DholeQuoteVerification"
        ? client : throw new InvalidOperationException("Unexpected fake notification client");
}
sealed class CiFakeReceiptNotificationHandler(Guid reference) : HttpMessageHandler
{
    public int VerificationCalls { get; private set; }
    public int MailCalls { get; private set; }
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        var uri = request.RequestUri!;
        if (request.Method == HttpMethod.Get &&
            uri.ToString() == "https://api.logisticacastrofallas.com/api/external/v1/ci-fake-verification/" + reference.ToString("D") &&
            request.Headers.TryGetValues("X-Api-Key", out var keys) &&
            keys.SingleOrDefault() == "dh_ext_" + new string('b', 64))
        {
            VerificationCalls++;
            return new HttpResponseMessage(HttpStatusCode.OK) {
                Content = JsonContent.Create(new { id = reference, status = "Open" })
            };
        }
        if (request.Method == HttpMethod.Post && uri.Host == "login.microsoftonline.com")
            return new HttpResponseMessage(HttpStatusCode.OK) {
                Content = JsonContent.Create(new { access_token = "fake-ci-graph-token" })
            };
        if (request.Method == HttpMethod.Post && uri.Host == "graph.microsoft.com" &&
            uri.AbsolutePath.EndsWith("/sendMail", StringComparison.Ordinal))
        {
            using var doc = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(ct));
            var message = doc.RootElement.GetProperty("message");
            var body = message.GetProperty("body");
            var html = body.GetProperty("content").GetString()!;
            var attachments = message.GetProperty("attachments");
            var logo = attachments[0];
            if (!message.GetProperty("subject").GetString()!.Contains("cotización enviada") ||
                body.GetProperty("contentType").GetString() != "HTML" ||
                !html.Contains("Pricing") || !html.Contains("cid:cf-quote-logo") ||
                !html.Contains("no una tarifa aprobada") || !html.Contains("Modalidad") ||
                !html.Contains("https://www.logisticacastrofallas.com/") ||
                attachments.GetArrayLength() != 1 ||
                logo.GetProperty("contentId").GetString() != "cf-quote-logo" ||
                logo.GetProperty("name").GetString() != "castro-fallas-logo-blanco.png" ||
                !html.Contains("width=\"128\" height=\"56\"") ||
                !logo.GetProperty("isInline").GetBoolean() ||
                Convert.FromBase64String(logo.GetProperty("contentBytes").GetString()!).Length < 100)
                throw new InvalidOperationException("Unexpected mock branded email content");
            var unsafeText = OfficialQuoteConfirmationTemplate.Build(
                Guid.Parse("f8100000-0000-4000-8000-000000000010"), "Land", "FTL",
                "<script>alert(1)</script>", "Destino & puerto", ["Seguro de carga"]);
            if (unsafeText.Html.Contains("<script>") ||
                !unsafeText.Html.Contains("&lt;script&gt;") ||
                !unsafeText.Html.Contains("Destino &amp; puerto") ||
                !unsafeText.PlainText.Contains("Seguro de carga"))
                throw new InvalidOperationException("Quote email did not escape customer data");
            var maritimeMail = OfficialQuoteConfirmationTemplate.Build(
                Guid.Parse("f8100000-0000-4000-8000-000000000011"), "Maritime", "LCL",
                "San José", "Puerto Moín", ["Transporte internacional"], "Alajuela & alrededores");
            if (!maritimeMail.PlainText.Contains("Puerto de entrada (POE): Puerto Moín") ||
                !maritimeMail.PlainText.Contains("Destino final (POD): Alajuela & alrededores") ||
                !maritimeMail.Html.Contains("Alajuela &amp; alrededores") ||
                maritimeMail.PlainText.Contains("\nDestino: Puerto Moín"))
                throw new InvalidOperationException("Maritime receipt did not distinguish POE and POD.");
            var historicMail = OfficialQuoteConfirmationTemplate.Build(
                Guid.Parse("f8100000-0000-4000-8000-000000000012"), "Maritime", "LCL",
                "San José", "Puerto Moín", []);
            if (!historicMail.PlainText.Contains("Destino final (POD): No indicado"))
                throw new InvalidOperationException("Historic maritime receipt invented a POD.");
            MailCalls++;
            return new HttpResponseMessage(HttpStatusCode.Accepted);
        }
        throw new InvalidOperationException("All real HTTP is forbidden in this mock.");
    }
}

sealed class CiFakeDholeQuotePostFactory(CiFakeDholeQuotePostHandler handler) : IHttpClientFactory
{
    public HttpClient CreateClient(string name)
    {
        if (name != "DholeQuotePost") throw new InvalidOperationException(
            "Mock coordinator cannot request any other external client.");
        return new HttpClient(handler, disposeHandler: false)
        {
            Timeout = TimeSpan.FromSeconds(3)
        };
    }
}

sealed class CiFakeDholeQuotePostHandler(string key, Guid quoteId) : HttpMessageHandler
{
    public int Calls { get; private set; }

    protected override async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request, CancellationToken cancellationToken)
    {
        Calls++;
        AssertFake(request.Method == HttpMethod.Post &&
            request.RequestUri?.ToString() ==
                "https://api.logisticacastrofallas.com/api/external/v1/solicitar-tarifa-wjicua4" &&
            request.Headers.TryGetValues("X-Api-Key", out var secret) &&
            secret.SingleOrDefault() == key &&
            request.Headers.TryGetValues("Idempotency-Key", out var keys) &&
            keys.SingleOrDefault() == "cf-official-" + quoteId.ToString("D"),
            "Fake handler rejected unexpected method, URL, key or identity.");
        var json = await request.Content!.ReadAsStringAsync(cancellationToken);
        using var body = JsonDocument.Parse(json);
        AssertFake(body.RootElement.GetProperty("shipmentMode").GetString() == "Fcl",
            "Only fictional FCL payload may reach fake handler.");
        return new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(
                "{\"value\":\"f8000000-0000-4000-8000-000000000001\"}",
                Encoding.UTF8, "application/json")
        };
    }

    private static void AssertFake(bool condition, string error)
    {
        if (!condition) throw new InvalidOperationException(error);
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
