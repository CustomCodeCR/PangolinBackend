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

    // Reuse the existing official corporate artwork. Do not modify OTP assets.
    // Red corporate artwork is placed on a white tile in the red header.
    public static IReadOnlyList<InlineEmailImage> Images { get; } =
        [OtpEmailAssets.Images.Single(x => x.ContentId == OtpEmailAssets.LogoCid) with { ContentId = LogoCid }];

    public static OfficialQuoteConfirmationMessage Build(Guid quoteId, string? mode,
        string? shipmentType, string? origin, string? destination, IReadOnlyList<string>? services)
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
            ("Origen", Display(origin)),
            ("Destino", Display(destination))
        };
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
            <style>@media screen and (max-width:480px){.cf-outer{padding:10px 6px!important}.cf-body{padding:23px 18px!important}.cf-header{padding:16px 18px!important}.cf-title{font-size:23px!important}}</style>
            </head><body style="margin:0;padding:0;background:#f5f5f5;color:#252525;font-family:Arial,Helvetica,sans-serif;">
            <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">Tu solicitud de cotización fue enviada a Pricing.</div>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f5f5f5"><tr>
            <td class="cf-outer" align="center" style="padding:24px 10px;">
            <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:600px;border:1px solid #e7e3e3;border-radius:14px;overflow:hidden;">
            <tr><td class="cf-header" bgcolor="#ad0d1d" style="background:#ad0d1d;padding:18px 28px;border-radius:13px 13px 0 0;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
              <td width="76" valign="middle"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="#ffffff" align="center" style="background:#ffffff;border-radius:6px;padding:6px 10px;">
                <img src="cid:{{LogoCid}}" width="48" height="68" alt="Castro Fallas" style="display:block;width:48px;height:68px;border:0;">
              </td></tr></table></td>
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
