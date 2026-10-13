using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace CastroFallas.MiniQuote.Api.Models;

public sealed class ActivityLog
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string? Id { get; set; }

    public string Action { get; set; } = string.Empty;
    public string QuoteId { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public BsonDocument Data { get; set; } = new();
}
