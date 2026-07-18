import { AppError } from "../errors.js";

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function graphemeCount(value: string): number {
  return [...segmenter.segment(value)].length;
}

export function contentBody(
  value: string | null | undefined,
  required: boolean,
): string | null {
  const body = value?.trim() || null;
  if (required && !body) {
    throw new AppError(400, "VALIDATION_ERROR", "Body is required.");
  }
  if (body && graphemeCount(body) > 280) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "Body cannot exceed 280 characters.",
    );
  }
  return body;
}
