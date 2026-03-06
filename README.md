# data-class-ts

Immutable-first data classes for TypeScript.

`DataClass` combines:

1. Type shape
2. Construction
3. Methods to transform that data

...in one place, while encouraging immutable workflows. Zero dependencies,
1.25kB minified.

## Why this exists

Classes are often used as mutable objects in day-to-day codebases.  
This library presents a different pattern: treat classes as immutable data
buckets with ergonomic behavior attached.

For this kind of model, many teams default to `type`/`interface` plus several
separate pieces (factory functions, helper utilities, ad hoc
equality/serialization, and update helpers). `data-class-ts` keeps those
concerns together in one place:

1. You declare keys up front with `extend(...)`.
2. Constructor assignment is generated from that declaration.
3. Instance methods define transformation behavior next to the data shape.
4. Strongly-typed built-ins like `keys`, `entries`, `pick`, `omit`, `equals`,
   `diff`, and `toJSON` provide consistent ergonomics.
5. Declared-key projection gives a niche guard against accidental excess data.

## Core pattern

```ts
import { DataClass } from "data-class-ts"

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

### `DataClassShape` (type export)

Type-only unique symbol key for declared-shape metadata. It exists for
type-level transforms and is intentionally not present at runtime.

### `ShapeOf<T>` (type export)

Extracts the declared shape marker object for a `DataClass` type.

### `DataClass.isDataClass(value)`

Runtime guard for checking whether a value is a `DataClass` instance.

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

### `equals(that)`

Compares declared keys using `Object.is()`.

1. Type signature is `equals(that: this): boolean`.
2. Nested `DataClass` values compare deeply via nested `equals`.
3. Extra keys on `that` are ignored when not declared on `this`.

### `diff(that)`

Returns a sparse object describing differences across declared keys.

1. Changed primitive/non-`DataClass` fields are reported as
   `{ self: value, that: value }`.
2. Nested `DataClass` fields recurse when both sides share the same declared
   shape.
3. Optional presence is significant: absent and present-`undefined` are treated
   as different.

### `toJSON()`

Returns `pick()` and is used by `JSON.stringify`.

## Guidance

1. Subclasses must be manually provided to the `.extend()` type parameter.
2. Every declared key must be added to the subclass using `declare`.
3. For alternative construction paths, add static factory methods.

## TypeScript notes

### TL;DR

1. The runtime goal is simple: immutable classes with generated, shape-aware
   helpers.
2. The key pattern is `extend(...keys)` + a shape marker + polymorphic `this`.
3. For array/tuple-returning methods, inferring `This` at call sites keeps
   subclass widening valid while preserving precise return types.

Before:

```ts
class User {
  readonly id: string
  readonly name?: string

  constructor(props: Readonly<{ id: string; name?: string }>) {
    this.id = props.id
    this.name = props.name
  }
}
```

After:

```ts
class User extends DataClass.extend("id", "name")<{
  id: string
  name?: string
}> {} // inherits handy utility methods
```

### Prior art

I was originally intrigued by Effect's `Data.Class`, and wondered how the
typing worked. The attractive idea is that the constructor props become the
instance shape:

```ts
class Class<Props extends object> {
  constructor(props: Readonly<Props>) {
    Object.assign(this, props)
  }
}
```

The really interesting part is the type shape behind that idea. What you want
is effectively a constructor signature with a dynamic instance type:

```ts
interface ClassConstructor {
  new <Props extends object>(props: Readonly<Props>): Readonly<Props>
}
```

That is not directly expressible as a plain class declaration, because class
instance types are static. A class declaration cannot say "the instance members
change based on constructor props". Constructor function types are where this
pattern is expressible.

That also suggests a strong design rule:

1. The base constructor should take the most basic input shape: `props`.
2. If construction needs transformation, validation, or defaults, push that
   into static factory methods that call `new MyClass(props)`.

### Motivation

The appeal of the props-first pattern is that it removes a lot of class
boilerplate. But a type-only shape also has some practical drawbacks:

1. `Object.assign(this, props)` will happily assign excess properties.
2. Spreading a class instance back into a constructor is "fine-ish" for data
   props, but it also replays any accidental extra own properties.
3. That makes equality and other data-only behavior harder to reason about.

### The solution

`data-class-ts` requires derived classes to declare their construction keys up
front, then only assigns those keys.

Instead of:

```ts
Object.assign(this, props)
```

it does:

```ts
for (const key of declared) {
  if (hasOwn(props, key)) this[key] = props[key]
}
```

That one decision unlocks the library's shape-aware methods:

1. `keys()`
2. `entries()`
3. `pick()`
4. `pick(...keys)`
5. `omit(...keys)`
6. `equals(that)`
7. `diff(that)`
8. `toJSON()`

`pick()` is especially useful because it gives a fresh POJO projection for
immutable updates while keeping class-spread linters happy.

### Design constraints

#### `class X extends DataClass` is not enough

Plain `extends` gives no place to pass the declared runtime key list, so there
is nothing to close over when generating a constructor. That is why the
entrypoint is `DataClass.extend(...keys)`.

#### Base method signatures cannot be replaced concretely

If subclass instance types literally replace methods like `pick()`, method
intersections accumulate overloads:

```ts
type BaseInstance = { pick(): { id: string } }
type DerivedInstance = { pick(): { id: string; name: string } }

type Combined = DerivedInstance & BaseInstance
type PickReturn = ReturnType<Combined["pick"]> // { id: string }
```

Runtime calls still pick the first matching overload, but detached type queries
like `ReturnType<User["pick"]>` see the last overload instead.

Trying to remove and re-add methods with mapped types is also not a great fit
here, because mapping over a type with private fields strips it down to public
shape.

#### Array and tuple return types are the awkward bit

TypeScript is much stricter about widening tuple and array return types through
subclassing than it is about widening structural object shapes. That matters for
methods like `keys()` and `entries()`.

The workaround is to defer resolution of those return types by inferring a
`This` type parameter at call sites, instead of fixing the tuple/array return in
the base declaration. That lets subclasses widen while still producing the
desired concrete array or tuple types.

This also explains why direct method calls can be more accurate than detached
type queries:

```ts
user.keys()
type Keys = ReturnType<User["keys"]>
```

At the call site, TypeScript can infer `This = User`. In `ReturnType<...>`,
there is nowhere to provide that type argument, so TypeScript fills in the
widest valid type argument instead (`unknown`, or the `extends` constraint if
there is one), which widens the result.

### The core pattern

The base `DataClass` is the empty case: it has all the methods, but no declared
keys.

The important type marker is:

```ts
declare const DataClassShape: unique symbol
```

It is optional and never present, so it is powerful in type-land while still
being honest about runtime.

Each call to `DataClass.extend(...keys)` generates a subclass constructor by
extending `this`.

```ts
class User extends DataClass.extend("id", "name")<{
  id: string
  name: string
}> {
  rename(name: string): User {
    return new User({ ...this.pick(), name })
  }
}

class UserWithAge extends User.extend("age")<{ age: number }> {}
```

TypeScript mixin behavior intersects both the constructor type and the instance
type.

On the constructor side, the new first-argument props requirement is intersected
with the previous first-argument props requirement, so newly declared props
merge with inherited props.

On the instance side, the new instance shape is intersected with the previous
instance shape, including inherited methods.

At runtime, each generated subclass mainly does two things:

1. Adds a constructor that assigns only declared keys.
2. Updates `keys()` to include inherited and newly declared keys.

Everything else (`pick`, `omit`, `equals`, `diff`, `toJSON`) keeps working from
the stable base implementation. Struct-returning methods can lean on
polymorphic `this`, while array/tuple-returning methods use `This` inference to
defer type resolution until usage.

### What this taught me

Classes are really nice for this style of programming:

1. You get an opaque domain type.
2. You get a canonical construction path.
3. You get a natural home for shape-aware transformation methods.
4. You still keep class-specific benefits like private fields for branding or
   caching.

With one small extra input from users, declared keys, you can add meaningful
guardrails and ergonomics without much runtime cost.

## Notes

1. Package ships both `dist/` and `src/` so editor navigation can jump to
   source.
2. Runtime entrypoint is `dist/index.js` with types from `dist/index.d.ts`.

## License

MIT
