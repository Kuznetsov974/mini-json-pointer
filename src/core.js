/**
 * JSON Pointer implementation per RFC 6901.
 *
 * Design decisions:
 * - `parsePointer` returns an array of decoded reference tokens. We decode eagerly
 *   during parsing because RFC 6901 requires the entire pointer to be syntactically
 *   valid before any evaluation; deferring decoding would make error reporting
 *   position-dependent and complicated.
 * - `get` and `set` operate on plain in-memory JSON trees (objects, arrays, primitives).
 *   We do not attempt to copy-on-write; `set` mutates the container it is given. This
 *   matches the common use case of updating a parsed document in place and keeps the
 *   API small.
 * - The empty string is a valid pointer that refers to the whole document.
 * - `-` as the final token in a pointer is only meaningful for `set` on an array,
 *   where it appends. For `get` it is treated as a normal property name (which will
 *   usually not exist), per RFC 6901 section 4.
 */

/**
 * Error thrown when a pointer string cannot be parsed.
 */
export class PointerSyntaxError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PointerSyntaxError';
  }
}

/**
 * Error thrown when a pointer does not resolve in the given document.
 */
export class PointerNotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PointerNotFoundError';
  }
}

/**
 * Decode a single reference token: `~1` -> `/`, `~0` -> `~`.
 * The order matters: we must replace `~1` before `~0`, otherwise a token
 * containing the literal sequence `~01` would be decoded incorrectly.
 */
function decodeToken(token) {
  return token.replace(/~1/g, '/').replace(/~0/g, '~');
}

/**
 * Encode a single reference token for use in a pointer string.
 */
function encodeToken(token) {
  return token.replace(/~/g, '~0').replace(/\//g, '~1');
}

/**
 * Parse a JSON Pointer string into an array of decoded reference tokens.
 *
 * @param {string} pointer - The pointer string, e.g. `/foo/0/bar`.
 * @returns {string[]} The decoded reference tokens.
 * @throws {PointerSyntaxError} If the pointer is not a valid JSON Pointer.
 */
export function parsePointer(pointer) {
  if (typeof pointer !== 'string') {
    throw new PointerSyntaxError('Pointer must be a string');
  }
  if (pointer === '') {
    return [];
  }
  if (pointer[0] !== '/') {
    throw new PointerSyntaxError('Pointer must be empty or start with "/"');
  }
  // Split on '/', dropping the leading empty segment produced by the leading '/'.
  const rawTokens = pointer.split('/').slice(1);
  return rawTokens.map(decodeToken);
}

/**
 * Resolve a parsed token array against a document.
 *
 * @param {*} doc - The JSON document.
 * @param {string[]} tokens - Decoded reference tokens.
 * @returns {*} The value at the pointer.
 * @throws {PointerNotFoundError} If any token does not resolve.
 */
function resolve(doc, tokens) {
  let current = doc;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (current === null || typeof current !== 'object') {
      throw new PointerNotFoundError(
        `Cannot index into non-container at token ${JSON.stringify(token)}`
      );
    }
    if (Array.isArray(current)) {
      // Array indices must be canonical base-10 integers without leading zeros,
      // except for the single digit "0". RFC 6901 section 4.
      if (!/^(0|[1-9][0-9]*)$/.test(token)) {
        throw new PointerNotFoundError(
          `Invalid array index ${JSON.stringify(token)}`
        );
      }
      const index = Number(token);
      if (index >= current.length) {
        throw new PointerNotFoundError(
          `Array index ${index} out of bounds (length ${current.length})`
        );
      }
      current = current[index];
    } else {
      if (!Object.prototype.hasOwnProperty.call(current, token)) {
        throw new PointerNotFoundError(
          `Object has no property ${JSON.stringify(token)}`
        );
      }
      current = current[token];
    }
  }
  return current;
}

/**
 * Get the value at a JSON Pointer within a document.
 *
 * @param {*} doc - The JSON document.
 * @param {string} pointer - The JSON Pointer string.
 * @returns {*} The value at the pointer.
 * @throws {PointerSyntaxError|PointerNotFoundError}
 */
export function get(doc, pointer) {
  const tokens = parsePointer(pointer);
  return resolve(doc, tokens);
}

/**
 * Set the value at a JSON Pointer within a document, mutating containers in place.
 *
 * The final token determines the target:
 * - For an array, a numeric index overwrites an existing element; `-` appends.
 * - For an object, the property is created if it does not exist.
 *
 * Intermediate containers must already exist; this function does not create them.
 * We chose this because automatically creating containers requires guessing whether
 * a missing step should be an object or an array, which is ambiguous and surprising.
 *
 * @param {*} doc - The JSON document.
 * @param {string} pointer - The JSON Pointer string.
 * @param {*} value - The value to set.
 * @returns {*} The document, for chaining.
 * @throws {PointerSyntaxError|PointerNotFoundError}
 */
export function set(doc, pointer, value) {
  const tokens = parsePointer(pointer);
  if (tokens.length === 0) {
    throw new PointerNotFoundError('Cannot set the root document');
  }
  const parentTokens = tokens.slice(0, -1);
  const lastToken = tokens[tokens.length - 1];
  const parent = resolve(doc, parentTokens);
  if (parent === null || typeof parent !== 'object') {
    throw new PointerNotFoundError('Parent of target is not a container');
  }
  if (Array.isArray(parent)) {
    if (lastToken === '-') {
      parent.push(value);
      return doc;
    }
    if (!/^(0|[1-9][0-9]*)$/.test(lastToken)) {
      throw new PointerNotFoundError(
        `Invalid array index ${JSON.stringify(lastToken)}`
      );
    }
    const index = Number(lastToken);
    if (index >= parent.length) {
      throw new PointerNotFoundError(
        `Array index ${index} out of bounds (length ${parent.length})`
      );
    }
    parent[index] = value;
    return doc;
  }
  // Object: create or overwrite the property.
  parent[lastToken] = value;
  return doc;
}
