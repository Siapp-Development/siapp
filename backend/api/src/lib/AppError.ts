/**
 * Typed application error hierarchy.
 *
 * Every subclass carries an HTTP status code so the error middleware can map
 * it to a response without a switch statement.
 */

export class AppError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    // Restore the prototype chain in transpiled ES5 output.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends AppError {
  readonly fields?: Record<string, string[]>;

  constructor(message: string, fields?: Record<string, string[]>) {
    super(message, 400);
    this.fields = fields;
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(id !== undefined ? `${resource} ${id} not found` : `${resource} not found`, 404);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401);
  }
}

export class QuotaExceededError extends AppError {
  constructor(message = 'Quota exceeded') {
    super(message, 429);
  }
}
