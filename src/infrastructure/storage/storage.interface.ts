/**
 * Abstracción para operaciones de almacenamiento de objetos.
 * Permite intercambiar entre MinIO (on-premise) y AWS S3 (cloud)
 * sin modificar el código de la aplicación.
 *
 * @see Requisito 24.1, 24.4
 */
export interface IStorageProvider {
  /**
   * Sube un objeto al almacenamiento.
   * @returns La URL o key del objeto almacenado.
   */
  upload(bucket: string, key: string, data: Buffer, contentType: string): Promise<string>;

  /**
   * Descarga un objeto del almacenamiento.
   * @returns El contenido del objeto como Buffer.
   */
  download(bucket: string, key: string): Promise<Buffer>;

  /**
   * Genera una URL pre-firmada para acceso temporal al objeto.
   * @param ttlSeconds Tiempo de vida de la URL en segundos.
   * @returns URL pre-firmada válida por el TTL especificado.
   */
  getPresignedUrl(bucket: string, key: string, ttlSeconds: number): Promise<string>;

  /**
   * Elimina un objeto del almacenamiento.
   */
  delete(bucket: string, key: string): Promise<void>;
}

export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';
