import sharp from "sharp";

import { AppError } from "../errors.js";

export const IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
  "image/heic",
  "image/heif",
] as const;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_PIXELS = 50_000_000;

const actualTypes: Record<string, string[]> = {
  jpeg: ["image/jpeg"],
  png: ["image/png"],
  webp: ["image/webp"],
  avif: ["image/avif"],
  gif: ["image/gif"],
  heif: ["image/heic", "image/heif"],
};

export interface ImageProcessor {
  normalize(
    input: Buffer,
    declaredContentType: string,
  ): Promise<{ body: Buffer; width: number; height: number }>;
}

export function createImageProcessor(): ImageProcessor {
  return {
    async normalize(input, declaredContentType) {
      if (input.length > MAX_IMAGE_BYTES)
        throw new AppError(400, "UNSUPPORTED_IMAGE", "Image exceeds 10 MB.");
      try {
        const image = sharp(input, {
          limitInputPixels: MAX_PIXELS,
          failOn: "error",
        });
        const metadata = await image.metadata();
        if (
          !metadata.format ||
          !actualTypes[metadata.format]?.includes(declaredContentType)
        ) {
          throw new AppError(
            400,
            "UNSUPPORTED_IMAGE",
            "The uploaded image does not match its declared format.",
          );
        }
        if (
          !metadata.width ||
          !metadata.height ||
          metadata.width * metadata.height > MAX_PIXELS
        ) {
          throw new AppError(
            400,
            "UNSUPPORTED_IMAGE",
            "The decoded image is too large.",
          );
        }
        if ((metadata.pages ?? 1) > 1) {
          throw new AppError(
            400,
            "UNSUPPORTED_IMAGE",
            "Animated and multipage images are not supported.",
          );
        }
        const result = await image
          .rotate()
          .resize({
            width: 2048,
            height: 2048,
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp({ quality: 82, effort: 4 })
          .toBuffer({ resolveWithObject: true });
        return {
          body: result.data,
          width: result.info.width,
          height: result.info.height,
        };
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError(
          400,
          "UNSUPPORTED_IMAGE",
          "The uploaded file is not a supported image.",
        );
      }
    },
  };
}
