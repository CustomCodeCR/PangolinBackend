using System.Net;
using System.Text;
using CastroFallas.MiniQuote.Api.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging.Abstractions;
using SkiaSharp;

// CI-only visual review. Uses real converter source but only repository samples,
// writing to an ephemeral Actions artifact. No backend/S3/DB access.
if (Environment.GetEnvironmentVariable("CI") != "true" ||
    Environment.GetEnvironmentVariable("CMS_WEBP_REVIEW_ONLY") != "1")
    throw new InvalidOperationException("Refusing to run outside isolated CI.");
var temp = Environment.GetEnvironmentVariable("RUNNER_TEMP");
if (string.IsNullOrWhiteSpace(temp))
    throw new InvalidOperationException("Missing RUNNER_TEMP.");
var root = Directory.GetCurrentDirectory();
var output = Path.GetFullPath(Path.Combine(temp, "cms-webp-visual-review"));
if (output.StartsWith(Path.GetFullPath(root) + Path.DirectorySeparatorChar, StringComparison.Ordinal))
    throw new InvalidOperationException("Output must remain outside repository.");
Directory.CreateDirectory(output);

var fixtures = new (string Path, string Mime)[]
{
    ("frontend/public/images/about-operations-enhanced.jpg", "image/jpeg"),
    ("frontend/public/images/cover-logistics.jpeg", "image/jpeg"),
    ("frontend/public/images/gio-assistant-base.png", "image/png")
};
var html = new StringBuilder();
html.AppendLine("""
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CMS WebP: revisión visual aislada</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:system-ui,Arial,sans-serif;margin:0;background:#f6f7f9;color:#1e293b;line-height:1.45}
    main{max-width:1180px;margin:auto;padding:24px}
    h1{font-size:1.75rem}
    h2{margin-top:36px;border-bottom:1px solid #bbb;padding-bottom:8px}
    .notice{background:#fff;border:1px solid #d1d5db;border-radius:10px;padding:14px}
    .pairs{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}
    figure{margin:0;background:#fff;border:1px solid #ddd;border-radius:10px;overflow:hidden}
    .imagebox{height:260px;display:flex;align-items:center;justify-content:center;background:
      repeating-conic-gradient(#dfe4e8 0 25%,#fff 0 50%) 50% / 20px 20px}
    .imagebox img{display:block;max-width:100%;max-height:100%;object-fit:contain}
    figcaption{padding:10px 12px;min-height:70px}
    small{color:#475569}
  </style>
</head>
<body><main>
<h1>Comparación visual CMS: original y WebP</h1>
<p class="notice">Prueba aislada generada en GitHub Actions con el mismo conversor de la PR #224.
No se accedió a MinIO real. Las imágenes son archivos estáticos de prueba del repositorio,
no fotografías privadas ni una prueba de su edición en el CMS.
Para comparar, revisá color, nitidez, recorte, sombras, texto integrado y transparencia.
Todas las imágenes se muestran con object-fit: contain, sin recortes artificiales.</p>
""");
var report = new StringBuilder();
report.AppendLine("# CMS WebP: visual review (isolated CI)");
report.AppendLine();
report.AppendLine("Produced using the production converter linked directly from backend/Services/CmsImageVariants.cs.");
report.AppendLine("No MinIO, no PostgreSQL, no network storage, no changes to website or database.");
report.AppendLine();
report.AppendLine("| Original | Resolution | Variant | KiB original | KiB WebP | Saving |");
report.AppendLine("|---|---:|---:|---:|---:|---:|");

var generated = 0;
foreach (var (relative, mime) in fixtures)
{
    var source = Path.Combine(root, relative);
    if (!File.Exists(source))
        throw new FileNotFoundException("Missing fixed source fixture.", source);
    var original = await File.ReadAllBytesAsync(source);
    var fileName = Path.GetFileName(source);
    var basename = Path.GetFileNameWithoutExtension(source);
    var copiedName = "original-" + fileName;
    await File.WriteAllBytesAsync(Path.Combine(output, copiedName), original);

    using var input = new MemoryStream(original, writable: false);
    var uploadedFile = new FormFile(input, 0, original.Length, "file", fileName)
    {
        Headers = new HeaderDictionary(),
        ContentType = mime
    };
    using var srcCodec = SKCodec.Create(new MemoryStream(original, writable: false))
        ?? throw new InvalidOperationException("Cannot decode fixture: " + fileName);
    var dimensions = srcCodec.Info;
    var variants = await CmsImageVariants.EncodeAsync(uploadedFile, mime, NullLogger.Instance, CancellationToken.None);
    if (variants.Count == 0)
        throw new InvalidOperationException("No variants generated from " + fileName);

    html.Append("<h2>").Append(WebUtility.HtmlEncode(fileName))
        .Append(" (").Append(dimensions.Width).Append('×').Append(dimensions.Height)
        .AppendLine(")</h2><div class=\"pairs\">");
    html.Append("<figure><div class=\"imagebox\"><img src=\"")
        .Append(WebUtility.HtmlEncode(copiedName))
        .AppendLine("\" alt=\"Imagen original\"></div><figcaption><strong>Original</strong><br><small>")
        .Append(Math.Round(original.Length / 1024.0, 1))
        .AppendLine(" KiB</small></figcaption></figure>");

    foreach (var (width, bytes) in variants.OrderBy(x => x.Key))
    {
        if (bytes.Length == 0 || bytes.Length >= original.Length)
            throw new InvalidOperationException("A WebP variant did not save bytes.");
        if (bytes.Length < 12 || Encoding.ASCII.GetString(bytes, 0, 4) != "RIFF" ||
            Encoding.ASCII.GetString(bytes, 8, 4) != "WEBP")
            throw new InvalidOperationException("Generated derivative is not a WebP file.");
        using var decoded = SKBitmap.Decode(bytes)
            ?? throw new InvalidOperationException("Generated WebP is not decodable.");
        var expectedHeight = (int)Math.Round(dimensions.Height * (width / (double)dimensions.Width));
        if (decoded.Width != width || Math.Abs(decoded.Height - expectedHeight) > 1)
            throw new InvalidOperationException("WebP does not preserve dimensions/aspect ratio.");
        var name = basename + "-w" + width + ".webp";
        await File.WriteAllBytesAsync(Path.Combine(output, name), bytes);
        var saving = 100 * (1.0 - bytes.Length / (double)original.Length);
        report.Append("| ").Append(fileName).Append(" | ")
            .Append(dimensions.Width).Append('×').Append(dimensions.Height).Append(" | ")
            .Append(decoded.Width).Append('×').Append(decoded.Height).Append(" | ")
            .Append(Math.Round(original.Length / 1024.0, 1)).Append(" | ")
            .Append(Math.Round(bytes.Length / 1024.0, 1)).Append(" | ")
            .Append(Math.Round(saving, 1)).AppendLine("% |");
        html.Append("<figure><div class=\"imagebox\"><img src=\"")
            .Append(WebUtility.HtmlEncode(name))
            .Append("\" alt=\"Versión WebP ").Append(width)
            .Append(" píxeles\"></div><figcaption><strong>WebP ")
            .Append(width).Append(" px</strong><br><small>")
            .Append(Math.Round(bytes.Length / 1024.0, 1))
            .Append(" KiB (").Append(Math.Round(saving, 1))
            .AppendLine("% menos)</small></figcaption></figure>");
        generated++;
    }
    html.AppendLine("</div>");
}
if (generated < 3)
    throw new InvalidOperationException("Visual review produced too few derivatives.");
html.AppendLine("""
<p class="notice"><strong>Qué verifica esta galería:</strong> calidad visual de la conversión
sobre imágenes de prueba. <strong>No verifica:</strong> una instalación CMS real,
navegadores de todos los usuarios ni mejoría de PageSpeed en producción.</p>
</main></body></html>
""");
report.AppendLine();
report.AppendLine("**Visual judgment required:** compare detail, contrast, colors, cropping and transparency at equal display sizes.");
report.AppendLine("These are preview fixtures, not existing CMS news photographs.");
await File.WriteAllTextAsync(Path.Combine(output, "index.html"), html.ToString());
await File.WriteAllTextAsync(Path.Combine(output, "report.md"), report.ToString());
var summaryPath = Environment.GetEnvironmentVariable("GITHUB_STEP_SUMMARY");
if (!string.IsNullOrWhiteSpace(summaryPath))
    await File.AppendAllTextAsync(summaryPath, report.ToString());
Console.WriteLine($"PASS CMS isolated visual review: {fixtures.Length} originals + {generated} real WebP variants");
