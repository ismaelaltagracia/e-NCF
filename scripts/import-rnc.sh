#!/bin/bash
# Script para importar el CSV de RNC contribuyentes a PostgreSQL
# Uso: ./scripts/import-rnc.sh /ruta/al/archivo.csv

CSV_FILE="${1:-/Users/mac/Downloads/RNC_Contribuyentes_Actualizado_11_Jul_2026.csv}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-encf_db}"
DB_USER="${DB_USER:-encf_user}"

if [ ! -f "$CSV_FILE" ]; then
  echo "Error: Archivo no encontrado: $CSV_FILE"
  exit 1
fi

echo "Importando RNC contribuyentes desde: $CSV_FILE"
echo "Base de datos: $DB_NAME en $DB_HOST:$DB_PORT"

# Crear tabla si no existe
PGPASSWORD="${DB_PASSWORD:-encf_password}" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
CREATE TABLE IF NOT EXISTS rnc_contribuyentes (
  rnc varchar(11) NOT NULL PRIMARY KEY,
  razon_social varchar(255) NOT NULL DEFAULT '',
  actividad_economica varchar(255) NOT NULL DEFAULT '',
  fecha_inicio_operaciones varchar(20) NOT NULL DEFAULT '',
  estado varchar(30) NOT NULL DEFAULT 'ACTIVO',
  regimen_pago varchar(30) NOT NULL DEFAULT 'NORMAL'
);
"

# Limpiar tabla antes de importar
PGPASSWORD="${DB_PASSWORD:-encf_password}" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "TRUNCATE rnc_contribuyentes;"

# Importar CSV (skip header, delimiter comma, encoding latin1)
PGPASSWORD="${DB_PASSWORD:-encf_password}" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
\COPY rnc_contribuyentes(rnc, razon_social, actividad_economica, fecha_inicio_operaciones, estado, regimen_pago) FROM '$CSV_FILE' WITH (FORMAT csv, HEADER true, DELIMITER ',', ENCODING 'LATIN1');
"

# Contar registros
COUNT=$(PGPASSWORD="${DB_PASSWORD:-encf_password}" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM rnc_contribuyentes;")
echo "Importación completada: $COUNT registros"

# Crear índice
PGPASSWORD="${DB_PASSWORD:-encf_password}" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
CREATE INDEX IF NOT EXISTS idx_rnc_contribuyentes_estado ON rnc_contribuyentes(estado);
"

echo "Done!"
