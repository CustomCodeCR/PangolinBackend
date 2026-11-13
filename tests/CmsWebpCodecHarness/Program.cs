using System.Text;
using SkiaSharp;

// This is deliberately a disposable codec/resize proof of concept, NOT a CMS endpoint.
// It reads committed static samples and writes only to RUNNER_TEMP. Nothing reaches S3.
static void Ensure(bool condition, string message)
{
    if (!condition) throw new InvalidOperationException(message);
}
Ensure(Environment.GetEnvironmentVariable("CI") == "true" &&
       Environment.GetEnvironmentVariable("CMS_WEBP_REVIEW_ONLY") == "1",
       "This harness may only run in isolated CI review.");
var temp = Environment.GetEnvironmentVariable("RUNNER_TEMP");
Ensure(!string.IsNullOrWhiteSpace(temp), "RUNNER_TEMP must be set.");
var root = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory()));
var output = Path.GetFullPath(Path.Combine(temp!, "cms-webp-codec-review"));
Ensure(!output.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.Ordinal),
       "Refusing to write generated images into the repository.");
Directory.CreateDirectory(output);

string[] files =
[
    "frontend/public/images/about-operations-enhanced.jpg",
    "frontend/public/images/cover-logistics.jpeg",
    "frontend/public/images/gio-assistant-base.png"
];
var report = new StringBuilder();
report.AppendLine("# WebP codec validation for CMS backend (CI-only)");
report.AppendLine();
report.AppendLine("This runs entirely against public static sample images, not private CMS storage.");
report.AppendLine("No image URLs, S3 objects or production dependencies are changed.");
report.AppendLine();
report.AppendLine("| Original | Original dimensions | Variant width | Original KiB | WebP KiB | Reduction |");
report.AppendLine("|---|---:|---:|---:|---:|---:|");

foreach (var relative in files)
{
    var source = Path.Combine(root, relative);
    Ensure(File.Exists(source), "Missing fixture: " + relative);
    await using var input = File.OpenRead(source);
    using var codec = SKCodec.Create(input);
    Ensure(codec is not null, "Image decoder rejected " + relative);
    var info = codec!.Info;
    Ensure(info.Width > 0 && info.Height > 0 && (long)info.Width * info.Height <= 16_000_000,
           "Image dimensions exceed the strict pixel budget: " + relative);
    using var original = SKBitmap.Decode(codec);
    Ensure(original is not null, "Could not decode " + relative);
    var bitmap = original!;
    foreach (var targetWidth in new[] { 320, 640 })
    {
        var width = Math.Min(targetWidth, info.Width);
        var height = Math.Max(1, (int)Math.Round(info.Height * (width / (double)info.Width)));
        var alpha = bitmap.AlphaType == SKAlphaType.Opaque ? SKAlphaType.Opaque : SKAlphaType.Premul;
        using var resized = new SKBitmap(new SKImageInfo(width, height, SKColorType.Rgba8888, alpha));
        Ensure(bitmap.ScalePixels(resized, new SKSamplingOptions(SKFilterMode.Linear, SKMipmapMode.Linear)),
               "SkiaSharp failed to resize " + relative);
        using var image = SKImage.FromBitmap(resized);
        using var encoded = image.Encode(SKEncodedImageFormat.Webp, 82);
        Ensure(encoded is not null, "SkiaSharp WebP encoder unavailable");
        var name = Path.GetFileNameWithoutExtension(relative) + "-" + targetWidth + ".webp";
        var generated = Path.Combine(output, name);
        await using (var stream = File.Create(generated))
            encoded!.SaveTo(stream);
        using var decoded = SKBitmap.Decode(generated);
        Ensure(decoded is not null && decoded.Width == width && decoded.Height == height,
               "Generated WebP failed decode or dimensions: " + name);
        if (alpha != SKAlphaType.Opaque)
            Ensure(decoded!.AlphaType != SKAlphaType.Opaque,
                   "Generated WebP unexpectedly lost transparency: " + name);
        var originalBytes = new FileInfo(source).Length;
        var derivativeBytes = new FileInfo(generated).Length;
        Ensure(derivativeBytes > 0 && derivativeBytes < originalBytes,
               "Variant did not reduce bytes: " + name);
        var percent = 100 * (1 - derivativeBytes / (double)originalBytes);
        report.AppendLine("| " + Path.GetFileName(relative) + " | " +
                          info.Width + "×" + info.Height + " | " + width +
                          " | " + Math.Round(originalBytes / 1024.0, 1) +
                          " | " + Math.Round(derivativeBytes / 1024.0, 1) +
                          " | " + Math.Round(percent, 1) + "% |");
        Console.WriteLine("PASS " + name + " " + width + "x" + height +
                          " reduction=" + Math.Round(percent, 1) + "%");
    }
}
report.AppendLine();
report.AppendLine("**Preliminary size samples only.** This does not establish production safety,");
report.AppendLine("animation/EXIF fidelity, CMS publication checks, image quality or PageSpeed gains.");
report.AppendLine("A production implementation must check publication before every derived response,");
report.AppendLine("retain originals, prevent repeated encoding per request, bound concurrency,");
report.AppendLine("and handle GIF/legacy/failed conversions with the unmodified original.");
var summary = report.ToString();
await File.WriteAllTextAsync(Path.Combine(output, "report.md"), summary);
var summaryFile = Environment.GetEnvironmentVariable("GITHUB_STEP_SUMMARY");
if (!string.IsNullOrWhiteSpace(summaryFile))
    await File.AppendAllTextAsync(summaryFile, summary);
Console.WriteLine("PASS isolated .NET WebP codec review finished.");
