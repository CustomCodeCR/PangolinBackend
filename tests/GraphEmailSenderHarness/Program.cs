global using Microsoft.Extensions.Configuration;
using System.Net;
using System.Net.Http;
using System.Text.Json;
using CastroFallas.MiniQuote.Api.Services.Auth;

const string recipient = "recipient@example.test";
const string sender = "sender@example.test";
const string subject = "OTP fixture subject";
const string body = "LOCAL_FIXTURE_MAIL_BODY_DO_NOT_LOG";
const string token = "LOCAL_FAKE_GRAPH_TOKEN";
const string secret = "LOCAL_FAKE_GRAPH_CLIENT_SECRET";

static void Assert(bool ok, string reason)
{
    if (!ok) throw new Exception(reason);
}
static GraphEmailSender Mailer(HttpMessageHandler handler, bool includeConfig = true)
{
    var values = includeConfig
        ? new Dictionary<string, string?>
        {
            ["Graph:TenantId"] = "11111111-1111-4111-8111-111111111111",
            ["Graph:ClientId"] = "22222222-2222-4222-8222-222222222222",
            ["Graph:ClientSecret"] = secret,
            ["Graph:From"] = sender
        }
        : new Dictionary<string, string?>();
    var config = new ConfigurationBuilder().AddInMemoryCollection(values).Build();
    return new GraphEmailSender(new HttpClient(handler), config);
}
static HttpResponseMessage Json(HttpStatusCode status, string json) =>
    new(status) { Content = new StringContent(json, System.Text.Encoding.UTF8, "application/json") };
static HttpResponseMessage AccessToken() => Json(HttpStatusCode.OK, """{"access_token":"LOCAL_FAKE_GRAPH_TOKEN"}""");
static async Task<HttpRequestException> MustFail(Func<Task> action)
{
    try { await action(); }
    catch (HttpRequestException ex) { return ex; }
    throw new Exception("Expected an HTTP error from simulated Microsoft Graph.");
}

// 202: both calls use fixed Microsoft hosts and the bearer token stays server-side.
var tokenCalls = 0;
var sendCalls = 0;
var success = new FakeHandler(async (request, ct) =>
{
    if (request.RequestUri!.Host == "login.microsoftonline.com")
    {
        tokenCalls++;
        Assert(request.Method == HttpMethod.Post, "OAuth request must use POST.");
        var form = await request.Content!.ReadAsStringAsync(ct);
        Assert(form.Contains("grant_type=client_credentials", StringComparison.Ordinal),
            "Graph OAuth must use client credentials.");
        Assert(form.Contains("scope=https%3A%2F%2Fgraph.microsoft.com%2F.default", StringComparison.Ordinal),
            "OAuth scope must be the Graph default.");
        return AccessToken();
    }
    Assert(request.RequestUri.Host == "graph.microsoft.com", "Unexpected Graph mail host.");
    Assert(Uri.UnescapeDataString(request.RequestUri.AbsolutePath).Contains(sender, StringComparison.Ordinal),
        "Unexpected sender mailbox.");
    Assert(request.Method == HttpMethod.Post, "Graph sendMail must use POST.");
    Assert(request.Headers.Authorization?.Scheme == "Bearer" &&
           request.Headers.Authorization.Parameter == token, "Graph bearer token missing.");
    var json = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(ct));
    using (json)
    {
        Assert(json.RootElement.GetProperty("saveToSentItems").GetBoolean() == false,
            "Mail should not create an additional Sent Items copy.");
        var message = json.RootElement.GetProperty("message");
        Assert(message.GetProperty("toRecipients")[0].GetProperty("emailAddress")
            .GetProperty("address").GetString() == recipient, "Wrong mail recipient.");
        Assert(message.GetProperty("body").GetProperty("content").GetString() == body,
            "Mail fixture body changed.");
    }
    sendCalls++;
    return new HttpResponseMessage(HttpStatusCode.Accepted);
});
await Mailer(success).SendAsync(recipient, subject, body, CancellationToken.None);
Assert(tokenCalls == 1 && sendCalls == 1, "202 case must make exactly two requests.");

// Token rejection: no sendMail call must follow a failed OAuth request.
var oauthCalls = 0;
var tokenDenied = new FakeHandler((req, ct) =>
{
    oauthCalls++;
    Assert(req.RequestUri!.Host == "login.microsoftonline.com", "No email before OAuth succeeds.");
    return Task.FromResult(Json(HttpStatusCode.Unauthorized, """{"error":"invalid_client"}"""));
});
var tokenError = await MustFail(() =>
    Mailer(tokenDenied).SendAsync(recipient, subject, body, CancellationToken.None));
Assert(oauthCalls == 1 && tokenError.Message.Contains("HTTP 401", StringComparison.Ordinal),
    "OAuth errors must remain distinct from sendMail errors.");

// 403: log only safe Graph codes and correlation IDs, never the free-text error or OTP.
var graphCalls = 0;
var accessDenied = new FakeHandler((req, ct) =>
{
    graphCalls++;
    if (graphCalls == 1) return Task.FromResult(AccessToken());
    var response = Json(HttpStatusCode.Forbidden,
        """{"error":{"code":"ErrorAccessDenied","message":"PRIVATE_MAIL_MESSAGE_SHOULD_NOT_LEAK","innerError":{"code":"AuthorizationDenied"}}}""");
    response.Headers.TryAddWithoutValidation("request-id", "33333333-3333-4333-8333-333333333333");
    return Task.FromResult(response);
});
var denied = await MustFail(() =>
    Mailer(accessDenied).SendAsync(recipient, subject, body, CancellationToken.None));
Assert(graphCalls == 2 && denied.Message.Contains("HTTP 403", StringComparison.Ordinal) &&
       denied.Message.Contains("graphCode=ErrorAccessDenied", StringComparison.Ordinal) &&
       denied.Message.Contains("innerCode=AuthorizationDenied", StringComparison.Ordinal) &&
       denied.Message.Contains("requestId=33333333-3333-4333-8333-333333333333", StringComparison.Ordinal),
       "Graph error must retain safe diagnostics.");
Assert(!denied.Message.Contains("PRIVATE_MAIL_MESSAGE", StringComparison.Ordinal) &&
       !denied.Message.Contains(body, StringComparison.Ordinal) &&
       !denied.Message.Contains(secret, StringComparison.Ordinal) &&
       !denied.Message.Contains(recipient, StringComparison.Ordinal),
       "Graph error leaked private mail, recipient or secret.");

// Throttling may return a non-JSON body. The backend must still return a safe error.
var throttleCalls = 0;
var throttled = new FakeHandler((req, ct) =>
{
    throttleCalls++;
    return Task.FromResult(throttleCalls == 1 ? AccessToken() :
        new HttpResponseMessage(HttpStatusCode.TooManyRequests) {
            Content = new StringContent("PRIVATE_UPSTREAM_BODY") });
});
var throttledError = await MustFail(() =>
    Mailer(throttled).SendAsync(recipient, subject, body, CancellationToken.None));
Assert(throttleCalls == 2 && throttledError.Message.Contains("HTTP 429", StringComparison.Ordinal) &&
       throttledError.Message.Contains("graphCode=unknown", StringComparison.Ordinal) &&
       !throttledError.Message.Contains("PRIVATE_UPSTREAM_BODY", StringComparison.Ordinal),
       "Unexpected Graph throttling diagnostics.");

// Missing configuration must fail before any HTTP call, and without leaking secrets.
var missingCalls = 0;
var empty = new FakeHandler((req, ct) => { missingCalls++; throw new Exception("Network must not be used."); });
try
{
    await Mailer(empty, includeConfig: false).SendAsync(recipient, subject, body, CancellationToken.None);
    throw new Exception("Missing Graph configuration was accepted.");
}
catch (InvalidOperationException ex) when (ex.Message.Contains("Graph:TenantId", StringComparison.Ordinal))
{
    Assert(missingCalls == 0, "Invalid config must stop before external requests.");
}

Console.WriteLine("PASS offline Graph: 202 accepted, OAuth 401, sendMail 403, HTTP 429 and missing config. No secrets or OTP sent.");

sealed class FakeHandler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> process)
    : HttpMessageHandler
{
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
        process(request, cancellationToken);
}
