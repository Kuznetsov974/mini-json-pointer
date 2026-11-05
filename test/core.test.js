import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePointer,
  get,
  set,
  PointerSyntaxError,
  PointerNotFoundError,
} from '../src/index.js';

test('parsePointer returns empty array for empty string', () => {
  assert.deepEqual(parsePointer(''), []);
});

test('parsePointer decodes ~0 and ~1', () => {
  assert.deepEqual(parsePointer('/foo/bar'), ['foo', 'bar']);
  assert.deepEqual(parsePointer('/a~1b'), ['a/b']);
  assert.deepEqual(parsePointer('/m~0n'), ['m~n']);
  // The order of decoding matters: ~01 should become ~1, not /.
  assert.deepEqual(parsePointer('/~01'), ['~1']);
});

test('parsePointer rejects pointers not starting with /', () => {
  assert.throws(() => parsePointer('foo'), PointerSyntaxError);
  assert.throws(() => parsePointer('foo/bar'), PointerSyntaxError);
});

test('parsePointer rejects non-string input', () => {
  assert.throws(() => parsePointer(42), PointerSyntaxError);
  assert.throws(() => parsePointer(null), PointerSyntaxError);
});

test('get resolves the whole document for empty pointer', () => {
  const doc = { a: 1 };
  assert.equal(get(doc, ''), doc);
});

test('get resolves nested objects and arrays', () => {
  const doc = { foo: ['bar', 'baz'], qux: { quux: 7 } };
  assert.equal(get(doc, '/foo/0'), 'bar');
  assert.equal(get(doc, '/foo/1'), 'baz');
  assert.equal(get(doc, '/qux/quux'), 7);
  assert.deepEqual(get(doc, '/qux'), { quux: 7 });
});

test('get returns undefined for a property that exists with value undefined', () => {
  // hasOwnProperty is used so an own property with undefined value is found.
  const doc = { a: undefined };
  assert.equal(get(doc, '/a'), undefined);
});

test('get throws PointerNotFoundError for missing object property', () => {
  assert.throws(() => get({}, '/missing'), PointerNotFoundError);
});

test('get throws PointerNotFoundError for out-of-bounds array index', () => {
  assert.throws(() => get(['a'], '/1'), PointerNotFoundError);
});

test('get rejects array indices with leading zeros', () => {
  // RFC 6901: array index must be 0 or [1-9][0-9]*.
  assert.throws(() => get(['a'], '/00'), PointerNotFoundError);
  assert.throws(() => get(['a'], '/01'), PointerNotFoundError);
});

test('get treats - as a normal property name', () => {
  const doc = { '-': 'dash' };
  assert.equal(get(doc, '/-'), 'dash');
  assert.throws(() => get(['a'], '/-'), PointerNotFoundError);
});

test('get throws when indexing into a primitive', () => {
  assert.throws(() => get({ a: 1 }, '/a/b'), PointerNotFoundError);
  assert.throws(() => get({ a: null }, '/a/b'), PointerNotFoundError);
});

test('set overwrites an existing object property', () => {
  const doc = { a: 1 };
  set(doc, '/a', 2);
  assert.equal(doc.a, 2);
});

test('set creates a new object property', () => {
  const doc = { a: 1 };
  set(doc, '/b', 2);
  assert.deepEqual(doc, { a: 1, b: 2 });
});

test('set overwrites an existing array element', () => {
  const doc = ['x', 'y'];
  set(doc, '/1', 'z');
  assert.deepEqual(doc, ['x', 'z']);
});

test('set appends to an array with -', () => {
  const doc = ['x'];
  set(doc, '/-', 'y');
  assert.deepEqual(doc, ['x', 'y']);
});

test('set throws for out-of-bounds array index', () => {
  assert.throws(() => set(['x'], '/5', 'y'), PointerNotFoundError);
});

test('set throws for invalid array index', () => {
  assert.throws(() => set(['x'], '/foo', 'y'), PointerNotFoundError);
});

test('set throws for root pointer', () => {
  assert.throws(() => set({ a: 1 }, '', 2), PointerNotFoundError);
});

test('set throws when an intermediate container is missing', () => {
  assert.throws(() => set({}, '/a/b', 1), PointerNotFoundError);
});

test('set decodes escaped tokens', () => {
  const doc = {};
  set(doc, '/a~1b', 1);
  assert.equal(doc['a/b'], 1);
  set(doc, '/m~0n', 2);
  assert.equal(doc['m~n'], 2);
});
