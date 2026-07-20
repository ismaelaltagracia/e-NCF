import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { IStorageProvider } from './storage.interface.js';

/**
 * Implementación de IStorageProvider usando MinIO (compatible con S3 API).
 * Usa @aws-sdk/client-s3 tanto para MinIO como para AWS S3,
 * diferenciándose únicamente en la configuración del endpoint.
 *
 * @see Requisito 24.4
 */
@Injectable()
export class MinioStorageAdapter implements IStorageProvider, OnModuleInit {
  private readonly client: S3Client;
  private readonly logger = new Logger(MinioStorageAdapter.name);
  private readonly bucketXml: string;
  private readonly bucketPdf: string;

  private readonly internalEndpoint: string;
  private readonly publicEndpoint: string;
  private readonly publicClient: S3Client;

  constructor(private readonly configService: ConfigService) {
    const endpoint = this.configService.get<string>('MINIO_ENDPOINT', 'localhost');
    const port = this.configService.get<number>('MINIO_PORT', 9000);
    const useSsl = this.configService.get<string>('MINIO_USE_SSL', 'false') === 'true';
    const protocol = useSsl ? 'https' : 'http';

    this.bucketXml = this.configService.get<string>('MINIO_BUCKET_XML', 'facturas-xml');
    this.bucketPdf = this.configService.get<string>('MINIO_BUCKET_PDF', 'facturas-pdf');
    this.internalEndpoint = `${protocol}://${endpoint}:${port}`;
    this.publicEndpoint = this.configService.get<string>(
      'MINIO_PUBLIC_ENDPOINT',
      `http://localhost:${port}`,
    );

    const credentials = {
      accessKeyId: this.configService.get<string>('MINIO_ACCESS_KEY', ''),
      secretAccessKey: this.configService.get<string>('MINIO_SECRET_KEY', ''),
    };
    const region = this.configService.get<string>('MINIO_REGION', 'us-east-1');

    // Internal client for upload/download (uses Docker hostname)
    this.client = new S3Client({
      endpoint: this.internalEndpoint,
      region,
      credentials,
      forcePathStyle: true,
    });

    // Public client for presigned URLs (uses localhost/public hostname)
    this.publicClient = new S3Client({
      endpoint: this.publicEndpoint,
      region,
      credentials,
      forcePathStyle: true,
    });
  }

  async onModuleInit(): Promise<void> {
    for (const bucket of [this.bucketXml, this.bucketPdf]) {
      try {
        await this.client.send(new HeadBucketCommand({ Bucket: bucket }));
      } catch {
        try {
          await this.client.send(new CreateBucketCommand({ Bucket: bucket }));
          this.logger.log(`Bucket "${bucket}" creado automáticamente`);
        } catch (err) {
          this.logger.warn(`No se pudo crear bucket "${bucket}": ${err instanceof Error ? err.message : err}`);
        }
      }
    }
  }

  async upload(bucket: string, key: string, data: Buffer, contentType: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
      }),
    );
    return key;
  }

  async download(bucket: string, key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );

    const stream = response.Body;
    if (!stream) {
      throw new Error(`Object not found: ${bucket}/${key}`);
    }

    const chunks: Uint8Array[] = [];
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async getPresignedUrl(bucket: string, key: string, ttlSeconds: number): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    // Use public client so the signature matches the public endpoint
    return getSignedUrl(this.publicClient, command, { expiresIn: ttlSeconds });
  }

  async delete(bucket: string, key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );
  }
}
