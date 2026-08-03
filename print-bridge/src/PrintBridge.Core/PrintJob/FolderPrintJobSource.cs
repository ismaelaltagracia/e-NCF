namespace PrintBridge.Core.PrintJob;

/// <summary>
/// Fuente de trabajos de impresión basada en archivos.
/// Monitorea una carpeta y toma cada archivo nuevo como un "job" de impresión.
/// Útil para testing y Docker (sin spooler de Windows).
/// </summary>
public class FolderPrintJobSource : IPrintJobSource
{
    private readonly string _watchFolder;
    private readonly string _processedFolder;

    public FolderPrintJobSource(string watchFolder)
    {
        _watchFolder = watchFolder;
        _processedFolder = Path.Combine(watchFolder, "processed");
        Directory.CreateDirectory(_watchFolder);
        Directory.CreateDirectory(_processedFolder);
    }

    public async Task<CapturedPrintJob?> WaitForNextJob(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            var files = Directory.GetFiles(_watchFolder, "*.txt")
                .Concat(Directory.GetFiles(_watchFolder, "*.prn"))
                .OrderBy(f => File.GetCreationTimeUtc(f))
                .ToArray();

            if (files.Length > 0)
            {
                var filePath = files[0];
                var content = await File.ReadAllTextAsync(filePath, cancellationToken);

                var job = new CapturedPrintJob
                {
                    JobId = Path.GetFileNameWithoutExtension(filePath),
                    DocumentName = Path.GetFileName(filePath),
                    Content = content,
                    CapturedAt = File.GetCreationTimeUtc(filePath),
                    SourcePrinter = "FolderSource",
                };

                // Move to processed
                var destPath = Path.Combine(_processedFolder, Path.GetFileName(filePath));
                File.Move(filePath, destPath, overwrite: true);

                return job;
            }

            await Task.Delay(1000, cancellationToken);
        }

        return null;
    }
}
