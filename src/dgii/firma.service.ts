import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'node:crypto';
import * as forge from 'node-forge';
import * as xadesjs from 'xadesjs';
import { Crypto } from '@peculiar/webcrypto';
import * as xmldom from '@xmldom/xmldom';
import { setNodeDependencies } from 'xml-core';

import { Empresa } from '../database/entities/empresa.entity.js';
import type { ISecretsProvider } from '../infrastructure/secrets/secrets.interface.js';
import { SECRETS_PROVIDER } from '../infrastructure/secrets/secrets.interface.js';
import { Inject } from '@nestjs/common';

// Initialize xadesjs crypto engine and XML dependencies for Node.js
const nodeCrypto = new Crypto();
xadesjs.Application.setEngine('NodeJS', nodeCrypto);
setNodeDependencies({
  DOMParser: xmldom.DOMParser,
  XMLSerializer: xmldom.XMLSerializer,
  DOMImplementation: new xmldom.DOMImplementation(),
});

/**
 * Interfaz del servicio de firma digital XAdES-BES.
 * @see Requisitos 6.1, 6.2, 6.3, 6.4, 10.1, 10.2, 10.3, 10.4, 10.5
 */
export interface IFirmaService {
  firmarSemilla(semillaXml: string, empresaId: string): Promise<string>;
  firmarEcf(documentoXml: string, empresaId: string): Promise<string>;
}

interface CertificateData {
  privateKey: forge.pki.rsa.PrivateKey;
  certificate: forge.pki.Certificate;
  chain: forge.pki.Certificate[];
}

/**
 * Servicio de firma digital XAdES-BES para documentos e-CF y semillas DGII.
 *
 * Implementa firma enveloped con:
 * - Canonicalización: Exclusive XML Canonicalization (exc-c14n)
 * - Digest: SHA-256
 * - Algoritmo de firma: RSA-SHA256
 * - KeyInfo: cadena completa X.509
 * - SignedProperties: SigningCertificate (SHA-256) + SigningTime (UTC ISO 8601)
 *
 * @see Requisitos 6.1, 6.2, 6.3, 6.4, 10.1, 10.2, 10.3, 10.4, 10.5
 */
@Injectable()
export class FirmaService implements IFirmaService {
  private readonly logger = new Logger(FirmaService.name);

  constructor(
    @InjectRepository(Empresa)
    private readonly empresaRepo: Repository<Empresa>,
    @Inject(SECRETS_PROVIDER)
    private readonly secretsProvider: ISecretsProvider,
  ) {}

  /**
   * Firma una semilla XML con XAdES-BES enveloped signature.
   * @param semillaXml - XML de la semilla a firmar
   * @param empresaId - ID de la empresa cuyo certificado se usará
   * @returns XML firmado con ds:Signature embebida
   * @throws UnauthorizedException si no hay certificado, no se puede desencriptar o está expirado
   */
  async firmarSemilla(semillaXml: string, empresaId: string): Promise<string> {
    this.logger.log(`Firmando semilla para empresa ${empresaId}`);
    const certData = await this.obtenerCertificado(empresaId);
    return this.firmarXml(semillaXml, certData);
  }

  /**
   * Firma un documento e-CF XML con XAdES-BES enveloped signature.
   * @param documentoXml - XML del e-CF a firmar
   * @param empresaId - ID de la empresa cuyo certificado se usará
   * @returns XML firmado con ds:Signature embebida
   * @throws UnauthorizedException si no hay certificado, no se puede desencriptar o está expirado
   */
  async firmarEcf(documentoXml: string, empresaId: string): Promise<string> {
    this.logger.log(`Firmando e-CF para empresa ${empresaId}`);
    const certData = await this.obtenerCertificado(empresaId);
    return this.firmarXml(documentoXml, certData);
  }

  /**
   * Recupera y desencripta el certificado PKCS12 de la empresa desde la base de datos.
   * Valida que exista, se pueda desencriptar y no esté expirado.
   *
   * @see Requisito 6.1: Recuperar PKCS12 desde PostgreSQL y desencriptar con AES-256 (max 5s)
   * @see Requisito 6.4: Retornar 401 si empresa no tiene certificado almacenado
   * @see Requisito 6.3: Retornar 401 si no se puede desencriptar o está expirado
   */
  private async obtenerCertificado(empresaId: string): Promise<CertificateData> {
    const empresa = await this.empresaRepo.findOne({
      where: { id: empresaId },
    });

    if (!empresa) {
      throw new UnauthorizedException('Empresa no encontrada');
    }

    // Req 6.4: empresa sin certificado
    if (!empresa.certificado_encriptado || !empresa.salt_encriptacion || !empresa.auth_tag) {
      throw new UnauthorizedException(
        'La empresa no tiene un certificado digital almacenado',
      );
    }

    // Desencriptar certificado PKCS12
    let pkcs12Buffer: Buffer;
    try {
      const encryptionKey = await this.secretsProvider.getEncryptionKey();
      pkcs12Buffer = this.decryptCertificate(
        empresa.certificado_encriptado,
        encryptionKey,
        empresa.salt_encriptacion,
        empresa.auth_tag,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error desencriptando certificado: ${message}`);
      throw new UnauthorizedException(
        'No se pudo desencriptar el certificado digital: desencriptación fallida',
      );
    }

    // Extraer clave privada y certificados del PKCS12
    const password = empresa.certificado_password_encrypted
      ? await this.decryptPassword(empresa.certificado_password_encrypted)
      : '';

    let certData: CertificateData;
    try {
      certData = this.extractPkcs12(pkcs12Buffer, password);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error extrayendo PKCS12: ${message}`);
      throw new UnauthorizedException(
        'No se pudo desencriptar el certificado digital: certificado PKCS12 inválido o contraseña incorrecta',
      );
    }

    // Validar expiración
    const now = new Date();
    if (now > certData.certificate.validity.notAfter) {
      throw new UnauthorizedException(
        'El certificado digital está expirado',
      );
    }

    return certData;
  }

  /**
   * Desencripta un buffer con AES-256-GCM.
   */
  private decryptCertificate(encrypted: Buffer, key: Buffer, iv: Buffer, authTag: Buffer): Buffer {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }

  /**
   * Desencripta la contraseña del PKCS12 almacenada encriptada.
   */
  private async decryptPassword(encryptedPassword: Buffer): Promise<string> {
    const encryptionKey = await this.secretsProvider.getEncryptionKey();
    // Format: first 12 bytes are IV, next 16 bytes are auth tag, rest is ciphertext
    if (encryptedPassword.length < 28) {
      return '';
    }
    const iv = encryptedPassword.subarray(0, 12);
    const authTag = encryptedPassword.subarray(12, 28);
    const ciphertext = encryptedPassword.subarray(28);

    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf-8');
  }

  /**
   * Extrae la clave privada RSA y la cadena de certificados X.509 de un PKCS12.
   */
  private extractPkcs12(pkcs12Buffer: Buffer, password: string): CertificateData {
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(pkcs12Buffer.toString('binary')));
    const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, password);

    // Extract private key
    const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
    const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag];

    let privateKey: forge.pki.rsa.PrivateKey | undefined;
    if (keyBag && keyBag.length > 0 && keyBag[0].key) {
      privateKey = keyBag[0].key as forge.pki.rsa.PrivateKey;
    }

    if (!privateKey) {
      // Try unencrypted key bag
      const unencryptedBags = p12.getBags({ bagType: forge.pki.oids.keyBag });
      const unencryptedBag = unencryptedBags[forge.pki.oids.keyBag];
      if (unencryptedBag && unencryptedBag.length > 0 && unencryptedBag[0].key) {
        privateKey = unencryptedBag[0].key as forge.pki.rsa.PrivateKey;
      }
    }

    if (!privateKey) {
      throw new Error('No se encontró clave privada en el PKCS12');
    }

    // Extract certificates
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const certs = certBags[forge.pki.oids.certBag];

    if (!certs || certs.length === 0 || !certs[0].cert) {
      throw new Error('No se encontraron certificados en el PKCS12');
    }

    const certificate = certs[0].cert;
    const chain = certs
      .filter((bag) => bag.cert != null)
      .map((bag) => bag.cert!);

    return { privateKey, certificate, chain };
  }

  /**
   * Firma un documento XML con XAdES-BES enveloped signature.
   *
   * @see Requisito 10.1: XAdES-BES con exc-c14n, SHA-256, RSA-SHA256
   * @see Requisito 10.2: KeyInfo con cadena completa X.509
   * @see Requisito 10.3: xades:SignedProperties con SigningCertificate
   * @see Requisito 10.4: SigningTime en UTC ISO 8601
   * @see Requisito 10.5: Enveloped signature
   */
  private async firmarXml(xml: string, certData: CertificateData): Promise<string> {
    // Convert forge private key to Web Crypto CryptoKey
    const cryptoKey = await this.forgeKeyToCryptoKey(certData.privateKey);

    // Convert certificates to PEM for xadesjs
    const x509Pems = certData.chain.map((cert) => {
      const pem = forge.pki.certificateToPem(cert);
      // Extract base64 content without headers
      return pem
        .replace(/-----BEGIN CERTIFICATE-----/g, '')
        .replace(/-----END CERTIFICATE-----/g, '')
        .replace(/\r?\n/g, '');
    });

    // Get the signing certificate PEM (base64 only)
    const signingCertPem = x509Pems[0];

    // Parse the XML document
    const xmlDoc = xadesjs.Parse(xml);

    // Create XAdES signed XML
    const signedXml = new xadesjs.SignedXml();

    const signatureAlgorithm: Algorithm = {
      name: 'RSASSA-PKCS1-v1_5',
    };

    await signedXml.Sign(
      signatureAlgorithm,
      cryptoKey,
      xmlDoc,
      {
        x509: x509Pems,
        references: [
          {
            hash: 'SHA-256',
            transforms: ['enveloped', 'exc-c14n'],
          },
        ],
        signingCertificate: signingCertPem,
        signingTime: {
          value: new Date(),
          format: 'iso',
        },
      },
    );

    return signedXml.toString();
  }

  /**
   * Converts a node-forge RSA private key to a Web Crypto CryptoKey.
   * Exports the key as PKCS#8 DER and imports it via Web Crypto API.
   */
  private async forgeKeyToCryptoKey(forgeKey: forge.pki.rsa.PrivateKey): Promise<CryptoKey> {
    // Convert forge key to PKCS8 ASN1 then to DER
    const asn1 = forge.pki.privateKeyToAsn1(forgeKey);
    const privateKeyInfo = forge.pki.wrapRsaPrivateKey(asn1);
    const der = forge.asn1.toDer(privateKeyInfo);
    const derBuffer = Buffer.from(der.getBytes(), 'binary');

    // Import as CryptoKey
    const cryptoKey = await nodeCrypto.subtle.importKey(
      'pkcs8',
      derBuffer,
      {
        name: 'RSASSA-PKCS1-v1_5',
        hash: 'SHA-256',
      },
      false,
      ['sign'],
    );

    return cryptoKey;
  }
}
