using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Xml.Linq;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.DependencyInjection;

if (Environment.GetEnvironmentVariable("PANGOLIN_DP_ISOLATED_FIXTURE") != "1" ||
    args.Length != 1 || args[0] is not ("protect" or "recover" or "wrong-certificate"))
    throw new InvalidOperationException("Only the isolated synthetic CI fixture is supported.");

var mode = args[0];
var directory = new DirectoryInfo("/state/keys");
const string payloadFile = "/state/payload.txt";
const string expected = "Pangolin synthetic DataProtection fixture";
const string certificatePassword = "fixture-only-not-a-secret";
using var certificate = X509CertificateLoader.LoadPkcs12FromFile(
    mode == "wrong-certificate" ? "/certs/wrong.pfx" : "/certs/right.pfx",
    certificatePassword, X509KeyStorageFlags.EphemeralKeySet);
var services = new ServiceCollection();
services.AddLogging();
var configuration = services.AddDataProtection()
    .SetApplicationName("Pangolin.Isolated.CI")
    .PersistKeysToFileSystem(directory)
    .ProtectKeysWithCertificate(certificate);
if (mode != "protect")
    configuration.DisableAutomaticKeyGeneration();
using var provider = services.BuildServiceProvider();
var protector = provider.GetRequiredService<IDataProtectionProvider>()
    .CreateProtector("isolated-recovery-v1");

if (mode == "protect")
{
    Directory.CreateDirectory(directory.FullName);
    File.WriteAllText(payloadFile, protector.Protect(expected));
    var keys = directory.GetFiles("key-*.xml");
    if (keys.Length == 0) throw new InvalidOperationException("No persisted key");
    foreach (var file in keys)
    {
        var xml = XDocument.Load(file.FullName);
        if (!xml.Descendants().Any(x => x.Name.LocalName == "encryptedSecret") ||
             xml.Descendants().Any(x => x.Name.LocalName == "masterKey"))
            throw new InvalidOperationException("Key XML was not encrypted");
    }
    Console.WriteLine("PASS encrypted DataProtection key XML generated");
    return;
}

var protectedPayload = File.ReadAllText(payloadFile);
if (mode == "wrong-certificate")
{
    try { _ = protector.Unprotect(protectedPayload); }
    catch (CryptographicException)
    {
        Console.WriteLine("PASS unrelated certificate cannot recover fixture payload");
        return;
    }
    throw new InvalidOperationException("Wrong certificate unexpectedly recovered payload");
}
if (protector.Unprotect(protectedPayload) != expected)
    throw new InvalidOperationException("Recovered fixture payload did not match");
Console.WriteLine("PASS DataProtection persisted encrypted key recovered synthetic payload");
