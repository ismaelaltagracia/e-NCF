using PrintBridge.Core.Templates;

namespace PrintBridge.Tests;

public class TemplateEngineTests
{
    private readonly TemplateEngine _engine = new();

    [Fact]
    public void Extract_PosGenerico_ExtractsRncAndItems()
    {
        var template = new TemplateConfig
        {
            TipoComprobanteDefault = "E32",
            Mapeo = new()
            {
                ["rnc_receptor"] = new FieldMapping
                {
                    Tipo = "regex",
                    Patron = @"RNC[:\s]*(\d{9,11})",
                    Grupo = 1,
                    Default = "",
                },
                ["nombre_receptor"] = new FieldMapping
                {
                    Tipo = "regex",
                    Patron = @"Cliente[:\s]*(.*)",
                    Grupo = 1,
                    Default = "Consumidor Final",
                },
            },
            Items = new ItemsConfig
            {
                Inicio = new FieldMapping
                {
                    Tipo = "regex",
                    Patron = @"---+\s*DETALLE\s*---+",
                },
                Fin = new FieldMapping
                {
                    Tipo = "regex",
                    Patron = @"---+\s*TOTAL\s*---+",
                },
                PatronLinea = @"^(.{1,25})\s+(\d+)\s+([\d.]+)$",
                CamposLinea = new()
                {
                    ["descripcion"] = 1,
                    ["cantidad"] = 2,
                    ["precio_unitario"] = 3,
                },
            },
            Totales = new TotalesConfig
            {
                Total = new FieldMapping
                {
                    Tipo = "regex",
                    Patron = @"TOTAL[:\s]*\$?([\d,.]+)",
                },
            },
            TasaItbisDefault = 18,
        };

        var text = @"
Farmacia San José
RNC: 123456789
Cliente: Juan Pérez
Fecha: 2026-07-29

---------- DETALLE ----------
Acetaminofén 500mg         2   150.00
Vitamina C 1000mg          1   250.00
---------- TOTAL ----------
SUBTOTAL: $550.00
ITBIS: $99.00
TOTAL: $649.00
";

        var result = _engine.Extract(text, template);

        Assert.Equal("123456789", result.RncReceptor);
        Assert.Equal("Juan Pérez", result.NombreReceptor);
        Assert.Equal("E32", result.TipoComprobante);
        Assert.Equal(2, result.Items.Count);
        Assert.Equal("Acetaminofén 500mg", result.Items[0].Descripcion);
        Assert.Equal(2, result.Items[0].Cantidad);
        Assert.Equal(150.00m, result.Items[0].PrecioUnitario);
        Assert.Equal(649.00m, result.Total);
    }

    [Fact]
    public void Extract_NoRnc_UsesDefault()
    {
        var template = new TemplateConfig
        {
            TipoComprobanteDefault = "E32",
            Mapeo = new()
            {
                ["rnc_receptor"] = new FieldMapping
                {
                    Tipo = "regex",
                    Patron = @"RNC[:\s]*(\d{9,11})",
                    Grupo = 1,
                    Default = "",
                },
                ["nombre_receptor"] = new FieldMapping
                {
                    Tipo = "regex",
                    Patron = @"Cliente[:\s]*(.*)",
                    Grupo = 1,
                    Default = "Consumidor Final",
                },
            },
            Items = new ItemsConfig { PatronLinea = "" },
            Totales = new TotalesConfig(),
        };

        var text = "Venta de contado\nProducto A $500.00";
        var result = _engine.Extract(text, template);

        Assert.Equal("", result.RncReceptor);
        Assert.Equal("Consumidor Final", result.NombreReceptor);
    }

    [Fact]
    public void Extract_PositionMapping_ExtractsFromLineColumn()
    {
        var template = new TemplateConfig
        {
            TipoComprobanteDefault = "E31",
            Mapeo = new()
            {
                ["rnc_receptor"] = new FieldMapping
                {
                    Tipo = "posicion",
                    Linea = 3,
                    ColumnaInicio = 10,
                    ColumnaFin = 21,
                },
            },
            Items = new ItemsConfig { PatronLinea = "" },
            Totales = new TotalesConfig(),
        };

        var text = "FACTURA #001\nFecha: 2026-07-29\n   RNC:   123456789  \nCliente: Test";
        var result = _engine.Extract(text, template);

        Assert.Equal("123456789", result.RncReceptor);
    }
}
