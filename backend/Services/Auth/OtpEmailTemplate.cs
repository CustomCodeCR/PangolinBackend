using System.Text;
using System.Net;

namespace CastroFallas.MiniQuote.Api.Services.Auth;

/// <summary>
/// Presentación del OTP para email. No registra códigos ni los incorpora a URLs.
/// Diseñada con tablas y estilos en línea para clientes de correo.
/// </summary>
public static class OtpEmailTemplate
{
    public const string LoginUrl = "https://www.logisticacastrofallas.com/bienvenidos";

    // Each OTP delivery gets an independent, non-sensitive reference in the subject.
    // This reduces Gmail conversation grouping without exposing the access code.
    public static string Subject() =>
        "Código de acceso | Castro Fallas · " +
        Convert.ToHexString(RandomNumberGenerator.GetBytes(4));

    // The fragment carries only an opaque challenge ID, never the OTP.
    // Fragments stay in the browser and are not transmitted to the web server.
    public static string VerificationUrl(Guid challengeId, string? loginBaseUrl = null)
    {
        if (challengeId == Guid.Empty)
            throw new ArgumentException("Challenge ID inválido.", nameof(challengeId));
        var configured = loginBaseUrl ?? LoginUrl;
        if (!Uri.TryCreate(configured, UriKind.Absolute, out var address) ||
            address.Scheme is not ("https" or "http") ||
            !address.AbsolutePath.Equals("/bienvenidos", StringComparison.OrdinalIgnoreCase) ||
            !string.IsNullOrEmpty(address.UserInfo) ||
            !string.IsNullOrEmpty(address.Query) ||
            !string.IsNullOrEmpty(address.Fragment))
            throw new ArgumentException("Email:LoginUrl debe ser una URL absoluta de /bienvenidos sin parámetros.", nameof(loginBaseUrl));
        return new UriBuilder(address) { Fragment = $"otpRequest={challengeId:D}" }.Uri.AbsoluteUri;
    }

    public static string PlainText(string otp, string? verificationUrl = null)
    {
        ValidateOtp(otp);
        return $"Tu código de acceso a Castro Fallas es: {otp}\n\n" +
               "Este código vence en 5 minutos y puede utilizarse una sola vez.\n\n" +
               $"Ingresá a {verificationUrl ?? LoginUrl} para escribir el código.\n\n" +
               "Si no solicitaste este código, podés ignorar este mensaje. Tu cuenta se mantiene segura.";
    }

    public static string Html(string otp, string? verificationUrl = null)
    {
        ValidateOtp(otp);
        var verificationHref = WebUtility.HtmlEncode(verificationUrl ?? LoginUrl);

        // Elementos consecutivos, sin espacios entre los dígitos en el HTML,
        // para que también puedan seleccionarse y copiarse manualmente.
        var digits = new StringBuilder();
        foreach (var digit in otp)
        {
            digits.Append("<span style=\"display:inline-block;box-sizing:border-box;width:34px;height:40px;line-height:38px;margin:0 3px 5px 0;border:1px solid #edd4d9;border-radius:7px;background:#ffffff;color:#a50921;font-family:Arial,Helvetica,sans-serif;font-size:25px;font-weight:700;text-align:center;vertical-align:middle;\">")
                .Append(digit)
                .Append("</span>");
        }

        return $$"""
            <!doctype html>
            <html lang="es">
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width,initial-scale=1">
              <meta name="color-scheme" content="light">
              <meta name="supported-color-schemes" content="light">
              <title>Tu código de acceso | Castro Fallas</title>
              <style>
                @media screen and (max-width:560px) {
                  .cf-outer { padding:16px 10px !important; }
                  .cf-panel { width:100% !important; }
                  .cf-brand { display:block !important; width:100% !important; padding:16px 18px 3px !important; text-align:center !important; }
                  .cf-brand img { width:78px !important; height:111px !important; }
                  .cf-globe { display:none !important; }
                  .cf-content { display:block !important; width:auto !important; padding:13px 19px 22px !important; text-align:center !important; }
                  .cf-actions { margin-left:auto !important; margin-right:auto !important; }
                  .cf-code { white-space:nowrap !important; }
                }
              </style>
            </head>
            <body style="margin:0;padding:0;background:#f6f6f6;color:#17202b;font-family:Arial,Helvetica,sans-serif;">
              <div style="display:none!important;visibility:hidden;opacity:0;height:0;max-height:0;overflow:hidden;mso-hide:all;">Tu código de acceso a Castro Fallas vence en 5 minutos.</div>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:collapse;background:#f6f6f6;">
                <tr><td align="center" class="cf-outer" style="padding:30px 14px;">
                  <table role="presentation" class="cf-panel" cellspacing="0" cellpadding="0" border="0" width="640" style="border-collapse:separate;width:100%;max-width:640px;background:#ffffff;border:1px solid #ebebeb;border-radius:14px;overflow:hidden;">
                    <tr>
                      <td class="cf-brand" width="164" valign="middle" align="center" style="width:164px;box-sizing:border-box;padding:19px 16px;background:#ffffff;">
                        <img src="cid:cf-otp-logo" width="95" height="135" alt="Castro Fallas" style="display:block;width:95px;height:135px;margin:0 auto;border:0;">
                      </td>
                      <td class="cf-content" width="262" valign="middle" style="width:262px;box-sizing:border-box;padding:29px 5px 26px 2px;text-align:left;background:#ffffff;">
                        <h1 style="margin:0 0 8px;color:#151923;font-size:22px;line-height:1.2;font-weight:700;">Tu código de acceso</h1>
                        <div style="height:2px;width:100%;max-width:245px;background:#af0922;margin:0 0 12px;"></div>
                        <p style="margin:0 0 14px;font-size:12px;line-height:1.5;color:#5f6268;">Usá este código para iniciar sesión de forma segura.</p>
                        <div class="cf-code" role="group" aria-label="Código de acceso de seis dígitos" style="white-space:nowrap;margin:0 0 9px;letter-spacing:0;font-size:0;">{{digits}}</div>
                        <table role="presentation" class="cf-actions" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;margin:0 0 13px;">
                          <tr><td align="center" bgcolor="#af0922" style="border-radius:6px;">
                            <a href="{{verificationHref}}" style="display:inline-block;padding:11px 28px;color:#ffffff;background:#af0922;border-radius:6px;text-decoration:none;font-size:12px;font-weight:700;line-height:1;">Ingresar código</a>
                          </td></tr>
                        </table>
                        <p style="margin:0 0 12px;font-size:11px;line-height:1.5;color:#52555d;">&#9201; Este código vence en <strong style="color:#a50921;">5 minutos.</strong></p>
                        <p style="margin:0;color:#73757c;font-size:10px;line-height:1.5;">Si no solicitaste este código, podés ignorar este mensaje. Tu cuenta se mantiene segura.</p>
                      </td>
                      <!-- Extend the existing globe fade 50px into the center while keeping the right edge fixed. -->
                      <td class="cf-globe" width="214" valign="top" align="right" style="width:214px;box-sizing:border-box;padding:0;background:#ffffff;vertical-align:top;">
                        <img src="cid:cf-otp-globe" width="214" height="318" alt="" style="display:block;width:214px;height:318px;border:0;">
                      </td>
                    </tr>
                    <tr><td colspan="3" bgcolor="#af0922" style="background:#af0922;height:7px;font-size:0;line-height:7px;">&nbsp;</td></tr>
                  </table>
                </td></tr>
              </table>
            </body>
            </html>
            """;
    }

    private static void ValidateOtp(string otp)
    {
        if (otp is null || otp.Length != 6 || otp.Any(c => c < '0' || c > '9'))
            throw new ArgumentException("El OTP debe tener exactamente seis dígitos.", nameof(otp));
    }
}
