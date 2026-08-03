using System.Net.Http.Json;
using System.Text.Json;
using PrintBridge.Core.Templates;

namespace PrintBridge.Core.ApiClient;

/// <summary>
/// Cliente HTTP para la API e-NCF.
/// Autenticación por API Key (header X-API-Key).
/// </summary>
public class EncfApiClient : IDisposable
{
    private readonly HttpClient _http;
    private readonly string _baseUrl;
    private string _apiKey;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        PropertyNameCaseInsensitive = true,
    };

    public EncfApiClient(string baseUrl, string apiKey)
    {
        _baseUrl = baseUrl.TrimEnd('/');
        _apiKey = apiKey;
        _http = new HttpClient
        {
            Timeout = TimeSpan.FromSeconds(30),
        };
    }

    /// <summary>
    /// Actualiza la API Key en caliente (sin reiniciar el servicio).
    /// </summary>
    public void UpdateApiKey(string newApiKey)
    {
        _apiKey = newApiKey;
    }

    /// <summary>
    /// Verifica que la conexión a la API funciona con la API Key actual.
    /// </summary>
    public async Task<bool> TestConnection()
    {
        try
        {
            var request = CreateRequest(HttpMethod.Get, "/api/v1/dgii/estado-conexion");
            var response = await _http.SendAsync(request);
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    /// <summary>
    /// Crea una factura en la API e-NCF a partir de los datos extraídos.
    /// </summary>
    public async Task<CreateInvoiceResponse> CreateInvoice(ExtractedInvoice invoice)
    {
        var payload = new
        {
            rnc_receptor = invoice.RncReceptor,
            nombre_receptor = invoice.NombreReceptor,
            tipo_comprobante = invoice.TipoComprobante,
            items = invoice.Items.Select(i => new
            {
                descripcion = i.Descripcion,
                cantidad = i.Cantidad,
                precio_unitario = i.PrecioUnitario,
                tasa_itbis = i.TasaItbis,
            }).ToArray(),
        };

        var request = CreateRequest(HttpMethod.Post, "/api/v1/facturas");
        request.Content = JsonContent.Create(payload, options: JsonOptions);

        var response = await _http.SendAsync(request);

        if (!response.IsSuccessStatusCode)
        {
            var errorBody = await response.Content.ReadAsStringAsync();
            throw new ApiException(
                (int)response.StatusCode,
                $"API error {(int)response.StatusCode}: {errorBody}"
            );
        }

        var result = await response.Content.ReadFromJsonAsync<CreateInvoiceResponse>(JsonOptions);
        return result ?? throw new ApiException(0, "Respuesta vacía de la API");
    }

    /// <summary>
    /// Consulta el estado de conexión DGII.
    /// </summary>
    public async Task<DgiiStatusResponse> GetDgiiStatus()
    {
        var request = CreateRequest(HttpMethod.Get, "/api/v1/dgii/estado-conexion");
        var response = await _http.SendAsync(request);
        response.EnsureSuccessStatusCode();

        var result = await response.Content.ReadFromJsonAsync<DgiiStatusResponse>(JsonOptions);
        return result ?? new DgiiStatusResponse { Estado = "desconocido" };
    }

    private HttpRequestMessage CreateRequest(HttpMethod method, string path)
    {
        var request = new HttpRequestMessage(method, $"{_baseUrl}{path}");
        request.Headers.Add("X-API-Key", _apiKey);
        return request;
    }

    public void Dispose()
    {
        _http.Dispose();
    }
}

public class CreateInvoiceResponse
{
    public string Id { get; set; } = "";
    public string? ENcf { get; set; }
    public string? TrackId { get; set; }
    public string EstadoDgii { get; set; } = "";
}

public class DgiiStatusResponse
{
    public string Estado { get; set; } = "";
    public string? Mensaje { get; set; }
    public string? CircuitBreaker { get; set; }
}

public class ApiException : Exception
{
    public int StatusCode { get; }

    public ApiException(int statusCode, string message) : base(message)
    {
        StatusCode = statusCode;
    }
}
