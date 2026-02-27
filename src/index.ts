const hasOwn = <A extends PropertyKey>(
  self: object,
  prop: A,
): self is Record<A, unknown> =>
  Object.prototype.hasOwnProperty.call(self, prop)

const sameProto = (self: object, that: object): boolean =>
  Object.getPrototypeOf(self) === Object.getPrototypeOf(that)

/**
 * Symbol key used to store the declared data-shape marker on a class prototype.
 *
 * This is part of the public API so advanced consumers can use it for
 * type-level transforms (for example `Pick`/`Omit` against the shape).
 */
export const ShapeId: unique symbol = Symbol("DataClass")
export type ShapeId = typeof ShapeId

/**
 * Carries a type-level representation of which data fields are declared.
 *
 * The runtime value at {@link ShapeId} is a lightweight marker object used for
 * discovery (`pick`) and for preserving field optionality through extension.
 */
export interface ShapeCarrier<Source extends object> {
  readonly [ShapeId]: { readonly [K in keyof Source]: null }
}

type Simplify<A extends object> =
  { [K in keyof A]: A[K] } extends infer B extends A ? B : never

type Mutable<A extends object> = { -readonly [K in keyof A]: A[K] }

type Diff<A extends DataClass> = Simplify<{
  -readonly [K in keyof A[ShapeId]]?: A[K] extends DataClass ? Diff<A[K]>
  : { self: A[K]; that: A[K] }
}>

/**
 * Base class for immutable data classes.
 *
 * The entrypoint is always `DataClass.extend(...)`. `class X extends DataClass`
 * is intentionally not supported.
 *
 * Derived classes should use `declare` for data properties to provide typing
 * without creating own runtime initializers.
 *
 * @example
 *
 * ```ts
 * class User extends DataClass.extend("id", "name")<User> {
 *   declare readonly id: string
 *   declare readonly name?: string
 *
 *   rename(name: string): User {
 *     return new User({ ...this.pick(), name })
 *   }
 * }
 *
 * const user = new User({ id: "u_1" })
 * const data = user.pick() // { id: string; name?: string }
 * ```
 */
export class DataClass implements ShapeCarrier<{}> {
  declare readonly [ShapeId]: {}

  /**
   * Get an array of declared keys for this instance. All keys will be present,
   * whether the instance's property is optional or not.
   */
  keys<This extends DataClass>(this: This): Array<keyof This[ShapeId]> {
    return Reflect.ownKeys(this[ShapeId]) as any
  }

  /**
   * Get entries for declared keys that are present on this instance.
   *
   * Optional keys that are currently absent are omitted from the returned
   * array.
   */
  entries<This extends DataClass>(
    this: This,
  ): Array<
    {
      [K in keyof This[ShapeId]]-?: [K, Required<Pick<This, K>>[K]]
    }[keyof This[ShapeId]]
  > {
    return this.keys().reduce((acc, key) => {
      if (hasOwn(this, key)) acc.push([key, this[key]] as never)
      return acc
    }, [])
  }

  /**
   * Project the declared data fields on `this` into a fresh POJO.
   *
   * This is primarily useful when consumers want to spread data from class
   * instances without tripping class-spread linting rules. When keys are
   * provided, only those declared keys are projected.
   */
  pick(): Simplify<Mutable<Pick<this, keyof this[ShapeId]>>>
  pick<const K extends Array<keyof this[ShapeId]>>(
    ...keys: K
  ): Simplify<Mutable<Pick<this, K[number]>>>
  pick(...picked: Array<keyof this[ShapeId]>) {
    return (picked.length ? picked : this.keys()).reduce(
      (acc: Record<PropertyKey, unknown>, key) => {
        if (hasOwn(this, key)) acc[key] = this[key]
        return acc
      },
      {},
    )
  }

  /**
   * Project declared data while excluding specific keys.
   *
   * Optional keys that are absent remain absent in the returned object.
   */
  omit<const K extends Array<keyof this[ShapeId]>>(
    ...keys: K
  ): Simplify<Mutable<Pick<this, Exclude<keyof this[ShapeId], K[number]>>>> {
    const exclude = new Set(keys)
    const include = this.keys().filter((key) => !exclude.has(key))
    return this.pick(...include)
  }

  /**
   * Check that some argument has the same prototype as `this` and that all the
   * declared keys are equal by `Object.is`. If a value is itself an instance of
   * `DataClass`, will defer to that instance's `equals` method to check
   * deeper.
   */
  equals(that: unknown): that is this {
    if (typeof that !== "object" || that === null || !sameProto(this, that)) {
      return false
    }

    return this.keys().every((key) => {
      const hasThis = hasOwn(this, key)
      const hasThat = hasOwn(that, key)
      if (hasThis !== hasThat) return false // One present, one not present
      if (!hasThis) return true // Both missing, nothing to compare

      const thisValue = this[key]
      const thatValue = (that as this)[key]

      return (
        Object.is(thisValue, thatValue) ||
        (thisValue instanceof DataClass && thisValue.equals(thatValue))
      )
    })
  }

  /**
   * Return a structural diff between this instance and `that`.
   *
   * Only declared keys are considered. Keys that differ are included as:
   *
   * 1. `{ self, that }` for primitive/non-`DataClass` values.
   * 2. A nested diff object for `DataClass` values with the same prototype.
   *
   * Optional keys preserve presence semantics: an absent key and a present key
   * (even if `undefined`) are treated as different.
   */
  diff(that: this): Diff<this> {
    type SimpleDiff = {
      [x: PropertyKey]: { self: unknown; that: unknown } | SimpleDiff
    }
    return this.keys().reduce<SimpleDiff>((acc, key) => {
      const hasThis = hasOwn(this, key)
      const hasThat = hasOwn(that, key)
      if (!hasThis && !hasThat) return acc // Both missing, no difference

      const thisValue = this[key]
      const thatValue = that[key]

      // One present, return comparison
      if (hasThis !== hasThat) {
        acc[key] = { self: thisValue, that: thatValue }
        return acc
      }

      const thisDataClass = thisValue instanceof DataClass

      // Both present but equal, no difference
      if (
        Object.is(thisValue, thatValue) ||
        (thisDataClass && thisValue.equals(thatValue))
      ) {
        return acc
      }

      // Recurse if same DC instances, otherwise return comparison
      if (
        thisDataClass &&
        thatValue instanceof DataClass &&
        sameProto(thisValue, thatValue)
      ) {
        acc[key] = thisValue.diff(thatValue) as SimpleDiff
        return acc
      }

      acc[key] = { self: thisValue, that: thatValue }
      return acc
    }, {}) as any
  }

  toJSON() {
    return this.pick()
  }

  /**
   * Create a derived data-class constructor with additional declared fields.
   *
   * Use this as the only class entrypoint: `class User extends
   * DataClass.extend("id")<User> { ... }`.
   *
   * Each call widens the declared shape while preserving inherited members.
   */
  static extend<
    This extends { new (...args: any): any },
    Instance extends DataClass,
    const K extends Array<PropertyKey> = [],
  >(
    this: This & {
      new (
        props: Readonly<Pick<Instance, keyof Instance[ShapeId]>>, // Require that the first constructor param has not been changed
        ...rest: Array<any>
      ): Instance
    },
    ...declared: K
  ): {
    new <Self extends Instance & Partial<Record<K[number], unknown>>>(
      props: Simplify<
        Readonly<
          // Pick self
          Pick<Self, Extract<keyof Instance[ShapeId] | K[number], keyof Self>> &
            // Declared-but-untyped keys become required + `never` as an error
            Record<
              Exclude<keyof Instance[ShapeId] | K[number], keyof Self>,
              never
            >
        >
      >,
      ...rest: ConstructorParameters<This> extends [unknown, ...infer Rest] ?
        Rest
      : []
    ): ShapeCarrier<Pick<Self, keyof Instance[ShapeId] | K[number]>> & Instance
  } & This {
    const Derived = class<
      Self extends Instance & Partial<Record<K[number], unknown>>,
    > extends this {
      constructor(
        props: Readonly<Pick<Self, keyof Instance[ShapeId] | K[number]>>,
        ...rest: ConstructorParameters<This> extends [unknown, ...infer Rest] ?
          Rest
        : []
      ) {
        super(props as never, ...rest) // Defer base key assignment and rest props
        // Assign declared props
        declared.forEach((key) => {
          // Preserve optionals
          if (hasOwn(props, key)) this[key as never] = props[key as never]
        })
      }

      declare readonly [ShapeId]: {
        readonly [x in keyof Instance[ShapeId] | K[number]]: null
      }
    }

    // @ts-expect-error Readonly assignment
    Derived.prototype[ShapeId] = declared.reduce<Record<PropertyKey, null>>(
      (acc, cur) => {
        acc[cur] = null
        return acc
      },
      Object.assign({}, (this.prototype as Instance)[ShapeId]),
    )

    return Derived
  }
}

// @ts-expect-error Readonly assignment
DataClass.prototype[ShapeId] = {}
