using Amazon;
using Amazon.S3;
using Amazon.S3.Model;

namespace CastroFallas.MiniQuote.Api.Services;

// Un cliente S3 compatible sirve para MinIO AIStor y otros proveedores.
// Nunca expone credenciales al navegador. En instalaciones sin S3 el CRUD legado continúa.
public sealed class ObjectStorageService : IDisposable
{
    private readonly AmazonS3Client? _client;
    public string Bucket { get; }
    public bool Enabled => _client is not null;

    public ObjectStorageService(IConfiguration configuration)
    {
        var endpoint = configuration["Storage:Endpoint"];
        Bucket = configuration["Storage:Bucket"] ?? "castrofallas-media";
        if (string.IsNullOrWhiteSpace(endpoint)) return;

        var accessKey = configuration["Storage:AccessKey"];
        var secretKey = configuration["Storage:SecretKey"];
        if (string.IsNullOrWhiteSpace(accessKey) || string.IsNullOrWhiteSpace(secretKey))
            throw new InvalidOperationException("S3 configurado sin credenciales Storage:AccessKey/SecretKey.");
        if (!Uri.TryCreate(endpoint, UriKind.Absolute, out var uri) ||
            (uri.Scheme is not ("http" or "https")))
            throw new InvalidOperationException("Storage:Endpoint debe ser una URL HTTP(S) válida.");
        if (uri.Scheme == "http" && !uri.IsLoopback && !string.Equals(uri.Host, "minio", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("HTTP sin TLS sólo se admite para MinIO dentro de Docker.");

        _client = new AmazonS3Client(accessKey, secretKey, new AmazonS3Config
        {
            ServiceURL = endpoint,
            ForcePathStyle = true,
            AuthenticationRegion = configuration["Storage:Region"] ?? "us-east-1"
        });
    }

    public async Task UploadAsync(string key, Stream content, long length, string mime, CancellationToken ct)
    {
        if (_client is null) throw new InvalidOperationException("S3 no configurado.");
        await _client.PutObjectAsync(new PutObjectRequest
        {
            BucketName = Bucket,
            Key = key,
            InputStream = content,
            ContentType = mime,
            AutoCloseStream = false,
            Headers = { ContentLength = length }
        }, ct);
    }

    public Task<GetObjectResponse> DownloadAsync(string key, CancellationToken ct) =>
        _client is null
            ? throw new InvalidOperationException("S3 no configurado.")
            : _client.GetObjectAsync(Bucket, key, ct);

    public async Task DeleteAsync(string key, CancellationToken ct)
    {
        if (_client is null) throw new InvalidOperationException("S3 no configurado.");
        await _client.DeleteObjectAsync(Bucket, key, ct);
    }

    public void Dispose() => _client?.Dispose();
}
