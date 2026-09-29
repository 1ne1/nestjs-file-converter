import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';

import { ConfigService } from '@/core/config/config.service';

import { StorageService } from './storage.service';

jest.mock('@aws-sdk/client-s3', () => {
  const actual = jest.requireActual('@aws-sdk/client-s3');
  return {
    ...actual,
    S3Client: jest.fn().mockImplementation(() => ({
      send: jest.fn(),
    })),
  };
});

type SentCommand = { input: Record<string, unknown> };

describe('StorageService', () => {
  let service: StorageService;
  let send: jest.Mock<Promise<unknown>, [SentCommand]>;

  beforeEach(() => {
    const values: Record<string, unknown> = {
      STORAGE_BUCKET: 'app',
      STORAGE_ENDPOINT: 'http://localhost:9000',
      STORAGE_REGION: 'us-east-1',
      STORAGE_FORCE_PATH_STYLE: true,
      STORAGE_ACCESS_KEY_ID: 'access',
      STORAGE_SECRET_ACCESS_KEY: 'secret',
    };
    const config = {
      get: (key: string) => values[key],
    } as unknown as ConfigService;

    service = new StorageService(config);
    send = (service as unknown as { client: { send: typeof send } }).client
      .send;
  });

  describe('onModuleInit', () => {
    it('does not create the bucket when it already exists', async () => {
      send.mockResolvedValueOnce(undefined);

      await service.onModuleInit();

      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0][0]).toBeInstanceOf(HeadBucketCommand);
    });

    it('creates the bucket when the head check fails', async () => {
      send.mockRejectedValueOnce(new Error('not found'));
      send.mockResolvedValueOnce(undefined);

      await service.onModuleInit();

      expect(send).toHaveBeenCalledTimes(2);
      expect(send.mock.calls[0][0]).toBeInstanceOf(HeadBucketCommand);
      expect(send.mock.calls[1][0]).toBeInstanceOf(CreateBucketCommand);
      expect(send.mock.calls[1][0].input).toMatchObject({ Bucket: 'app' });
    });
  });

  it('upload sends a PutObjectCommand with the given body and content type', async () => {
    send.mockResolvedValueOnce(undefined);
    const body = Buffer.from('hello');

    await service.upload('key.txt', body, 'text/plain');

    expect(send.mock.calls[0][0]).toBeInstanceOf(PutObjectCommand);
    expect(send.mock.calls[0][0].input).toMatchObject({
      Bucket: 'app',
      Key: 'key.txt',
      Body: body,
      ContentType: 'text/plain',
    });
  });

  it('download sends a GetObjectCommand and returns the body', async () => {
    const fakeBody = {};
    send.mockResolvedValueOnce({ Body: fakeBody });

    const result = await service.download('key.txt');

    expect(send.mock.calls[0][0]).toBeInstanceOf(GetObjectCommand);
    expect(send.mock.calls[0][0].input).toMatchObject({
      Bucket: 'app',
      Key: 'key.txt',
    });
    expect(result).toBe(fakeBody);
  });

  it('delete sends a DeleteObjectCommand', async () => {
    send.mockResolvedValueOnce(undefined);

    await service.delete('key.txt');

    expect(send.mock.calls[0][0]).toBeInstanceOf(DeleteObjectCommand);
    expect(send.mock.calls[0][0].input).toMatchObject({
      Bucket: 'app',
      Key: 'key.txt',
    });
  });

  it('ping sends a HeadBucketCommand and resolves when it succeeds', async () => {
    send.mockResolvedValueOnce(undefined);

    await expect(service.ping()).resolves.toBeUndefined();
    expect(send.mock.calls[0][0]).toBeInstanceOf(HeadBucketCommand);
  });

  it('ping rejects when the head check fails', async () => {
    send.mockRejectedValueOnce(new Error('unreachable'));

    await expect(service.ping()).rejects.toThrow('unreachable');
  });
});
