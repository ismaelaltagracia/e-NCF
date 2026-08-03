using System.Text.Json;

namespace PrintBridge.Core.Configuration;

/// <summary>
/// Carga y persiste la configuración desde/hacia config.json.
/// </summary>
public class ConfigLoader
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        WriteIndented = true,
        PropertyNameCaseInsensitive = true,
    };

    private readonly string _configPath;

    public ConfigLoader(string configPath)
    {
        _configPath = configPath;
    }

    public AppConfig Load()
    {
        if (!File.Exists(_configPath))
        {
            var defaultConfig = new AppConfig();
            Save(defaultConfig);
            return defaultConfig;
        }

        var json = File.ReadAllText(_configPath);
        return JsonSerializer.Deserialize<AppConfig>(json, JsonOptions) ?? new AppConfig();
    }

    public void Save(AppConfig config)
    {
        var dir = Path.GetDirectoryName(_configPath);
        if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
        {
            Directory.CreateDirectory(dir);
        }

        var json = JsonSerializer.Serialize(config, JsonOptions);
        File.WriteAllText(_configPath, json);
    }

    public void UpdateApiKey(string newApiKey)
    {
        var config = Load();
        config.Api.ApiKey = newApiKey;
        Save(config);
    }
}
