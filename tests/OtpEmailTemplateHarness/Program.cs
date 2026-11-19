using CastroFallas.MiniQuote.Api.Services.Auth;

static void Assert(bool condition, string reason)
{
    if (!condition) throw new InvalidOperationException(reason);
}

const string sample = "004219";
var html = OtpEmailTemplate.Html(sample);
var plain = OtpEmailTemplate.PlainText(sample);

Assert(html.StartsWith("<!doctype html>", StringComparison.OrdinalIgnoreCase), "Email must be HTML5.");
Assert(html.Contains("lang=\"es\"", StringComparison.Ordinal), "Spanish locale missing.");
Assert(html.Contains("Tu código de acceso", StringComparison.Ordinal), "Header missing.");
Assert(html.Contains("5 minutos", StringComparison.Ordinal), "Expiry notice missing.");
Assert(html.Contains("Iniciar sesión", StringComparison.Ordinal), "Login action missing.");
Assert(html.Contains("src=\"cid:cf-otp-logo\"", StringComparison.Ordinal), "Red G logo CID missing.");
Assert(html.Contains("src=\"cid:cf-otp-globe\"", StringComparison.Ordinal), "Decorative globe CID missing.");
Assert(!html.Contains("favicon.png", StringComparison.Ordinal), "Old square logo must not be loaded.");
Assert(!html.Contains("https://www.logisticacastrofallas.com/images/", StringComparison.Ordinal),
    "Email must not depend on remote image hosting.");
Assert(html.Contains("https://www.logisticacastrofallas.com/bienvenidos", StringComparison.Ordinal),
    "Login URL mismatch.");
Assert(!html.Contains("https://www.logisticacastrofallas.com/bienvenidos?", StringComparison.Ordinal),
    "OTP or challenge must never be put in login URL.");
Assert(!html.Contains("<script", StringComparison.OrdinalIgnoreCase), "Email must not include JavaScript.");
Assert(!html.Contains("Copiar código", StringComparison.Ordinal), "No nonfunctional copy button.");
Assert(html.Contains("width=\"640\"", StringComparison.Ordinal), "Desktop mail width missing.");
Assert(html.Contains("max-width:560px", StringComparison.Ordinal), "Mobile layout missing.");
Assert(plain.Contains(sample, StringComparison.Ordinal), "Plain fallback must contain the complete OTP.");
Assert(plain.Contains("5 minutos", StringComparison.Ordinal), "Plain fallback expiry missing.");

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
