# data-class

Immutable-first data classes for TypeScript.

`DataClass` combines:

1. Type shape
2. Construction
3. Methods that transform data

...in one place, while still encouraging immutable workflows.

## Why this exists

Classes are often great for organizing behavior, but mutable by default.  
`data-class` keeps class ergonomics while leaning immutable:

1. You declare keys up front with `extend(...)`.
2. Constructor assignment is generated for declared keys.
3. You get built-in helpers like `pick`, `equals`, and `toJSON`.
4. Declared-key projection acts as a niche guard against accidental excess data.

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

### `equals(value)`

Compares declared keys using `Object.is()`. For nested `DataClass` values,
comparison is deep via nested `equals`.

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
