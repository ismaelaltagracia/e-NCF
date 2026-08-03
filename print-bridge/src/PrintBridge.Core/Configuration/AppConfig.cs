namespace PrintBridge.Core.Configuration;

/// <summary>
/// Configuración principal del Print Bridge cargada desde config.json.
/// </summary>
public class AppConfig
{
    public ApiConfig Api { get; set; } = new();
    public VirtualPrinterConfig ImpresoraVirtual { get; set; } = new();
    public PhysicalPrinterConfig ImpresoraFisica { get; set; } = new();
    public List<PrintRouteConfig> RuteoImpresoras { get; set; } = new();
    public string PlantillaActiva { get; set; } = "pos-generico";
    public BehaviorConfig Comportamiento { get; set; } = new();
}

public class ApiConfig
{
    public string BaseUrl { get; set; } = "https://localhost:3000";
    public string ApiKey { get; set; } = "";
}

public class VirtualPrinterConfig
{
    public string Nombre { get; set; } = "e-NCF Print Bridge";
    public string Puerto { get; set; } = "ENCF_PORT";
    public string FormatoCaptura { get; set; } = "text";
}

public class PhysicalPrinterConfig
{
    public string Nombre { get; set; } = "";
    public string Tipo { get; set; } = "termica"; // termica | carta
    public int AnchoMm { get; set; } = 80;
}

public class PrintRouteConfig
{
    public List<string> Tipos { get; set; } = new() { "*" };
    public string Impresora { get; set; } = "";
    public string Formato { get; set; } = "termica_80mm";
}

public class BehaviorConfig
{
    public bool ImprimirDespuesDeEnviar { get; set; } = true;
    public bool AgregarQr { get; set; } = true;
    public bool AgregarNcfAlRecibo { get; set; } = true;
    public bool ReintentarSiFallaDgii { get; set; } = true;
    public int MaxReintentos { get; set; } = 3;
    public int TimeoutApiMs { get; set; } = 30000;
    public bool ModoContingencia { get; set; } = true;
    public string LogLevel { get; set; } = "info";
}
