using System.Text.Json;
using PrintBridge.Core.PrintJob;

namespace PrintBridge.Core.Contingency;

/// <summary>
/// Cola local de jobs pendientes cuando la API no está disponible.
/// Persiste en disco como archivos JSON para sobrevivir reinicios.
/// </summary>
public class PendingJobsQueue
{
    private readonly string _pendingFolder;
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    public PendingJobsQueue(string pendingFolder)
    {
        _pendingFolder = pendingFolder;
        Directory.CreateDirectory(_pendingFolder);
    }

    /// <summary>
    /// Encola un job que no se pudo enviar a la API.
    /// </summary>
    public void Enqueue(CapturedPrintJob job)
    {
        var filePath = Path.Combine(_pendingFolder, $"{job.JobId}.json");
        var json = JsonSerializer.Serialize(job, JsonOpts);
        File.WriteAllText(filePath, json);
    }

    /// <summary>
    /// Retorna todos los jobs pendientes en orden cronológico.
    /// </summary>
    public List<CapturedPrintJob> GetAll()
    {
        var jobs = new List<CapturedPrintJob>();
        var files = Directory.GetFiles(_pendingFolder, "*.json")
            .OrderBy(f => File.GetCreationTimeUtc(f));

        foreach (var file in files)
        {
            try
            {
                var json = File.ReadAllText(file);
                var job = JsonSerializer.Deserialize<CapturedPrintJob>(json, JsonOpts);
                if (job != null) jobs.Add(job);
            }
            catch { /* Skip corrupted files */ }
        }

        return jobs;
    }

    /// <summary>
    /// Cantidad de jobs pendientes.
    /// </summary>
    public int Count => Directory.GetFiles(_pendingFolder, "*.json").Length;

    /// <summary>
    /// Elimina un job de la cola (fue procesado exitosamente).
    /// </summary>
    public void Remove(string jobId)
    {
        var filePath = Path.Combine(_pendingFolder, $"{jobId}.json");
        if (File.Exists(filePath))
            File.Delete(filePath);
    }

    /// <summary>
    /// Retorna y elimina el primer job de la cola.
    /// </summary>
    public CapturedPrintJob? Dequeue()
    {
        var files = Directory.GetFiles(_pendingFolder, "*.json")
            .OrderBy(f => File.GetCreationTimeUtc(f))
            .ToArray();

        if (files.Length == 0) return null;

        var filePath = files[0];
        try
        {
            var json = File.ReadAllText(filePath);
            var job = JsonSerializer.Deserialize<CapturedPrintJob>(json, JsonOpts);
            File.Delete(filePath);
            return job;
        }
        catch
        {
            File.Delete(filePath);
            return null;
        }
    }
}
