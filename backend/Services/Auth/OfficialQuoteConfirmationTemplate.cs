using System.Net;

namespace CastroFallas.MiniQuote.Api.Services.Auth;

/// <summary>Customer-facing receipt, not an approved quote or a Dhole login link.</summary>
public sealed record OfficialQuoteConfirmationMessage(string Subject, string PlainText, string Html);

public static class OfficialQuoteConfirmationTemplate
{
    public const string Subject = "Solicitud de cotización enviada | Castro Fallas";
    private const string SiteUrl = "https://www.logisticacastrofallas.com/";
    private const string Heading = "¡Tu solicitud de cotización fue enviada correctamente!";
    private const string Intro = "Gracias por confiar en Castro Fallas.";
    private const string Next = "Nuestro equipo de Pricing atenderá tu solicitud y se pondrá en contacto con vos.";
    private const string Notice = "Este mensaje confirma la recepción de tu solicitud, no una tarifa aprobada.";
    private const string LogoCid = "cf-quote-logo";

    // Exact public white horizontal artwork from frontend/public/images/logo.png.
    // Embed the PNG bytes for mail clients; do not depend on CSS filters or remote images.
    private const string WhiteLogoBase64 = "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";
    public static IReadOnlyList<InlineEmailImage> Images { get; } =
        [new("castro-fallas-logo-blanco.png", "image/png", LogoCid, Convert.FromBase64String(WhiteLogoBase64))];

    public static OfficialQuoteConfirmationMessage Build(Guid quoteId, string? mode,
        string? shipmentType, string? origin, string? destination, IReadOnlyList<string>? services,
        string? verifiedPodName = null)
    {
        if (quoteId == Guid.Empty) throw new ArgumentException("Referencia inválida.", nameof(quoteId));
        var modeLabel = mode switch
        {
            "Maritime" => "Marítimo",
            "Air" => "Aéreo",
            "Land" => "Terrestre",
            _ => "No indicada"
        };
        var typeLabel = shipmentType switch
        {
            "FCL" => "FCL",
            "LCL" => "LCL",
            "AIR_LCL" => "Carga consolidada",
            "FTL" => "FTL",
            "LTL" => "LTL",
            _ => ""
        };
        if (typeLabel.Length > 0) modeLabel += " · " + typeLabel;
        static string Display(string? value) => string.IsNullOrWhiteSpace(value) ? "No indicado" : value;
        static string E(string value) => WebUtility.HtmlEncode(value);
        var fields = new List<(string Label, string Value)>
        {
            ("Modalidad", modeLabel),
            ("Origen", Display(origin))
        };
        if (mode == "Maritime")
        {
            fields.Add(("Puerto de entrada (POE)", Display(destination)));
            fields.Add(("Destino final (POD)", Display(verifiedPodName)));
        }
        else
            fields.Add(("Destino", Display(destination)));
        if (services is { Count: > 0 })
            fields.Add(("Servicios", string.Join(", ", services)));
        var reference = quoteId.ToString("D");
        var rows = string.Concat(fields.Select(field =>
            "<tr><td width=\"104\" valign=\"top\" style=\"padding:8px 12px 8px 0;color:#454545;font-size:14px;font-weight:700;\">" +
            E(field.Label) + "</td><td valign=\"top\" style=\"padding:8px 0;color:#252525;font-size:14px;line-height:1.5;word-break:break-word;\">" +
            E(field.Value) + "</td></tr>"));
        var plain = Heading + "\n\n" + Intro + "\n\n" + Next + "\n\n" +
            string.Join("\n", fields.Select(x => x.Label + ": " + x.Value)) +
            "\n\nReferencia de tu solicitud: " + reference + "\n\n" + Notice +
            "\n\n" + SiteUrl + "\n\nGrupo Castro Fallas";
        var html = $$"""
            <!doctype html>
            <html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
            <meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
            <title>{{Subject}}</title>
            <style>@media screen and (max-width:480px){.cf-outer{padding:10px 6px!important}.cf-body{padding:23px 18px!important}.cf-header{padding:16px 18px!important}.cf-title{font-size:23px!important} }</style>
            </head><body style="margin:0;padding:0;background:#f5f5f5;color:#252525;font-family:Arial,Helvetica,sans-serif;">
            <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">Tu solicitud de cotización fue enviada a Pricing.</div>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f5f5f5"><tr>
            <td class="cf-outer" align="center" style="padding:24px 10px;">
            <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:600px;border:1px solid #e7e3e3;border-radius:14px;overflow:hidden;">
            <tr><td class="cf-header" bgcolor="#ad0d1d" style="background:#ad0d1d;padding:18px 28px;border-radius:13px 13px 0 0;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
              <td width="128" valign="middle">
                <img src="cid:{{LogoCid}}" width="128" height="56" alt="Castro Fallas" style="display:block;width:128px;height:56px;border:0;">
              </td>
              <td valign="middle" style="padding-left:14px;color:#ffffff;">
                <p style="font-size:12px;font-weight:bold;letter-spacing:1px;margin:0 0 7px;color:#ffffff;">GRUPO CASTRO FALLAS</p>
                <p style="font-size:15px;font-weight:bold;line-height:1.4;margin:0;color:#ffffff;">Cotizaciones · Notificaciones</p>
              </td></tr></table>
            </td></tr>
            <tr><td class="cf-body" style="padding:28px 30px 30px;">
              <p style="font-size:12px;color:#955b13;font-weight:bold;letter-spacing:.5px;margin:0 0 12px;">CONFIRMACIÓN DE SOLICITUD</p>
              <h1 class="cf-title" style="font-size:25px;line-height:1.27;color:#ad0d1d;margin:0 0 18px;">{{Heading}}</h1>
              <p style="font-size:15px;line-height:1.55;margin:0 0 12px;">{{Intro}}</p>
              <p style="font-size:15px;line-height:1.55;margin:0 0 18px;">{{Next}}</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-top:1px solid #eee;border-bottom:1px solid #eee;margin-bottom:20px;">{{rows}}</table>
              <p style="color:#555;font-size:12px;font-weight:bold;margin:0 0 5px;">Referencia de tu solicitud</p>
              <p style="font-size:13px;line-height:1.5;word-break:break-all;margin:0 0 20px;">{{reference}}</p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="#f03220" style="background:#f03220;border-radius:7px;">
                <a href="{{SiteUrl}}" style="display:inline-block;color:#ffffff;background:#f03220;font-weight:bold;text-decoration:none;font-size:14px;padding:14px 20px;border-radius:7px;">Visitar nuestro sitio web</a>
              </td></tr></table>
              <p style="font-size:13px;line-height:1.5;color:#646464;margin:20px 0 0;">{{Notice}}</p>
            </td></tr>
            <tr><td bgcolor="#f7f7f7" style="background:#f7f7f7;border-top:1px solid #e7e3e3;padding:18px 30px;color:#646464;font-size:12px;line-height:1.5;border-radius:0 0 13px 13px;">Notificación automática · Grupo Castro Fallas</td></tr>
            </table></td></tr></table></body></html>
            """;
        return new(Subject, plain, html);
    }
}
