export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "PROFILE_NOT_FOUND"
  | "PROFILE_ALREADY_EXISTS"
  | "USER_ID_TAKEN"
  | "HANDLE_TAKEN"
  | "FOLLOW_CONFLICT"
  | "SOCIAL_UNAVAILABLE"
  | "BLOCK_TARGET_UNAVAILABLE"
  | "BLOCK_CONFLICT"
  | "BLOCK_NOT_FOUND"
  | "NOTIFICATION_NOT_FOUND"
  | "DATABASE_UNAVAILABLE"
  | "INVITATION_INVALID"
  | "INVITATION_UNAVAILABLE"
  | "CONTENT_NOT_FOUND"
  | "CONTENT_INACTIVE"
  | "REACTION_CONFLICT"
  | "ATTACHMENT_NOT_FOUND"
  | "ATTACHMENT_FORBIDDEN"
  | "ATTACHMENT_STATE"
  | "UNSUPPORTED_IMAGE"
  | "IMAGE_PROCESSING_FAILED"
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
