FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY PrintBridge.sln .
COPY src/PrintBridge.Core/PrintBridge.Core.csproj src/PrintBridge.Core/
COPY src/PrintBridge.Api/PrintBridge.Api.csproj src/PrintBridge.Api/
COPY tests/PrintBridge.Tests/PrintBridge.Tests.csproj tests/PrintBridge.Tests/
RUN dotnet restore

COPY . .
RUN dotnet build -c Release --no-restore
RUN dotnet test tests/PrintBridge.Tests -c Release --no-build --verbosity normal

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
COPY --from=build /src/src/PrintBridge.Api/bin/Release/net8.0/ .
COPY --from=build /src/config/ ./config/

# Create watch folder for test print jobs
RUN mkdir -p /app/watch

EXPOSE 9876
ENTRYPOINT ["dotnet", "PrintBridge.Api.dll"]
