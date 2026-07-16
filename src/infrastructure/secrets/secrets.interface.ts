/**
 * Abstracción para gestión de secretos y claves criptográficas.
 * Permite intercambiar entre variables de entorno (on-premise)
 * y AWS Secrets Manager (cloud) sin modificar el código de la aplicación.
 *
 * @see Requisito 24.2
 */
export interface ISecretsProvider {
  /**
   * Obtiene la clave de encriptación AES-256 para cifrar/descifrar certificados.
   * @returns Buffer de 32 bytes con la clave de encriptación.
   */
  getEncryptionKey(): Promise<Buffer>;

  /**
   * Obtiene la clave privada RSA para firmar JWT (RS256).
   * @returns Clave privada en formato PEM.
   */
  getJwtPrivateKey(): Promise<string>;

  /**
   * Obtiene la clave pública RSA para verificar JWT (RS256).
   * @returns Clave pública en formato PEM.
   */
  getJwtPublicKey(): Promise<string>;
}

export const SECRETS_PROVIDER = 'SECRETS_PROVIDER';
