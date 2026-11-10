export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof Error && error.name === 'ZodError') {
    return new AppError('VALIDATION_ERROR', 400, 'Dados inválidos.');
  }
  return new AppError('INTERNAL_ERROR', 500, 'Erro interno.');
}
