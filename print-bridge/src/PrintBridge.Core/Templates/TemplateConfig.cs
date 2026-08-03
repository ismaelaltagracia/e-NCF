namespace PrintBridge.Core.Templates;

/// <summary>
/// Configuración de una plantilla de extracción de datos.
/// Define cómo parsear el texto capturado de la impresión para extraer campos de factura.
/// </summary>
public class TemplateConfig
{
    public string Nombre { get; set; } = "";
    public string Version { get; set; } = "1.0";
    public string FormatoEntrada { get; set; } = "text"; // text | pdf
    public string TipoComprobanteDefault { get; set; } = "E32";
    public string SeparadorItems { get; set; } = "\n";
    public Dictionary<string, FieldMapping> Mapeo { get; set; } = new();
    public ItemsConfig Items { get; set; } = new();
    public TotalesConfig Totales { get; set; } = new();
    public int TasaItbisDefault { get; set; } = 18;
}

public class FieldMapping
{
    public string Tipo { get; set; } = "regex"; // regex | posicion | fijo
    public string? Patron { get; set; }
    public int Grupo { get; set; } = 1;
    public int? Linea { get; set; }
    public int? ColumnaInicio { get; set; }
    public int? ColumnaFin { get; set; }
    public bool Obligatorio { get; set; } = false;
    public string Default { get; set; } = "";
}

public class ItemsConfig
{
    public FieldMapping Inicio { get; set; } = new();
    public FieldMapping Fin { get; set; } = new();
    public string PatronLinea { get; set; } = "";
    public Dictionary<string, int> CamposLinea { get; set; } = new();
}

public class TotalesConfig
{
    public FieldMapping? Subtotal { get; set; }
    public FieldMapping? Itbis { get; set; }
    public FieldMapping? Total { get; set; }
}
