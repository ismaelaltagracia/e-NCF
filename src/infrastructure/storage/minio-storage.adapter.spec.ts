import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MinioStorageAdapter } from './minio-storage.adapter';

// Mock @aws-sdk/client-s3
const mockSend = jest.fn();
jest.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: jest.fn().mockImplementation(() => ({
      send: mockSend,
    })),
    PutObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
    GetObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
    DeleteObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
  };
});

// Mock @aws-sdk/s3-request-presigner
const mockGetSignedUrl = jest.fn();
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: unknown[]) => mockGetSignedUrl(...args),
}));

describe('MinioStorageAdapter', () => {
  let adapter: MinioStorageAdapter;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: unknown) => {
      const config: Record<string, unknown> = {
        MINIO_ENDPOINT: 'localhost',
        MINIO_PORT: 9000,
        MINIO_USE_SSL: 'false',
        MINIO_REGION: 'us-east-1',
        MINIO_ACCESS_KEY: 'test-access-key',
        MINIO_SECRET_KEY: 'test-secret-key',
      };
      return config[key] ?? defaultValue;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [MinioStorageAdapter, { provide: ConfigService, useValue: mockConfigService }],
    }).compile();

    adapter = module.get<MinioStorageAdapter>(MinioStorageAdapter);
  });

  describe('upload', () => {
    it('should upload a file and return the key', async () => {
      mockSend.mockResolvedValue({});

      const result = await adapter.upload(
        'test-bucket',
        'test-key.xml',
        Buffer.from('file content'),
        'application/xml',
      );

      expect(result).toBe('test-key.xml');
      expect(mockSend).toHaveBeenCalledTimes(1);

      const command = mockSend.mock.calls[0][0];
      expect(command.input).toEqual({
        Bucket: 'test-bucket',
        Key: 'test-key.xml',
        Body: Buffer.from('file content'),
        ContentType: 'application/xml',
      });
    });

    it('should propagate S3 errors', async () => {
      mockSend.mockRejectedValue(new Error('S3 upload failed'));

      await expect(
        adapter.upload('test-bucket', 'test-key.xml', Buffer.from('data'), 'text/plain'),
      ).rejects.toThrow('S3 upload failed');
    });
  });

  describe('download', () => {
    it('should download and return file content as Buffer', async () => {
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield Buffer.from('chunk1');
          yield Buffer.from('chunk2');
        },
      };

      mockSend.mockResolvedValue({ Body: mockStream });

      const result = await adapter.download('test-bucket', 'test-key.xml');

      expect(result).toEqual(Buffer.from('chunk1chunk2'));
      expect(mockSend).toHaveBeenCalledTimes(1);

      const command = mockSend.mock.calls[0][0];
      expect(command.input).toEqual({
        Bucket: 'test-bucket',
        Key: 'test-key.xml',
      });
    });

    it('should throw when object body is empty', async () => {
      mockSend.mockResolvedValue({ Body: undefined });

      await expect(adapter.download('test-bucket', 'missing-key.xml')).rejects.toThrow(
        'Object not found: test-bucket/missing-key.xml',
      );
    });
  });

  describe('getPresignedUrl', () => {
    it('should return a pre-signed URL with the specified TTL', async () => {
      mockGetSignedUrl.mockResolvedValue(
        'http://localhost:9000/test-bucket/test-key.xml?signed=true',
      );

      const result = await adapter.getPresignedUrl('test-bucket', 'test-key.xml', 3600);

      expect(result).toBe('http://localhost:9000/test-bucket/test-key.xml?signed=true');
      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          input: { Bucket: 'test-bucket', Key: 'test-key.xml' },
        }),
        { expiresIn: 3600 },
      );
    });
  });

  describe('delete', () => {
    it('should delete an object', async () => {
      mockSend.mockResolvedValue({});

      await adapter.delete('test-bucket', 'test-key.xml');

      expect(mockSend).toHaveBeenCalledTimes(1);
      const command = mockSend.mock.calls[0][0];
      expect(command.input).toEqual({
        Bucket: 'test-bucket',
        Key: 'test-key.xml',
      });
    });

    it('should propagate S3 errors on delete', async () => {
      mockSend.mockRejectedValue(new Error('Access denied'));

      await expect(adapter.delete('test-bucket', 'test-key.xml')).rejects.toThrow('Access denied');
    });
  });
});
