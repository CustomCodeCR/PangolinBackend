using CastroFallas.MiniQuote.Api.Services;

static void Check(bool ok, string message)
{
    if (!ok) throw new Exception(message);
}

var id = Guid.Parse("11111111-2222-4333-8444-555555555555");
var tag = MediaHttpCachePolicy.EntityTag(id, 3_490_000);
Check(tag == "\"cms-11111111222243338444555555555555-3490000\"", "Deterministic quoted ETag.");
Check(MediaHttpCachePolicy.EntityTag(id, null).EndsWith("-0\""), "Legacy nullable length.");

Check(MediaHttpCachePolicy.IsNotModified(tag, null, tag), "Matching ETag can return 304.");
Check(MediaHttpCachePolicy.IsNotModified("W/" + tag, null, tag), "Weak validators can revalidate GET.");
Check(MediaHttpCachePolicy.IsNotModified("\"other\", " + tag, "", tag), "Comma-separated validators.");
Check(MediaHttpCachePolicy.IsNotModified("*", null, tag), "Wildcard validator.");
Check(!MediaHttpCachePolicy.IsNotModified("\"other\"", null, tag), "Different ETag requires full bytes.");
Check(!MediaHttpCachePolicy.IsNotModified(null, null, tag), "No validator requires full bytes.");
Check(!MediaHttpCachePolicy.IsNotModified(tag, "bytes=0-99", tag), "Ranges must not return 304.");
Check(!MediaHttpCachePolicy.IsNotModified("*", "bytes=0-", tag), "Wildcard cannot suppress a Range.");
Check(MediaHttpCachePolicy.PublishedMedia.Contains("private, no-cache", StringComparison.Ordinal),
    "Published media must not be cached in shared intermediaries or used without revalidation.");
Check(MediaHttpCachePolicy.NoStore.Contains("no-store", StringComparison.Ordinal),
    "Unpublished and admin media must never be cached.");

Console.WriteLine("PASS CMS media cache contract: private revalidation, ETags, weak/list validators, ranges and no-store.");
