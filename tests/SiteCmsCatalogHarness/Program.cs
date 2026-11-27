using System.Reflection;
using System.Text.Json;
using CastroFallas.MiniQuote.Api.Services;

// Inspect the actual initialized allowlists; no host, database, secrets or HTTP.
if (args.Length != 1) throw new ArgumentException("Provide generated CMS inventory JSON.");
var slots = JsonSerializer.Deserialize<Slot[]>(File.ReadAllText(args[0]),
    new JsonSerializerOptions(JsonSerializerDefaults.Web)) ?? throw new InvalidOperationException("Missing inventory.");
static HashSet<string> ReadKeys(string name) =>
    typeof(SiteCmsEndpoints).GetField(name, BindingFlags.NonPublic | BindingFlags.Static)?.GetValue(null)
        is HashSet<string> set ? new HashSet<string>(set, StringComparer.Ordinal)
        : throw new InvalidOperationException("Cannot read actual CMS allowlist: " + name);
var text = ReadKeys("TextKeys");
var media = ReadKeys("MediaKeys");
var seen = new HashSet<string>(StringComparer.Ordinal);
var errors = new List<string>();
foreach (var slot in slots)
{
    if (!seen.Add(slot.Key)) errors.Add("Duplicate: " + slot.Key);
    bool correct = slot.Type switch
    {
        "text" => text.Contains(slot.Key) && !media.Contains(slot.Key),
        "media" => media.Contains(slot.Key) && !text.Contains(slot.Key),
        _ => false
    };
    if (!correct) errors.Add("Missing or wrong backend type: " + slot.Key);
}
foreach (var key in text.Intersect(media)) errors.Add("Ambiguous backend type: " + key);
var backendOnly = text.Concat(media).Where(k => !seen.Contains(k)).Order().ToArray();
Console.WriteLine("Backend-only keys (review; may be deliberate): " + string.Join(", ", backendOnly));
if (errors.Count > 0) throw new InvalidOperationException(string.Join(Environment.NewLine, errors));
Console.WriteLine($"PASS: {slots.Length} actual editor locations each have exactly one correct backend type.");
record Slot(string Key, string Type, string Page);
