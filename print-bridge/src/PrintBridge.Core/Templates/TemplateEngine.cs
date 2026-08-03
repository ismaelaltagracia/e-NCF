using System.Text.Json;
using System.Text.RegularExpressions;

namespace PrintBridge.Core.Templates;

/// <summary>
/// Motor de plantillas que aplica una TemplateConfig a texto capturado
/// para extraer los campos de una factura.
/// </summary>
public class TemplateEngine
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        PropertyNameCaseInsensitive = true,
    };

    public TemplateConfig LoadTemplate(string templatePath)
    {
        var json = File.ReadAllText(templatePath);
        return JsonSerializer.Deserialize<TemplateConfig>(json, JsonOptions)
            ?? throw new InvalidOperationException($"No se pudo cargar la plantilla: {templatePath}");
    }

    /// <summary>
    /// Extrae datos de factura del texto capturado usando la plantilla dada.
    /// </summary>
    public ExtractedInvoice Extract(string capturedText, TemplateConfig template)
    {
        var result = new ExtractedInvoice
        {
            TipoComprobante = template.TipoComprobanteDefault,
        };

        var lines = capturedText.Split('\n').Select(l => l.TrimEnd('\r')).ToArray();

        // Extract mapped fields
        foreach (var (fieldName, mapping) in template.Mapeo)
        {
            var value = ExtractField(capturedText, lines, mapping);
            switch (fieldName.ToLower())
            {
                case "rnc_receptor":
                    result.RncReceptor = value;
                    break;
                case "nombre_receptor":
                    result.NombreReceptor = value;
                    break;
                case "tipo_comprobante":
                    if (!string.IsNullOrEmpty(value)) result.TipoComprobante = value;
                    break;
            }
        }

        // Extract items
        result.Items = ExtractItems(capturedText, lines, template);

        // Extract totals
        result.Subtotal = ExtractDecimal(capturedText, template.Totales.Subtotal);
        result.Itbis = ExtractDecimal(capturedText, template.Totales.Itbis);
        result.Total = ExtractDecimal(capturedText, template.Totales.Total);

        // If totals not found, calculate from items
        if (result.Total == 0 && result.Items.Count > 0)
        {
            result.Subtotal = result.Items.Sum(i => i.Cantidad * i.PrecioUnitario);
            result.Itbis = result.Items.Sum(i => i.Cantidad * i.PrecioUnitario * (template.TasaItbisDefault / 100m));
            result.Total = result.Subtotal + result.Itbis;
        }

        return result;
    }

    private string ExtractField(string text, string[] lines, FieldMapping mapping)
    {
        if (mapping.Tipo == "regex" && !string.IsNullOrEmpty(mapping.Patron))
        {
            var match = Regex.Match(text, mapping.Patron, RegexOptions.Multiline);
            if (match.Success && match.Groups.Count > mapping.Grupo)
            {
                return match.Groups[mapping.Grupo].Value.Trim();
            }
        }
        else if (mapping.Tipo == "posicion" && mapping.Linea.HasValue)
        {
            var lineIndex = mapping.Linea.Value - 1;
            if (lineIndex >= 0 && lineIndex < lines.Length)
            {
                var line = lines[lineIndex];
                var start = mapping.ColumnaInicio ?? 0;
                var end = mapping.ColumnaFin ?? line.Length;
                if (start < line.Length)
                {
                    return line.Substring(start, Math.Min(end - start, line.Length - start)).Trim();
                }
            }
        }
        else if (mapping.Tipo == "fijo")
        {
            return mapping.Default;
        }

        return mapping.Default;
    }

    private List<ExtractedItem> ExtractItems(string text, string[] lines, TemplateConfig template)
    {
        var items = new List<ExtractedItem>();
        var itemsConfig = template.Items;

        if (string.IsNullOrEmpty(itemsConfig.PatronLinea))
            return items;

        // Find start and end boundaries
        int startLine = 0;
        int endLine = lines.Length;

        if (itemsConfig.Inicio.Tipo == "regex" && !string.IsNullOrEmpty(itemsConfig.Inicio.Patron))
        {
            for (int i = 0; i < lines.Length; i++)
            {
                if (Regex.IsMatch(lines[i], itemsConfig.Inicio.Patron))
                {
                    startLine = i + 1;
                    break;
                }
            }
        }
        else if (itemsConfig.Inicio.Tipo == "linea_numero" && itemsConfig.Inicio.Linea.HasValue)
        {
            startLine = itemsConfig.Inicio.Linea.Value - 1;
        }

        if (itemsConfig.Fin.Tipo == "regex" && !string.IsNullOrEmpty(itemsConfig.Fin.Patron))
        {
            for (int i = startLine; i < lines.Length; i++)
            {
                if (Regex.IsMatch(lines[i], itemsConfig.Fin.Patron))
                {
                    endLine = i;
                    break;
                }
            }
        }

        // Parse each line within boundaries
        var lineRegex = new Regex(itemsConfig.PatronLinea);
        for (int i = startLine; i < endLine; i++)
        {
            var match = lineRegex.Match(lines[i]);
            if (match.Success)
            {
                var item = new ExtractedItem();

                if (itemsConfig.CamposLinea.TryGetValue("descripcion", out var descIdx) && match.Groups.Count > descIdx)
                    item.Descripcion = match.Groups[descIdx].Value.Trim();

                if (itemsConfig.CamposLinea.TryGetValue("cantidad", out var cantIdx) && match.Groups.Count > cantIdx)
                    item.Cantidad = ParseDecimal(match.Groups[cantIdx].Value);

                if (itemsConfig.CamposLinea.TryGetValue("precio_unitario", out var precioIdx) && match.Groups.Count > precioIdx)
                    item.PrecioUnitario = ParseDecimal(match.Groups[precioIdx].Value);

                if (!string.IsNullOrEmpty(item.Descripcion) && item.Cantidad > 0)
                    items.Add(item);
            }
        }

        return items;
    }

    private decimal ExtractDecimal(string text, FieldMapping? mapping)
    {
        if (mapping == null || string.IsNullOrEmpty(mapping.Patron)) return 0;

        var match = Regex.Match(text, mapping.Patron, RegexOptions.Multiline);
        if (match.Success && match.Groups.Count > 1)
        {
            return ParseDecimal(match.Groups[1].Value);
        }
        return 0;
    }

    private static decimal ParseDecimal(string value)
    {
        var cleaned = value.Replace(",", "").Replace(" ", "");
        return decimal.TryParse(cleaned, System.Globalization.NumberStyles.Any,
            System.Globalization.CultureInfo.InvariantCulture, out var result) ? result : 0;
    }
}

/// <summary>
/// Resultado de la extracción de datos de una factura.
/// </summary>
public class ExtractedInvoice
{
    public string RncReceptor { get; set; } = "";
    public string NombreReceptor { get; set; } = "Consumidor Final";
    public string TipoComprobante { get; set; } = "E32";
    public List<ExtractedItem> Items { get; set; } = new();
    public decimal Subtotal { get; set; }
    public decimal Itbis { get; set; }
    public decimal Total { get; set; }
}

public class ExtractedItem
{
    public string Descripcion { get; set; } = "";
    public decimal Cantidad { get; set; } = 1;
    public decimal PrecioUnitario { get; set; }
    public int TasaItbis { get; set; } = 18;
}
