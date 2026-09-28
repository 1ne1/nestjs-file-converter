import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';

import { ConfigService } from '@/core/config/config.service';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    this.bucket = config.get('STORAGE_BUCKET');
    this.client = new S3Client({
      endpoint: config.get('STORAGE_ENDPOINT'),
      region: config.get('STORAGE_REGION'),
      forcePathStyle: config.get('STORAGE_FORCE_PATH_STYLE'),
      credentials: {
        accessKeyId: config.get('STORAGE_ACCESS_KEY_ID'),
        secretAccessKey: config.get('STORAGE_SECRET_ACCESS_KEY'),
      },
    });
  }

  async onModuleInit() {
    const bucketExists = await this.client
      .send(new HeadBucketCommand({ Bucket: this.bucket }))
      .then(() => true)
      .catch(() => false);

    if (!bucketExists) {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }

  async upload(
    key: string,
    body: Buffer | Readable,
    contentType: string,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async download(key: string): Promise<Readable> {
    const { Body } = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );

    return Body as Readable;
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  async ping(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }
}
