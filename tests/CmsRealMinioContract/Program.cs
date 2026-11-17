using Amazon.Runtime;
using Amazon.S3;
using Amazon.S3.Model;
using CastroFallas.MiniQuote.Api.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using SkiaSharp;

// This harness may ONLY contact the disposable, loopback-only MinIO container
// started by this PR's isolated CI. No user credentials, database or live MinIO.
// The optional setup mode prepares a fixed, isolated bucket for a full
// CMS HTTP test running on this same ephemeral Actions runner.
// It does not run the production backend or use live credentials.
var prepareHttpFixture = args.Length == 1 && args[0] == "--prepare-http-fixture";
if (args.Length > 0 && !prepareHttpFixture)
    throw new InvalidOperationException("Unknown CI fixture argument.");
if (prepareHttpFixture && Environment.GetEnvironmentVariable("CMS_REAL_MINIO_HTTP_FIXTURE") != "1")
    throw new InvalidOperationException("HTTP fixture provisioning requires explicit CI opt-in.");

const string endpoint = "http://127.0.0.1:19119";
const string username = "ci-webp-only";
const string password = "ci-webp-disposable-password-only";
if (Environment.GetEnvironmentVariable("CI") != "true" ||
    Environment.GetEnvironmentVariable("CMS_REAL_MINIO_ISOLATED") != "1" ||
    Environment.GetEnvironmentVariable("RUNNER_TEMP") is null ||
    Environment.GetEnvironmentVariable("Storage__Endpoint") is not null ||
    Environment.GetEnvironmentVariable("Storage__AccessKey") is not null ||
    Environment.GetEnvironmentVariable("Storage__SecretKey") is not null)
    throw new InvalidOperationException("Refusing to run without isolated CI safeguards.");

var bucket = prepareHttpFixture ? "cms-webp-http-ci"
    : "cms-webp-ci-" + Guid.NewGuid().ToString("N")[..12];
var fixture = Path.Combine(Directory.GetCurrentDirectory(), "frontend/public/images/cover-logistics.jpeg");
if (!File.Exists(fixture))
    throw new FileNotFoundException("Repository fixture missing.", fixture);
var original = await File.ReadAllBytesAsync(fixture);
if (original.Length == 0 || original.Length > 5 * 1024 * 1024)
    throw new InvalidOperationException("Unexpected source image size.");

var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
{
    ["Storage:Endpoint"] = endpoint,
    ["Storage:Bucket"] = bucket,
    ["Storage:AccessKey"] = username,
    ["Storage:SecretKey"] = password
}).Build();

var s3Config = new AmazonS3Config
{
    ServiceURL = endpoint,
    ForcePathStyle = true,
    AuthenticationRegion = "us-east-1"
};
using var admin = new AmazonS3Client(new BasicAWSCredentials(username, password), s3Config);
await admin.PutBucketAsync(new PutBucketRequest { BucketName = bucket });
if (prepareHttpFixture)
{
    Console.WriteLine("PASS isolated MinIO HTTP bucket provisioned for disposable CI test");
    return; // MinIO data is erased by the CI workflow's cleanup step.
}

using var storage = new ObjectStorageService(config);
if (!storage.Enabled || storage.Bucket != bucket)
    throw new InvalidOperationException("Test unexpectedly selected another storage provider.");
var id = Guid.NewGuid();
var key = $"media/{id:N}.jpeg";
var variantKey = CmsImageVariants.ObjectKey(key, 360);
var ct = CancellationToken.None;

if (await storage.TryGetSizeAsync(key, ct) is not null ||
    await storage.TryGetSizeAsync(variantKey, ct) is not null)
    throw new InvalidOperationException("Disposable bucket should be empty.");

using (var stream = new MemoryStream(original, writable: false))
    await storage.UploadAsync(key, stream, original.Length, "image/jpeg", ct);
if (await storage.TryGetSizeAsync(key, ct) != original.Length)
    throw new InvalidOperationException("Original HEAD length mismatch.");

using var input = new MemoryStream(original, writable: false);
var upload = new FormFile(input, 0, original.Length, "file", "cover-logistics.jpeg")
{
    Headers = new HeaderDictionary(),
    ContentType = "image/jpeg"
};
var variants = await CmsImageVariants.EncodeAsync(upload, "image/jpeg", NullLogger.Instance, ct);
if (!variants.TryGetValue(360, out var webp) || webp.Length >= original.Length)
    throw new InvalidOperationException("Production encoder did not generate smaller 360px WebP.");
using (var decoded = SKBitmap.Decode(webp))
{
    if (decoded is null || decoded.Width != 360)
        throw new InvalidOperationException("Production WebP cannot be decoded at target resolution.");
}

using (var stream = new MemoryStream(webp, writable: false))
{
    if (!await storage.UploadIfAbsentAsync(variantKey, stream, webp.Length, "image/webp", ct))
        throw new InvalidOperationException("Initial conditional PUT should succeed.");
}
if (await storage.TryGetSizeAsync(variantKey, ct) != webp.Length)
    throw new InvalidOperationException("Variant HEAD length mismatch.");

// Simulate a competing worker that attempts to overwrite a populated key.
// S3/MinIO must return HTTP 412, which the real backfill client converts to
// false. A broken conditional PUT would silently corrupt this variant.
var poison = new byte[] { 0x42, 0x41, 0x44 };
using (var stream = new MemoryStream(poison, writable: false))
{
    if (await storage.UploadIfAbsentAsync(variantKey, stream, poison.Length, "image/webp", ct))
        throw new InvalidOperationException("S3 overwrote a variant that already exists.");
}
if (await storage.TryGetSizeAsync(variantKey, ct) != webp.Length)
    throw new InvalidOperationException("Failed conditional PUT changed the object length.");

async Task<byte[]> ReadObjectAsync(string objectKey, long? start = null, long? end = null)
{
    using var fetched = await storage.DownloadAsync(objectKey, ct, start, end);
    using var copied = new MemoryStream();
    await fetched.ResponseStream.CopyToAsync(copied, ct);
    return copied.ToArray();
}
if (!(await ReadObjectAsync(key)).AsSpan().SequenceEqual(original))
    throw new InvalidOperationException("Original bytes were changed.");
if (!(await ReadObjectAsync(variantKey)).AsSpan().SequenceEqual(webp))
    throw new InvalidOperationException("WebP bytes were changed.");
if (!(await ReadObjectAsync(variantKey, 0, 3)).AsSpan().SequenceEqual("RIFF"u8))
    throw new InvalidOperationException("S3 byte-range response returned incorrect content.");

var meta = await admin.GetObjectMetadataAsync(new GetObjectMetadataRequest { BucketName = bucket, Key = variantKey });
if (meta.Headers.ContentType != "image/webp")
    throw new InvalidOperationException("S3 WebP MIME differs from image/webp.");
await storage.DeleteAsync(variantKey, ct);
if (await storage.TryGetSizeAsync(variantKey, ct) is not null)
    throw new InvalidOperationException("Derivative was not deleted.");
if (!(await ReadObjectAsync(key)).AsSpan().SequenceEqual(original))
    throw new InvalidOperationException("Deleting a derivative damaged the original.");
await storage.DeleteAsync(key, ct);
await admin.DeleteBucketAsync(new DeleteBucketRequest { BucketName = bucket });

Console.WriteLine($"PASS isolated MinIO: production JPEG -> WebP, true conditional PUT/412, range, MIME, original preservation; saving {(100.0 * (1.0 - webp.Length / (double)original.Length)):F1}%");
