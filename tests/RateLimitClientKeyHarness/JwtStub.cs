// The production implementation reads the standard, already validated "sub" claim.
// Keep this standalone harness independent of external NuGet dependencies.
namespace System.IdentityModel.Tokens.Jwt;
public static class JwtRegisteredClaimNames
{
    public const string Sub = "sub";
}
