#!/bin/bash
#
# e-NCF — Verificación del servidor Debian antes/después del despliegue.
# Ejecuta en el servidor:  bash check-server.sh
# No modifica nada; solo reporta. Comparte la salida para diagnóstico.
#

echo "═══════════════════════════════════════════"
echo "  e-NCF — Diagnóstico del servidor"
echo "═══════════════════════════════════════════"

echo ""
echo "── Sistema ──"
. /etc/os-release 2>/dev/null && echo "OS: $PRETTY_NAME"
echo "Kernel: $(uname -r)"
echo "Arquitectura: $(uname -m)"
echo "Uptime: $(uptime -p 2>/dev/null)"

echo ""
echo "── Recursos ──"
echo "CPU cores: $(nproc)"
echo "Memoria:"
free -h | awk 'NR==1||NR==2'
echo "Disco (/ y /opt):"
df -h / /opt 2>/dev/null | awk 'NR==1 || /\/($| )|\/opt/'

echo ""
echo "── Docker ──"
if command -v docker >/dev/null 2>&1; then
  docker --version
  docker compose version 2>/dev/null || echo "docker compose (plugin) NO disponible"
  echo "Daemon activo: $(systemctl is-active docker 2>/dev/null)"
  echo "Arranque automático: $(systemctl is-enabled docker 2>/dev/null)"
else
  echo "Docker NO instalado"
fi

echo ""
echo "── Contenedores e-NCF (si ya desplegado) ──"
docker compose -f /opt/e-ncf/docker-compose.yml -f /opt/e-ncf/docker-compose.prod.yml ps 2>/dev/null \
  || docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null \
  || echo "(no se pudo listar)"

echo ""
echo "── Persistencia de datos (bind mounts) ──"
for d in postgres redis minio backups; do
  p="/opt/e-ncf-data/$d"
  if [ -d "$p" ]; then
    echo "  $p -> existe ($(du -sh "$p" 2>/dev/null | cut -f1))"
  else
    echo "  $p -> NO existe aún"
  fi
done

echo ""
echo "── Puertos a la escucha (0.0.0.0 = EXPUESTO a internet) ──"
echo "  Revisa que SOLO 22/80/443 estén en 0.0.0.0. 5432/6379/9000 NO deben estar."
(ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null) | grep -E ":(22|80|443|3000|5432|6379|9000|9001)\b" | awk '{print "  "$4"  "$1}'

echo ""
echo "── Firewall (ufw) ──"
ufw status 2>/dev/null || echo "  ufw no instalado/activo"

echo ""
echo "── Salud de la app (si está corriendo) ──"
curl -sf http://localhost:3000/health 2>/dev/null && echo "" || echo "  /health no responde en localhost:3000"

echo ""
echo "═══════════════════════════════════════════"
echo "  Fin del diagnóstico"
echo "═══════════════════════════════════════════"
