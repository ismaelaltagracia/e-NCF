using PrintBridge.Core.ApiClient;
using PrintBridge.Core.Configuration;
using PrintBridge.Core.Pipeline;
using PrintBridge.Core.Templates;

namespace PrintBridge.Core.Contingency;

/// <summary>
/// Procesador de cola de contingencia.
/// Cada 60 segundos intenta reenviar los jobs pendientes a la API.
/// </summary>
public class ContingencyProcessor
{
    private readonly PendingJobsQueue _queue;
    private readonly EncfApiClient _apiClient;
    private readonly TemplateEngine _templateEngine;
    private readonly AppConfig _config;
    private readonly string _templatesFolder;

    public event Action<string>? OnLog;

    public ContingencyProcessor(
        PendingJobsQueue queue,
        EncfApiClient apiClient,
        AppConfig config,
        string templatesFolder)
    {
        _queue = queue;
        _apiClient = apiClient;
        _config = config;
        _templatesFolder = templatesFolder;
        _templateEngine = new TemplateEngine();
    }

    /// <summary>
    /// Loop que cada 60 segundos intenta procesar jobs pendientes.
    /// </summary>
    public async Task RunAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            await Task.Delay(TimeSpan.FromSeconds(60), ct);

            if (_queue.Count == 0) continue;

            Log($"Procesando {_queue.Count} job(s) pendientes...");
            await ProcessPendingJobs();
        }
    }

    public async Task ProcessPendingJobs()
    {
        // Test connection first
        var connected = await _apiClient.TestConnection();
        if (!connected)
        {
            Log("API no disponible. Se reintentará en 60 segundos.");
            return;
        }

        var jobs = _queue.GetAll();
        var processed = 0;
        var failed = 0;

        foreach (var job in jobs)
        {
            try
            {
                var templatePath = Path.Combine(
                    _templatesFolder, $"{_config.PlantillaActiva}.json");
                var template = _templateEngine.LoadTemplate(templatePath);
                var invoice = _templateEngine.Extract(job.Content, template);

                var response = await _apiClient.CreateInvoice(invoice);
                _queue.Remove(job.JobId);
                processed++;

                Log($"✅ Job pendiente {job.JobId} enviado: NCF={response.ENcf}");
            }
            catch (ApiException ex) when (ex.StatusCode == 401)
            {
                Log("API Key inválida. Deteniendo procesamiento de cola.");
                break;
            }
            catch (Exception ex)
            {
                failed++;
                Log($"❌ Job {job.JobId} falló de nuevo: {ex.Message}");
            }
        }

        if (processed > 0 || failed > 0)
            Log($"Cola: {processed} enviados, {failed} fallidos, {_queue.Count} pendientes");
    }

    private void Log(string msg)
    {
        OnLog?.Invoke($"[CONTINGENCIA {DateTime.Now:HH:mm:ss}] {msg}");
    }
}
