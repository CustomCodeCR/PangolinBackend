// Constraints tested in the isolated codec experiment, not yet a production API.
// Reject out-of-budget dimensions BEFORE allocating a decoded bitmap.
internal static class CmsImageReviewLimits
{
    internal const long MaxPixels = 16_000_000;
    internal const int MaxDimension = 10_000;
    private static readonly int[] TargetWidths = [320, 640];

    internal static bool CanDecode(int width, int height) =>
        width > 0 && height > 0 &&
        width <= MaxDimension && height <= MaxDimension &&
        (long)width * height <= MaxPixels;

    internal static (int Width, int Height) GetTargetSize(int width, int height, int requestedWidth)
    {
        if (!CanDecode(width, height))
            throw new ArgumentOutOfRangeException(nameof(width), "Image exceeds review limits.");
        if (Array.IndexOf(TargetWidths, requestedWidth) < 0)
            throw new ArgumentOutOfRangeException(nameof(requestedWidth), "Unsupported variant width.");
        // Never upscale a small picture; retain aspect ratio.
        var outputWidth = Math.Min(width, requestedWidth);
        var outputHeight = Math.Max(1, (int)Math.Round(height * (outputWidth / (double)width)));
        return (outputWidth, outputHeight);
    }
}
