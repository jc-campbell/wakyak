export function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The request could not be completed.";
}
