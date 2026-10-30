/**
 * @module result
 * Functional Result type for safe error handling without exceptions.
 */

/** Successful result containing a value. */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

/** Failed result containing an error. */
export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

/** Discriminated union representing either success or failure. */
export type Result<T, E> = Ok<T> | Err<E>;

/**
 * Create a successful Result.
 * @param value - The success value to wrap.
 * @returns A Result in the Ok state.
 */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/**
 * Create a failed Result.
 * @param error - The error value to wrap.
 * @returns A Result in the Err state.
 */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/**
 * Type guard that narrows a Result to its Ok variant.
 * @param result - The result to check.
 * @returns True if the result is Ok.
 */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

/**
 * Type guard that narrows a Result to its Err variant.
 * @param result - The result to check.
 * @returns True if the result is Err.
 */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

/**
 * Transform the success value of a Result, leaving errors untouched.
 * @param result - The result to map over.
 * @param fn - Mapping function applied to the success value.
 * @returns A new Result with the mapped value, or the original error.
 */
export function mapResult<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => U,
): Result<U, E> {
  if (result.ok) {
    return ok(fn(result.value));
  }
  return result;
}

/**
 * Chain Result-returning computations, short-circuiting on error.
 * @param result - The result to flat-map over.
 * @param fn - Function that takes the success value and returns a new Result.
 * @returns The Result from fn if the input was Ok, or the original error.
 */
export function flatMapResult<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>,
): Result<U, E> {
  if (result.ok) {
    return fn(result.value);
  }
  return result;
}
