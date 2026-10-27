namespace CastroFallas.MiniQuote.Api.Models;

public sealed class ManagedNews
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Title { get; set; } = "";
    public string Category { get; set; } = "";
    public string Description { get; set; } = "";
    public string Body { get; set; } = "";
    public string Image { get; set; } = "";
    public bool Published { get; set; }
    public string Author { get; set; } = "";
    public DateTime? PublishedAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public sealed class ManagedMedia
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = "";
    public string Kind { get; set; } = "Imagen";
    public string Src { get; set; } = "";
    public string? ObjectKey { get; set; }
    public string? MimeType { get; set; }
    public long? SizeBytes { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public sealed record SaveNewsRequest(
    string? Title, string? Category, string? Description, string? Image, bool Published, string? Body,
    string? Author, DateTime? PublishedAt);
public sealed record SaveMediaRequest(
    string? Name, string? Kind, string? Src);

public sealed class ManagedComment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Author { get; set; } = "";
    public string Section { get; set; } = "";
    public string Message { get; set; } = "";
    public bool Published { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public sealed record SaveCommentRequest(string? Author, string? Section, string? Message, bool Published);
