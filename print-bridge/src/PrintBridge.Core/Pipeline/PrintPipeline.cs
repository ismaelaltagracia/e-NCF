using PrintBridge.Core.ApiClient;
using PrintBridge.Core.Configuration;
using PrintBridge.Core.Contingency;
using PrintBridge.Core.PrintJob;
using PrintBridge.Core.Templates;

namespace PrintBridge.Core.Pipeline;

/// <summary>
/// Pipeline principal: captura job → extrae datos → envía a API → imprime.
/// </summary>
public class PrintPipeline
{
    private readonly IPrintJobSource _jobSource;
    private readonly TemplateEngine _templateEngine;
    private readonly EncfApiClient _apiClient;
    private readonly AppConfig _config;
    private readonly string _templatesFolder;
    private readonly PendingJobsQueue? _contingencyQueue;

    public event Action<string>? OnLog;
    public event Action<PipelineResult>? OnJobProcessed;

    public PrintPipeline(
        IPrintJobSource jobSource,
        EncfApiClient apiClient,
        AppConfig config,
        string templatesFolder,
        PendingJobsQueue? contingencyQueue = null)
    {
        _jobSource = jobSource;
        _apiClient = apiClient;
        _config = config;
        _templatesFolder = templatesFolder;
        _contingencyQueue = contingencyQueue;
        _templateEngine = new TemplateEngine();
    }

    /// <summary>
    /// Ejecuta el pipeline en loop hasta que se cancele.
    /// </summary>
    public async Task RunAsync(CancellationToken ct)
    {
        Log("Pipeline iniciado. Esperando trabajos de impresión...");

        while (!ct.IsCancellationRequested)
        {
            var job = await _jobSource.WaitForNextJob(ct);
            if (job == null) continue;

            var result = await ProcessJob(job);
            OnJobProcessed?.Invoke(result);
        }
    }

    public async Task<PipelineResult> ProcessJob(CapturedPrintJob job)
    {
        Log($"Job recibido: {job.DocumentName} ({job.JobId})");

        try
        {
            // 1. Load template
            var templatePath = Path.Combine(
                _templatesFolder, $"{_config.PlantillaActiva}.json");

            if (!File.Exists(templatePath))
            {
                return PipelineResult.Error(job.JobId,
                    $"Plantilla no encontrada: {_config.PlantillaActiva}");
            }

            var template = _templateEngine.LoadTemplate(templatePath);

            // 2. Extract data
            var invoice = _templateEngine.Extract(job.Content, template);
            Log($"Datos extraídos: RNC={invoice.RncReceptor}, " +
                $"Items={invoice.Items.Count}, Total={invoice.Total}");

            if (invoice.Items.Count == 0)
            {
                return PipelineResult.Error(job.JobId,
                    "No se pudieron extraer ítems del documento");
            }

            // 3. Send to API
            var response = await _apiClient.CreateInvoice(invoice);
            Log($"Factura creada: NCF={response.ENcf}, " +
                $"Estado={response.EstadoDgii}");

            return PipelineResult.Success(job.JobId, response.ENcf, response.Id);
        }
        catch (ApiException ex) when (ex.StatusCode == 401)
        {
            Log($"ERROR: API Key inválida. Actualícela en Configuración.");
            return PipelineResult.Error(job.JobId, "API Key inválida o revocada");
        }
        catch (ApiException ex)
        {
            Log($"ERROR API ({ex.StatusCode}): {ex.Message}");
            EnqueueForContingency(job);
            return PipelineResult.Error(job.JobId, ex.Message);
        }
        catch (HttpRequestException ex)
        {
            Log($"ERROR de conexión: {ex.Message}");
            EnqueueForContingency(job);
            return PipelineResult.Error(job.JobId, $"Sin conexión: {ex.Message}");
        }
        catch (TaskCanceledException)
        {
            Log("ERROR: Timeout de conexión a la API");
            EnqueueForContingency(job);
            return PipelineResult.Error(job.JobId, "Timeout de conexión");
        }
        catch (Exception ex)
        {
            Log($"ERROR: {ex.Message}");
            EnqueueForContingency(job);
            return PipelineResult.Error(job.JobId, ex.Message);
        }
    }

    private void EnqueueForContingency(CapturedPrintJob job)
    {
        if (_contingencyQueue != null && _config.Comportamiento.ModoContingencia)
        {
            _contingencyQueue.Enqueue(job);
            Log($"📦 Job {job.JobId} encolado para reintento automático");
        }
    }

    private void Log(string message)
    {
        OnLog?.Invoke($"[{DateTime.Now:HH:mm:ss}] {message}");
    }
}

public class PipelineResult
{
    public string JobId { get; set; } = "";
    public bool Exitoso { get; set; }
    public string? ENcf { get; set; }
    public string? FacturaId { get; set; }
    public string? Error { get; set; }
    public DateTime ProcessedAt { get; set; } = DateTime.UtcNow;

    public static PipelineResult Success(string jobId, string? encf, string facturaId)
        => new() { JobId = jobId, Exitoso = true, ENcf = encf, FacturaId = facturaId };

    public static PipelineResult Error(string jobId, string error)
        => new() { JobId = jobId, Exitoso = false, Error = error };
}
