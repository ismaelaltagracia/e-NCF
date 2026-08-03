namespace PrintBridge.Core.PrintJob;

/// <summary>
/// Interfaz para la fuente de trabajos de impresión.
/// En Windows: lee del spooler real.
/// En Docker/testing: lee archivos de una carpeta.
/// </summary>
public interface IPrintJobSource
{
    /// <summary>
    /// Espera y retorna el próximo trabajo de impresión capturado.
    /// </summary>
    Task<CapturedPrintJob?> WaitForNextJob(CancellationToken cancellationToken);
}

/// <summary>
/// Trabajo de impresión capturado de la impresora virtual.
/// </summary>
public class CapturedPrintJob
{
    public string JobId { get; set; } = Guid.NewGuid().ToString();
    public string DocumentName { get; set; } = "";
    public string Content { get; set; } = "";
    public DateTime CapturedAt { get; set; } = DateTime.UtcNow;
    public string SourcePrinter { get; set; } = "";
}
