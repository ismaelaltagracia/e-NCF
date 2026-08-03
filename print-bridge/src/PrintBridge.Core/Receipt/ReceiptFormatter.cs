using System.Text;

namespace PrintBridge.Core.Receipt;

/// <summary>
/// Formatea el recibo final que se enviará a la impresora física.
/// Agrega NCF, Track ID, y texto de verificación al contenido original.
/// </summary>
public class ReceiptFormatter
{
    /// <summary>
    /// Genera el texto del recibo con los datos del e-CF agregados.
    /// </summary>
    public string FormatReceipt(string originalContent, ReceiptData data, ReceiptOptions options)
    {
        var sb = new StringBuilder();

        // Original content
        sb.AppendLine(originalContent);

        // Separator
        sb.AppendLine("════════════════════════════════════");

        // NCF
        if (options.AgregarNcf && !string.IsNullOrEmpty(data.ENcf))
        {
            sb.AppendLine($"  No. Comprobante: {data.ENcf}");
        }

        // Track ID
        if (!string.IsNullOrEmpty(data.TrackId))
        {
            sb.AppendLine($"  Track ID: {data.TrackId}");
        }

        // Security code
        if (!string.IsNullOrEmpty(data.CodigoSeguridad))
        {
            sb.AppendLine($"  Código: {data.CodigoSeguridad}");
        }

        // Verification URL
        sb.AppendLine();
        sb.AppendLine("  Verificar en: dgii.gov.do/ConsultaNCF");

        // Contingency warning
        if (data.EsContingencia)
        {
            sb.AppendLine();
            sb.AppendLine("  ⚠ EMITIDO EN CONTINGENCIA");
            sb.AppendLine("  Pendiente de envío a DGII");
        }

        sb.AppendLine("════════════════════════════════════");

        return sb.ToString();
    }

    /// <summary>
    /// Genera texto formateado para impresora térmica (80mm, ~42 chars por línea).
    /// </summary>
    public string FormatThermal(string originalContent, ReceiptData data, ReceiptOptions options)
    {
        var sb = new StringBuilder();
        var lineWidth = 42;

        sb.AppendLine(originalContent);
        sb.AppendLine(new string('-', lineWidth));

        if (options.AgregarNcf && !string.IsNullOrEmpty(data.ENcf))
        {
            sb.AppendLine(CenterText($"NCF: {data.ENcf}", lineWidth));
        }

        if (!string.IsNullOrEmpty(data.TrackId))
        {
            sb.AppendLine(CenterText($"Track: {data.TrackId}", lineWidth));
        }

        sb.AppendLine();
        sb.AppendLine(CenterText("Verificar: dgii.gov.do", lineWidth));

        if (data.EsContingencia)
        {
            sb.AppendLine();
            sb.AppendLine(CenterText("** PENDIENTE ENVIO DGII **", lineWidth));
        }

        sb.AppendLine(new string('-', lineWidth));

        return sb.ToString();
    }

    private static string CenterText(string text, int width)
    {
        if (text.Length >= width) return text;
        var padding = (width - text.Length) / 2;
        return text.PadLeft(padding + text.Length);
    }
}

public class ReceiptData
{
    public string? ENcf { get; set; }
    public string? TrackId { get; set; }
    public string? CodigoSeguridad { get; set; }
    public bool EsContingencia { get; set; }
}

public class ReceiptOptions
{
    public bool AgregarNcf { get; set; } = true;
    public bool AgregarQr { get; set; } = true;
    public string Formato { get; set; } = "termica_80mm"; // termica_80mm | carta
}
