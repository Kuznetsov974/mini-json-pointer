# mini-json-pointer

Resolve and mutate JSON documents using RFC 6901 JSON Pointer strings.

```js
import { get, set, parsePointer } from 'mini-json-pointer';

const doc = { users: [{ name: 'Ada' }, { name: 'Grace' }] };

get(doc, '/users/1/name');          // 'Grace'
get(doc, '');                       // the whole document
parsePointer('/a~1b');              // ['a/b']

set(doc, '/users/0/name', 'Alan');  // doc.users[0].name is now 'Alan'
set(doc, '/users/-', { name: 'Linus' }); // appends a new user
```

The package exports `parsePointer`, `get`, `set`, `PointerSyntaxError`, and `PointerNotFoundError`.

## Why this exists

JSON Pointer is small enough to reimplement, but the details trip people up: the
`~0`/`~1` escape ordering, the rule that array indices may not have leading zeros,
and the fact that `-` is meaningful only when writing to an array. This library
keeps all of that in one place with no dependencies.

The trade-off: `set` mutates the document you pass in and does not create missing
intermediate containers. Creating them would require guessing whether a missing
step should become an object or an array, which is ambiguous and produces
surprising documents. If you need that, create the containers first, then call
`set`.

## The awkward edge

`get` treats `-` as an ordinary object property name, because RFC 6901 only
gives `-` special meaning for array assignment. So `get({ '-': 1 }, '/-')`
returns `1`, but `get(['a'], '/-')` throws `PointerNotFoundError`. Likewise,
`set` will append with `/-` on an array but will happily create a literal `"-"`
property on an object.
