#!/bin/bash
#
# e-NCF — Script de actualización (usar después del deploy inicial)
#
# Uso: bash /opt/e-ncf/scripts/update-server.sh
#

set -e

cd /opt/e-ncf

echo "▶ Actualizando e-NCF..."

# Bajar cambios (si usa git)
if [ -d ".git" ]; then
    git pull
    echo "  ✓ Código actualizado desde git"
fi

# Rebuild y restart
docker compose up --build -d
echo "  ✓ Contenedores rebuild completado"

# Esperar
sleep 10

# Verificar
if curl -sf http://localhost:3000/health > /dev/null; then
    echo "  ✅ API funcionando correctamente"
else
    echo "  ⚠ Posible problema. Revisa: docker compose logs encf-api"
fi

echo ""
echo "Actualización completada."
