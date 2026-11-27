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
var backupRestoreFixture = args.Length == 1 && args[0] == "--backup-restore-fixture";
if (args.Length > 0 && !prepareHttpFixture && !backupRestoreFixture)
    throw new InvalidOperationException("Unknown CI fixture argument.");
if ((prepareHttpFixture || backupRestoreFixture) &&
    Environment.GetEnvironmentVariable("CMS_REAL_MINIO_HTTP_FIXTURE") != "1")
    throw new InvalidOperationException("Isolated HTTP fixture requires explicit CI opt-in.");
if (backupRestoreFixture &&
    Environment.GetEnvironmentVariable("CMS_REAL_MINIO_BACKUP_RESTORE_TEST") != "1")
    throw new InvalidOperationException("Backup/restore fixture requires explicit opt-in.");

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

var bucket = prepareHttpFixture || backupRestoreFixture ? "cms-webp-http-ci"
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
if (!backupRestoreFixture)
    await admin.PutBucketAsync(new PutBucketRequest { BucketName = bucket });
if (prepareHttpFixture)
{
    Console.WriteLine("PASS isolated MinIO HTTP bucket provisioned for disposable CI test");
    return; // MinIO data is erased by the CI workflow's cleanup step.
}

using var storage = new ObjectStorageService(config);
if (!storage.Enabled || storage.Bucket != bucket)
    throw new InvalidOperationException("Test unexpectedly selected another storage provider.");

// Restore drill for TWO disposable S3 objects: source JPEG and a WebP derivative.
// Export to runner disk, delete just these test keys, restore, compare full bytes
// and Content-Type. This is NOT a full bucket-level backup or production drill.
if (backupRestoreFixture)
{
    var fixtureKey = "ci-restore/" + Guid.NewGuid().ToString("N") + ".jpeg";
    var derivativeKey = fixtureKey + ".w360.webp";
    var webpFile = Path.Combine(Directory.GetCurrentDirectory(),
        "frontend/public/images/cover-logistics.webp");
    var webpFixture = await File.ReadAllBytesAsync(webpFile);
    if (webpFixture.Length < 12 || webpFixture[0] != 'R' ||
        webpFixture[1] != 'I' || webpFixture[2] != 'F' || webpFixture[3] != 'F')
        throw new InvalidOperationException("Invalid WebP restore fixture.");
    var entries = new[]
    {
        (Key: fixtureKey, Bytes: original, Mime: "image/jpeg"),
        (Key: derivativeKey, Bytes: webpFixture, Mime: "image/webp")
    };
    var snapshotDirectory = Path.Combine(
        Environment.GetEnvironmentVariable("RUNNER_TEMP")!,
        "cms-s3-restore-" + Guid.NewGuid().ToString("N"));
    Directory.CreateDirectory(snapshotDirectory);
    var ctFixture = CancellationToken.None;
    try
    {
        for (var i = 0; i < entries.Length; i++)
        {
            var entry = entries[i];
            using (var source = new MemoryStream(entry.Bytes, writable: false))
                await storage.UploadAsync(entry.Key, source, entry.Bytes.Length, entry.Mime, ctFixture);
            using var fetched = await storage.DownloadAsync(entry.Key, ctFixture);
            using var snapshot = File.Create(Path.Combine(snapshotDirectory, i + ".bin"));
            await fetched.ResponseStream.CopyToAsync(snapshot);
        }

        // The snapshot on disk must be complete BEFORE deleting test keys.
        for (var i = 0; i < entries.Length; i++)
        {
            var saved = await File.ReadAllBytesAsync(Path.Combine(snapshotDirectory, i + ".bin"));
            if (!saved.AsSpan().SequenceEqual(entries[i].Bytes))
                throw new InvalidOperationException("Incomplete S3 fixture export.");
        }
        foreach (var entry in entries)
        {
            await storage.DeleteAsync(entry.Key, ctFixture);
            if (await storage.TryGetSizeAsync(entry.Key, ctFixture) is not null)
                throw new InvalidOperationException("Fixture S3 key was not removed.");
        }

        for (var i = 0; i < entries.Length; i++)
        {
            var entry = entries[i];
            using (var savedStream = File.OpenRead(Path.Combine(snapshotDirectory, i + ".bin")))
                await storage.UploadAsync(
                    entry.Key, savedStream, savedStream.Length, entry.Mime, ctFixture);
            using var recovered = await storage.DownloadAsync(entry.Key, ctFixture);
            using var copy = new MemoryStream();
            await recovered.ResponseStream.CopyToAsync(copy);
            if (!copy.ToArray().AsSpan().SequenceEqual(entry.Bytes))
                throw new InvalidOperationException("Recovered MinIO object differs from snapshot.");
            var metadata = await admin.GetObjectMetadataAsync(
                new GetObjectMetadataRequest { BucketName = bucket, Key = entry.Key });
            if (metadata.Headers.ContentType != entry.Mime)
                throw new InvalidOperationException("Recovered MinIO MIME changed.");
        }
        Console.WriteLine(
            "PASS isolated MinIO recovery: exported, deleted and restored JPEG and WebP fixtures; bytes and MIME verified");
    }
    finally
    {
        // Never leave even CI fixtures in the disposable bucket after the drill.
        foreach (var entry in entries)
            await storage.DeleteAsync(entry.Key, ctFixture);
        Directory.Delete(snapshotDirectory, recursive: true);
    }
    return;
}

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
