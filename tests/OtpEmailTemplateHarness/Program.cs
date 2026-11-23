using CastroFallas.MiniQuote.Api.Services.Auth;

static void Assert(bool condition, string reason)
{
    if (!condition) throw new InvalidOperationException(reason);
}

const string sample = "004219";
var html = OtpEmailTemplate.Html(sample);
var plain = OtpEmailTemplate.PlainText(sample);

// Product-approved proposal: the subject carries the same six-digit OTP shown
// inside the mail, including leading zeroes. It must not contain a second
// identifier that could be mistaken for the login code.
var actualSubject = OtpEmailTemplate.Subject(sample);
Assert(actualSubject == "Código de acceso | Castro Fallas · " + sample,
    "OTP subject must show exactly the code to enter, not a random reference.");
Assert(!System.Text.RegularExpressions.Regex.IsMatch(actualSubject, @"[A-F0-9]{8}$"),
    "The old eight-character reference must not appear as the code.");
Assert(OtpEmailTemplate.Subject("750406").EndsWith("750406", StringComparison.Ordinal),
    "A different OTP must generate a different subject, avoiding conversation grouping.");

Assert(html.StartsWith("<!doctype html>", StringComparison.OrdinalIgnoreCase), "Email must be HTML5.");
Assert(html.Contains("lang=\"es\"", StringComparison.Ordinal), "Spanish locale missing.");
Assert(html.Contains("Tu código de acceso", StringComparison.Ordinal), "Header missing.");
Assert(html.Contains("5 minutos", StringComparison.Ordinal), "Expiry notice missing.");
Assert(html.Contains("Ingresar código", StringComparison.Ordinal), "Verification action missing.");
Assert(html.Contains("src=\"cid:cf-otp-logo\"", StringComparison.Ordinal), "Red G logo CID missing.");
Assert(html.Contains("src=\"cid:cf-otp-globe\"", StringComparison.Ordinal), "Decorative globe CID missing.");
Assert(!html.Contains("favicon.png", StringComparison.Ordinal), "Old square logo must not be loaded.");
Assert(!html.Contains("https://www.logisticacastrofallas.com/images/", StringComparison.Ordinal),
    "Email must not depend on remote image hosting.");
Assert(html.Contains("https://www.logisticacastrofallas.com/bienvenidos", StringComparison.Ordinal),
    "Login URL mismatch.");
Assert(!html.Contains("https://www.logisticacastrofallas.com/bienvenidos?", StringComparison.Ordinal),
    "OTP must never be put in the query string.");
Assert(!html.Contains("<script", StringComparison.OrdinalIgnoreCase), "Email must not include JavaScript.");
Assert(!html.Contains("Copiar código", StringComparison.Ordinal), "No nonfunctional copy button.");
Assert(html.Contains("width=\"640\"", StringComparison.Ordinal), "Desktop mail width missing.");
Assert(html.Contains("class=\"cf-brand\" width=\"164\"", StringComparison.Ordinal),
    "Left brand panel must use the symmetric 164px width.");
Assert(html.Contains("class=\"cf-globe\" width=\"214\"", StringComparison.Ordinal),
    "Globe must extend the decorative fade 50px into the center.");
Assert(html.Contains("class=\"cf-content\" width=\"262\"", StringComparison.Ordinal),
    "Keep the total email width at 640px while extending the globe.");
Assert(html.Contains("src=\"cid:cf-otp-globe\" width=\"214\" height=\"318\"", StringComparison.Ordinal),
    "Keep the globe fully visible within the larger decoration area.");
Assert(html.Contains("max-width:560px", StringComparison.Ordinal), "Mobile layout missing.");
Assert(plain.Contains(sample, StringComparison.Ordinal), "Plain fallback must contain the complete OTP.");
Assert(plain.Contains("5 minutos", StringComparison.Ordinal), "Plain fallback expiry missing.");

// A mail button must reopen the exact pending challenge without carrying the OTP.
// Use a fragment (never sent to the server on GET) and keep the actual code user-entered.
var challengeId = Guid.Parse("c7f817e4-d33e-4e53-a76b-1e51a25e325f");
var officialLink = OtpEmailTemplate.VerificationUrl(challengeId);
var localLink = OtpEmailTemplate.VerificationUrl(challengeId, "http://192.168.1.26:5173/bienvenidos");
Assert(officialLink == "https://www.logisticacastrofallas.com/bienvenidos#otpRequest=c7f817e4-d33e-4e53-a76b-1e51a25e325f",
    "Production OTP button must resume verification on the official site.");
Assert(localLink == "http://192.168.1.26:5173/bienvenidos#otpRequest=c7f817e4-d33e-4e53-a76b-1e51a25e325f",
    "Docker OTP button must stay on the local origin.");
Assert(!officialLink.Contains(sample, StringComparison.Ordinal) &&
       !localLink.Contains(sample, StringComparison.Ordinal),
    "The six-digit code must not appear in any login URL.");
var linkedHtml = OtpEmailTemplate.Html(sample, localLink);
var linkedPlain = OtpEmailTemplate.PlainText(sample, localLink);
Assert(linkedHtml.Contains("href=\"" + localLink + "\"", StringComparison.Ordinal),
    "Email HTML button must carry the existing challenge, not restart login.");
Assert(linkedPlain.Contains(localLink, StringComparison.Ordinal),
    "Text fallback must preserve the pending challenge.");
Assert(!linkedHtml.Contains("href=\"" + localLink + "?codigo=", StringComparison.Ordinal),
    "OTP must not appear in the email CTA URL.");

foreach (var invalidBase in new[]
{
    "javascript:alert(1)", "https://example.com/other", "https://example.com/bienvenidos?next=/admin",
    "https://person@example.com/bienvenidos", "https://example.com/bienvenidos#already"
})
{
    try { _ = OtpEmailTemplate.VerificationUrl(challengeId, invalidBase); throw new Exception("Unsafe login URL accepted."); }
    catch (ArgumentException) { /* Expected. */ }
}
try { _ = OtpEmailTemplate.VerificationUrl(Guid.Empty); throw new Exception("Empty challenge accepted."); }
catch (ArgumentException) { /* Expected. */ }


// HTML digits must remain separate, in sequence, without whitespace between spans.
var cursor = html.IndexOf("class=\"cf-code\"", StringComparison.Ordinal);
Assert(cursor >= 0, "OTP container missing.");
var digitsSection = html[cursor..html.IndexOf("</div>", cursor, StringComparison.Ordinal)];
foreach (var digit in sample)
{
    var search = $">{digit}</span>";
    var next = digitsSection.IndexOf(search, StringComparison.Ordinal);
    Assert(next >= 0, "Missing OTP digit (including leading zero).");
    digitsSection = digitsSection[(next + search.Length)..];
}

foreach (var invalid in new[] { "", "12345", "1234567", "12345x", "123<45" })
{
    try { _ = OtpEmailTemplate.Html(invalid); throw new Exception("Invalid OTP accepted."); }
    catch (ArgumentException) { /* Expected. */ }
    try { _ = OtpEmailTemplate.Subject(invalid); throw new Exception("Invalid subject OTP accepted."); }
    catch (ArgumentException) { /* Expected. */ }
}
try { _ = OtpEmailTemplate.PlainText(null!); throw new Exception("Null OTP accepted."); }
catch (ArgumentException) { /* Expected. */ }

// Optional, offline preview with a deliberately fake code; never requests an OTP.
if (args.Contains("--preview", StringComparer.Ordinal))
{
    var output = Path.Combine(Path.GetTempPath(), "castrofallas-otp-email-preview.html");
    File.WriteAllText(output, OtpEmailTemplate.Html("482913"));
    Console.WriteLine($"Vista previa local de ejemplo: {output}");
}

Console.WriteLine("PASS OTP mail: six ordered digits, plain fallback, validity, CTA, mobile layout and no JS.");
