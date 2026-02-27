# data-class

Immutable-first data classes for TypeScript.

`DataClass` combines:

1. Type shape
2. Construction
3. Methods to transform that data

...in one place, while encouraging immutable workflows. Zero dependencies,
1.25kb minified.

## Why this exists

Classes are often used as mutable objects in day-to-day codebases.  
This library presents a different pattern: treat classes as immutable data
buckets with ergonomic behavior attached.

For this kind of model, many teams default to `type`/`interface` plus several
separate pieces (factory functions, helper utilities, ad hoc
equality/serialization, and update helpers). `data-class` keeps those concerns
together in one place:

1. You declare keys up front with `extend(...)`.
2. Constructor assignment is generated from that declaration.
3. Instance methods define transformation behavior next to the data shape.
4. Strongly-typed built-ins like `keys`, `entries`, `pick`, `omit`, `equals`,
   and `toJSON` provide consistent ergonomics.
5. Declared-key projection gives a niche guard against accidental excess data.

## Core pattern

```ts
import { DataClass } from "data-class"

class User extends DataClass.extend("id", "name")<User> {
  declare readonly id: string
  declare readonly name?: string

  rename(name: string): User {
    return new User({ ...this.pick(), name })
  }
}

const user = new User({ id: "u_1" })
```

## API

### `DataClass.extend(...keys)`

Defines declared data keys and returns a constructor base to extend from.

### `pick()`

Projects declared keys present on the instance to a fresh POJO.

1. `pick()` returns all present declared keys.
2. `pick(...keys)` returns only the selected present declared keys.

This helps with spreading values from the current instance into a fresh one,
while circumventing lint warnings about spreading class instances.

### `keys()`

Returns all declared keys (string and symbol), including optional keys that
might not currently be present on the instance.

### `entries()`

Returns `[key, value]` tuples for declared keys that are present on the instance
(including symbol keys). Absent optional keys are omitted.

### `omit(...keys)`

Returns a POJO of present declared keys excluding the selected keys.

### `equals(value)`

Compares declared keys using `Object.is()`. For nested `DataClass` values,
comparison is deep via nested `equals`.

### `diff(that)`

Returns a sparse object describing differences across declared keys.

1. Changed primitive/non-`DataClass` fields are reported as
   `{ self: value, that: value }`.
2. Nested `DataClass` fields recurse when both sides share the same prototype.
3. Optional presence is significant: absent and present-`undefined` are treated
   as different.

### `toJSON()`

Returns `pick()` and is used by `JSON.stringify`.

## Guidance

1. Subclasses must be manually provided to the `.extend()` type parameter.
2. Every declared key must be added to the subclass using `declare`.
3. For alternative construction paths, add static factory methods.

## Notes

1. Package ships both `dist/` and `src/` so editor navigation can jump to
   source.
2. Runtime entrypoint is `dist/index.js` with types from `dist/index.d.ts`.

## License

MIT
