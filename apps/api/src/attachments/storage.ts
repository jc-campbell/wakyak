import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type { Env } from "../config/env.js";

export interface ObjectStorage {
  presignUpload(
    key: string,
    contentType: string,
    byteSize: number,
  ): Promise<string>;
  presignDownload(key: string): Promise<string>;
  read(
    key: string,
  ): Promise<{ body: Buffer; contentType?: string; byteSize?: number }>;
  write(key: string, body: Buffer, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export function createObjectStorage(env: Env): ObjectStorage {
  const client = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
  });
  const bucket = env.S3_BUCKET;
  return {
    presignUpload(key, contentType, byteSize) {
      return getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          ContentType: contentType,
          ContentLength: byteSize,
        }),
        { expiresIn: 15 * 60 },
      );
    },
    presignDownload(key) {
      return getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: bucket, Key: key }),
        { expiresIn: 60 },
      );
    },
    async read(key) {
      const head = await client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: key }),
      );
      const result = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
      );
      if (!result.Body) throw new Error("Object body is missing.");
      const bytes = await result.Body.transformToByteArray();
      return {
        body: Buffer.from(bytes),
        ...(head.ContentType ? { contentType: head.ContentType } : {}),
        ...(head.ContentLength === undefined
          ? {}
          : { byteSize: head.ContentLength }),
      };
    },
    async write(key, body, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          ContentLength: body.length,
        }),
      );
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}
