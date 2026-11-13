using SkiaSharp;

namespace CastroFallas.MiniQuote.Api.Services;

// Opt-in upload-time WebP derivatives. Originals and CMS database rows never
// change; no decoding or transcoding occurs in a public GET request.
internal static class CmsImageVariants
{
    internal static readonly int[] Widths = [360, 720, 1080, 1600];
    private static readonly SemaphoreSlim EncoderSlots = new(1, 1);
    private const long MaxPixels = 16_000_000;
    private const int MaxDimension = 10_000;

    internal static bool IsAllowedWidth(int width) => Array.IndexOf(Widths, width) >= 0;
    internal static string ObjectKey(string originalKey, int width) =>
        $"{originalKey}.w{width}.webp";

    internal static bool CanDecode(int width, int height) =>
        width > 0 && height > 0 &&
        width <= MaxDimension && height <= MaxDimension &&
        (long)width * height <= MaxPixels;

    internal static async Task<IReadOnlyDictionary<int, byte[]>> EncodeAsync(
        IFormFile file, string mimeType, ILogger logger, CancellationToken ct)
    {
        // No animated images. Do not risk losing GIF/APNG animation or
        // orientation tags. Documents/video and legacy URL media are excluded.
        if (mimeType is not ("image/jpeg" or "image/png" or "image/webp"))
            return new Dictionary<int, byte[]>();

        if (!await EncoderSlots.WaitAsync(TimeSpan.FromSeconds(3), ct))
        {
            logger.LogWarning("CMS WebP generation skipped: encoder busy");
            return new Dictionary<int, byte[]>();
        }
        try
        {
            await using var input = file.OpenReadStream();
            using var codec = SKCodec.Create(input);
            if (codec is null) return new Dictionary<int, byte[]>();
            var info = codec.Info;
            if (!CanDecode(info.Width, info.Height) ||
                codec.FrameCount > 1 ||
                codec.EncodedOrigin != SKEncodedOrigin.TopLeft)
            {
                logger.LogInformation("CMS WebP generation skipped: unsupported dimensions, animation or orientation");
                return new Dictionary<int, byte[]>();
            }

            using var decoded = SKBitmap.Decode(codec);
            if (decoded is null) return new Dictionary<int, byte[]>();
            var variants = new Dictionary<int, byte[]>();
            foreach (var width in Widths)
            {
                ct.ThrowIfCancellationRequested();
                // Never upscale, and don't generate a derivative without savings.
                if (width >= decoded.Width) continue;
                var height = Math.Max(1, (int)Math.Round(decoded.Height * (width / (double)decoded.Width)));
                using var resized = new SKBitmap(
                    new SKImageInfo(width, height, SKColorType.Rgba8888,
                        decoded.AlphaType == SKAlphaType.Opaque ? SKAlphaType.Opaque : SKAlphaType.Premul));
                if (!decoded.ScalePixels(resized,
                        new SKSamplingOptions(SKFilterMode.Linear, SKMipmapMode.Linear)))
                    continue;
                using var image = SKImage.FromBitmap(resized);
                using var encoded = image.Encode(SKEncodedImageFormat.Webp, 82);
                if (encoded is null || encoded.Size <= 0 || encoded.Size >= file.Length)
                    continue;
                variants[width] = encoded.ToArray();
            }
            return variants;
        }
        finally
        {
            EncoderSlots.Release();
        }
    }
}
