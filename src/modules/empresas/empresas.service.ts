import { Injectable, BadRequestException, Inject, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'node:crypto';
import * as forge from 'node-forge';

import { Empresa } from '../../database/entities/empresa.entity.js';
import { EstadoEmpresa } from '../../database/enums.js';
import type { ISecretsProvider } from '../../infrastructure/secrets/secrets.interface.js';
import { SECRETS_PROVIDER } from '../../infrastructure/secrets/secrets.interface.js';
import type { UpdateConfiguracionDto, ConfiguracionResponse } from './dto/configuracion.schemas.js';

export interface CertificadoUploadResult {
  message: string;
  estado: EstadoEmpresa;
}

@Injectable()
export class EmpresasService {
  constructor(
    @InjectRepository(Empresa)
    private readonly empresaRepo: Repository<Empresa>,
    @Inject(SECRETS_PROVIDER)
    private readonly secretsProvider: ISecretsProvider,
  ) {}

  /**
   * Find an empresa by ID.
   */
  async findById(empresaId: string): Promise<Empresa | null> {
    return this.empresaRepo.findOne({ where: { id: empresaId }, relations: ['plan'] });
  }

  /**
   * Procesa la carga de un certificado PKCS12 para una empresa.
   *
   * 1. Valida que el archivo sea un PKCS12 válido con la contraseña dada
   * 2. Verifica que no esté expirado
   * 3. Verifica que el RNC del certificado coincida con el de la empresa
   * 4. Encripta con AES-256-GCM
   * 5. Almacena el certificado encriptado
   * 6. Actualiza el estado a "activo" si estaba en "certificacion"
   */
  async uploadCertificado(
    empresaId: string,
    fileBuffer: Buffer,
    password: string,
  ): Promise<CertificadoUploadResult> {
    // Buscar empresa
    const empresa = await this.empresaRepo.findOne({
      where: { id: empresaId },
    });
    if (!empresa) {
      throw new NotFoundException('Empresa no encontrada');
    }

    // Parsear y validar el PKCS12
    const { certPem } = this.parsePkcs12(fileBuffer, password);

    // Validar expiración
    this.validateExpiration(certPem);

    // Validar RNC
    this.validateRnc(certPem, empresa.rnc);

    // Encriptar el certificado con AES-256-GCM
    const encryptionKey = await this.secretsProvider.getEncryptionKey();
    const { encrypted, iv, authTag } = this.encryptCertificate(fileBuffer, encryptionKey);

    // Almacenar el certificado encriptado
    empresa.certificado_encriptado = encrypted;
    empresa.salt_encriptacion = iv;
    empresa.auth_tag = authTag;

    // Actualizar estado a "activo" si está en "certificacion"
    if (empresa.estado === EstadoEmpresa.CERTIFICACION) {
      empresa.estado = EstadoEmpresa.ACTIVO;
    }

    await this.empresaRepo.save(empresa);

    return {
      message: 'Certificado cargado y empresa activada exitosamente',
      estado: empresa.estado,
    };
  }

  /**
   * Parsea un archivo PKCS12 y extrae el certificado.
   * Lanza BadRequestException si el archivo no es un PKCS12 válido.
   */
  parsePkcs12(fileBuffer: Buffer, password: string): { certPem: forge.pki.Certificate } {
    try {
      const asn1 = forge.asn1.fromDer(forge.util.createBuffer(fileBuffer.toString('binary')));
      const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, password);

      // Extract certificate bags
      const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
      const certs = certBags[forge.pki.oids.certBag];

      if (!certs || certs.length === 0 || !certs[0].cert) {
        throw new BadRequestException('El archivo PKCS12 no contiene un certificado válido');
      }

      return { certPem: certs[0].cert };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        'El archivo no es un PKCS12 válido o la contraseña es incorrecta',
      );
    }
  }

  /**
   * Valida que el certificado no esté expirado.
   */
  validateExpiration(cert: forge.pki.Certificate): void {
    const now = new Date();
    const notAfter = cert.validity.notAfter;

    if (now > notAfter) {
      throw new BadRequestException('El certificado está expirado');
    }
  }

  /**
   * Valida que el RNC del certificado coincida con el de la empresa.
   * El RNC puede estar en el campo serialName (OID 2.5.4.5) o en el
   * commonName del subject del certificado.
   */
  validateRnc(cert: forge.pki.Certificate, empresaRnc: string): void {
    const rncFromCert = this.extractRncFromCertificate(cert);

    if (!rncFromCert) {
      throw new BadRequestException('No se pudo extraer el RNC del certificado');
    }

    // Normalize: remove dashes, spaces
    const normalizedCertRnc = rncFromCert.replace(/[-\s]/g, '');
    const normalizedEmpresaRnc = empresaRnc.replace(/[-\s]/g, '');

    if (normalizedCertRnc !== normalizedEmpresaRnc) {
      throw new BadRequestException('El RNC del certificado no coincide con el RNC de la empresa');
    }
  }

  /**
   * Extrae el RNC del subject del certificado.
   * Busca en los campos serialName (OID 2.5.4.5) y commonName.
   */
  extractRncFromCertificate(cert: forge.pki.Certificate): string | null {
    // Try serialName (OID 2.5.4.5) first - most common for RNC
    const serialNameAttr = cert.subject.getField({ type: '2.5.4.5' });
    if (serialNameAttr && serialNameAttr.value) {
      return String(serialNameAttr.value);
    }

    // Try commonName
    const cnAttr = cert.subject.getField('CN');
    if (cnAttr && cnAttr.value) {
      // CN might contain the RNC directly or as part of a string
      const cnValue = String(cnAttr.value);
      // Extract numeric RNC from CN (9 or 11 digits)
      const rncMatch = cnValue.match(/\b(\d{9}|\d{11})\b/);
      if (rncMatch) {
        return rncMatch[1];
      }
    }

    // Try organizationName
    const orgAttr = cert.subject.getField('O');
    if (orgAttr && orgAttr.value) {
      const orgValue = String(orgAttr.value);
      const rncMatch = orgValue.match(/\b(\d{9}|\d{11})\b/);
      if (rncMatch) {
        return rncMatch[1];
      }
    }

    return null;
  }

  /**
   * Encripta un buffer con AES-256-GCM.
   * Genera un IV aleatorio de 12 bytes.
   * Retorna: encrypted data, IV (salt), auth_tag (16 bytes).
   */
  encryptCertificate(
    data: Buffer,
    key: Buffer,
  ): { encrypted: Buffer; iv: Buffer; authTag: Buffer } {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return { encrypted, iv, authTag };
  }

  /**
   * Desencripta un certificado con AES-256-GCM.
   * Usado por el servicio de firma para recuperar el certificado.
   */
  decryptCertificate(encrypted: Buffer, key: Buffer, iv: Buffer, authTag: Buffer): Buffer {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }

  /**
   * Actualiza la configuración de la empresa.
   * Req 28.8
   */
  async updateConfiguracion(
    empresaId: string,
    dto: UpdateConfiguracionDto,
  ): Promise<ConfiguracionResponse> {
    const empresa = await this.empresaRepo.findOne({
      where: { id: empresaId },
    });

    if (!empresa) {
      throw new NotFoundException('Empresa no encontrada');
    }

    if (dto.modo_ncf !== undefined) {
      empresa.modo_ncf = dto.modo_ncf;
    }

    if (dto.validar_rnc_receptor !== undefined) {
      empresa.validar_rnc_receptor = dto.validar_rnc_receptor;
    }

    if (dto.formato_pdf !== undefined) {
      empresa.formato_pdf = dto.formato_pdf;
    }

    await this.empresaRepo.save(empresa);

    return {
      modo_ncf: empresa.modo_ncf,
      validar_rnc_receptor: empresa.validar_rnc_receptor,
      formato_pdf: empresa.formato_pdf,
    };
  }
}
