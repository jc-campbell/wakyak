export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "VALIDATION_ERROR"
  | "PROFILE_NOT_FOUND"
  | "PROFILE_ALREADY_EXISTS"
  | "USER_ID_TAKEN"
  | "HANDLE_TAKEN"
  | "DATABASE_UNAVAILABLE"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: AppErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}
