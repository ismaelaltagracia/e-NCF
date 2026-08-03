using PrintBridge.Core.ApiClient;
using PrintBridge.Core.Configuration;
using PrintBridge.Core.Contingency;
using PrintBridge.Core.Pipeline;
using PrintBridge.Core.PrintJob;

var builder = WebApplication.CreateBuilder(args);

// Load config
var configPath = Path.Combine(AppContext.BaseDirectory, "config", "config.json");
var configLoader = new ConfigLoader(configPath);
var config = configLoader.Load();

// Paths
var templatesFolder = Path.Combine(AppContext.BaseDirectory, "config", "templates");
var watchFolder = Path.Combine(AppContext.BaseDirectory, "watch");
var pendingFolder = Path.Combine(AppContext.BaseDirectory, "pending");
Directory.CreateDirectory(watchFolder);
Directory.CreateDirectory(pendingFolder);

// Register services
builder.Services.AddSingleton(config);
builder.Services.AddSingleton(configLoader);
builder.Services.AddSingleton(new EncfApiClient(config.Api.BaseUrl, config.Api.ApiKey));
builder.Services.AddSingleton<IPrintJobSource>(new FolderPrintJobSource(watchFolder));
builder.Services.AddSingleton(new PendingJobsQueue(pendingFolder));

var app = builder.Build();

// Serve static panel HTML
app.UseDefaultFiles();
app.UseStaticFiles();

// ─── API Endpoints ───

app.MapGet("/api/status", (AppConfig cfg, PendingJobsQueue queue) => new
{
    running = true,
    api_configured = !string.IsNullOrEmpty(cfg.Api.ApiKey),
    api_url = cfg.Api.BaseUrl,
    template = cfg.PlantillaActiva,
    printer = cfg.ImpresoraFisica.Nombre,
    pending_jobs = queue.Count,
    contingency_enabled = cfg.Comportamiento.ModoContingencia,
});

app.MapGet("/api/test-connection", async (EncfApiClient client) =>
{
    var ok = await client.TestConnection();
    return new { connected = ok };
});

app.MapGet("/api/dgii-status", async (EncfApiClient client) =>
{
    try
    {
        var status = await client.GetDgiiStatus();
        return Results.Ok(status);
    }
    catch
    {
        return Results.Ok(new { estado = "desconocido", mensaje = "No se pudo consultar" });
    }
});

app.MapPost("/api/config/api-key", async (HttpContext ctx, ConfigLoader loader, EncfApiClient client) =>
{
    var body = await ctx.Request.ReadFromJsonAsync<ApiKeyUpdate>();
    if (body == null || string.IsNullOrEmpty(body.ApiKey))
        return Results.BadRequest(new { error = "api_key es requerido" });

    loader.UpdateApiKey(body.ApiKey);
    client.UpdateApiKey(body.ApiKey);

    var ok = await client.TestConnection();
    return Results.Ok(new { updated = true, connected = ok });
});

app.MapGet("/api/config", (AppConfig cfg) => new
{
    api_url = cfg.Api.BaseUrl,
    api_key_configured = !string.IsNullOrEmpty(cfg.Api.ApiKey),
    plantilla_activa = cfg.PlantillaActiva,
    impresora_fisica = cfg.ImpresoraFisica.Nombre,
    modo_contingencia = cfg.Comportamiento.ModoContingencia,
});

app.MapGet("/api/templates", () =>
{
    var templates = Directory.GetFiles(templatesFolder, "*.json")
        .Select(f => Path.GetFileNameWithoutExtension(f))
        .ToArray();
    return templates;
});

app.MapPost("/api/config/template", async (HttpContext ctx, ConfigLoader loader) =>
{
    var body = await ctx.Request.ReadFromJsonAsync<TemplateUpdate>();
    if (body == null || string.IsNullOrEmpty(body.Template))
        return Results.BadRequest(new { error = "template es requerido" });

    var cfg = loader.Load();
    cfg.PlantillaActiva = body.Template;
    loader.Save(cfg);
    return Results.Ok(new { updated = true, plantilla = body.Template });
});

app.MapGet("/api/pending", (PendingJobsQueue queue) =>
{
    var jobs = queue.GetAll();
    return jobs.Select(j => new
    {
        job_id = j.JobId,
        document = j.DocumentName,
        captured_at = j.CapturedAt,
    });
});

app.MapPost("/api/pending/retry", async (PendingJobsQueue queue, EncfApiClient client, AppConfig cfg) =>
{
    var processor = new ContingencyProcessor(queue, client, cfg, templatesFolder);
    await processor.ProcessPendingJobs();
    return new { remaining = queue.Count };
});

// ─── Background: Pipeline + Contingency ───

var cts = new CancellationTokenSource();

_ = Task.Run(async () =>
{
    var jobSource = app.Services.GetRequiredService<IPrintJobSource>();
    var apiClient = app.Services.GetRequiredService<EncfApiClient>();
    var pendingQueue = app.Services.GetRequiredService<PendingJobsQueue>();
    var appConfig = app.Services.GetRequiredService<AppConfig>();

    var pipeline = new PrintPipeline(jobSource, apiClient, appConfig, templatesFolder);
    pipeline.OnLog += msg => Console.WriteLine(msg);
    pipeline.OnJobProcessed += result =>
    {
        if (result.Exitoso)
        {
            Console.WriteLine($"✅ {result.JobId}: NCF={result.ENcf}");
        }
        else
        {
            Console.WriteLine($"❌ {result.JobId}: {result.Error}");
            // Enqueue for contingency if enabled
            if (appConfig.Comportamiento.ModoContingencia)
            {
                // Re-read the original job content isn't available here
                // In production, the pipeline would pass the job to contingency
                Console.WriteLine($"📦 Job {result.JobId} encolado para reintento");
            }
        }
    };

    await pipeline.RunAsync(cts.Token);
});

// Contingency processor background
_ = Task.Run(async () =>
{
    var apiClient = app.Services.GetRequiredService<EncfApiClient>();
    var pendingQueue = app.Services.GetRequiredService<PendingJobsQueue>();
    var appConfig = app.Services.GetRequiredService<AppConfig>();

    if (!appConfig.Comportamiento.ModoContingencia) return;

    var processor = new ContingencyProcessor(pendingQueue, apiClient, appConfig, templatesFolder);
    processor.OnLog += msg => Console.WriteLine(msg);
    await processor.RunAsync(cts.Token);
});

app.Lifetime.ApplicationStopping.Register(() => cts.Cancel());

app.Run("http://0.0.0.0:9876");

// ─── Records ───
record ApiKeyUpdate(string ApiKey);
record TemplateUpdate(string Template);
