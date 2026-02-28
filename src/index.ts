const hasOwn = <A extends PropertyKey>(
  self: object,
  prop: A,
): self is Record<A, unknown> =>
  Object.prototype.hasOwnProperty.call(self, prop)

const ns = "~data-class-ts/"
const Brand = `${ns}Brand`
const Shape = `${ns}Shape`
type Shape = typeof Shape

/**
 * Carries a type-level representation of which data fields are declared.
 *
 * The runtime value at `Shape` is a lightweight marker object used for
 * discovery (`pick`) and for preserving field optionality through extension.
 */
export interface ShapeCarrier<Source extends object> {
  readonly [Shape]: { readonly [K in keyof Source]: null }
}

type Simplify<A extends object> =
  { [K in keyof A]: A[K] } extends infer B extends A ? B : never

type Mutable<A extends object> = { -readonly [K in keyof A]: A[K] }

type Diff<A extends DataClass> = Simplify<{
  -readonly [K in keyof A[Shape]]?: A[K] extends DataClass ? Diff<A[K]>
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
  declare private readonly [Brand]: typeof Brand
  declare readonly [Shape]: {}

  /**
   * Get an array of declared keys for this instance. All keys will be present,
   * whether the instance's property is optional or not.
   */
  keys<This extends DataClass>(this: This): Array<keyof This[Shape]> {
    return Reflect.ownKeys(this[Shape]) as any
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
      [K in keyof This[Shape]]-?: [K, Required<Pick<This, K>>[K]]
    }[keyof This[Shape]]
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
  pick(): Simplify<Mutable<Pick<this, keyof this[Shape]>>>
  pick<const K extends Array<keyof this[Shape]>>(
    ...keys: K
  ): Simplify<Mutable<Pick<this, K[number]>>>
  pick(...picked: Array<keyof this[Shape]>) {
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
  omit<const K extends Array<keyof this[Shape]>>(
    ...keys: K
  ): Simplify<Mutable<Pick<this, Exclude<keyof this[Shape], K[number]>>>> {
    const exclude = new Set(keys)
    const include = this.keys().filter((key) => !exclude.has(key))
    return this.pick(...include)
  }

  /**
   * Check that all the declared properties of `this` are equal to those of an
   * argument of the same type.
   *
   * Notes:
   *
   * - Uses `Object.is` to check for structural equality
   * - If `that` has excess properties, those are not checked
   * - If a value is itself an instance of `DataClass`, will defer to that
   *   instance's `equals` method to check deeper
   */
  equals(that: this): boolean {
    if (!DataClass.isDataClass(that)) return false

    return this.keys().every((key) => {
      // Check presence
      const isThisPresent = hasOwn(this, key)
      const isThatPresent = hasOwn(that, key)
      if (isThisPresent !== isThatPresent) return false // One present, one not present
      if (!isThisPresent) return true // Both missing, nothing to compare

      // Check equality
      const thisValue = this[key]
      const thatValue = (that as this)[key]
      return (
        Object.is(thisValue, thatValue) ||
        (DataClass.isDataClass(thisValue) &&
          DataClass.isDataClass(thatValue) &&
          thisValue.equals(thatValue))
      )
    })
  }

  /**
   * Return a structural diff between this and `that`. Only declared keys of
   * `this` are considered. Keys that differ are included as:
   *
   * 1. `{ self, that }` for non-`DataClass` values.
   * 2. A nested diff object for `DataClass` values with the same structure.
   *
   * Optional keys preserve presence semantics: an absent key and a present key
   * (even if `undefined`) are treated as different.
   */
  diff(that: this): Diff<this> {
    interface SimpleDiff {
      [x: PropertyKey]: { self: unknown; that: unknown } | SimpleDiff
    }
    return this.keys().reduce<SimpleDiff>((acc, key) => {
      const isThisPresent = hasOwn(this, key)
      const isThatPresent = hasOwn(that, key)
      // Both missing, no difference
      if (!isThisPresent && !isThatPresent) return acc

      const thisValue = this[key]
      const thatValue = that[key]
      // Both present and equal, no difference
      if (Object.is(thisValue, thatValue)) {
        // Edge case: absent-undefined vs present-undefined
        if (isThisPresent !== isThatPresent) {
          acc[key] = { self: thisValue, that: thatValue }
        }
        return acc
      }

      const isThisDataClass = DataClass.isDataClass(thisValue)
      const isThatDataClass = DataClass.isDataClass(thatValue)
      // Both DataClasses
      if (isThisDataClass && isThatDataClass) {
        const thisValueKeys = thisValue.keys()
        const thatValueKeys = thatValue.keys()
        // Same shape
        if (
          thisValueKeys.length === thatValueKeys.length &&
          thisValueKeys.every((key, i) => key === thatValueKeys[i])
        ) {
          // If not equal, add deep comparison
          if (!thisValue.equals(thatValue)) {
            acc[key] = thisValue.diff(thatValue) as SimpleDiff
          }
          // If equal, no difference
          return acc
        }
      }

      // Not equal and not deeply comparable, add comparison
      acc[key] = { self: thisValue, that: thatValue }
      return acc
    }, {}) as any
  }

  toJSON() {
    return this.pick()
  }

  /**
   * Key used to store the declared data-shape marker on a class prototype.
   *
   * This is part of the public API so advanced consumers can use it for
   * type-level transforms (for example `Pick`/`Omit` against the shape).
   */
  static readonly Shape = Shape

  static isDataClass(this: void, input: unknown): input is DataClass {
    return !!input && (input as Record<string, unknown>)[Brand] === Brand
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
        props: Readonly<Pick<Instance, keyof Instance[Shape]>>, // Require that the first constructor param has not been changed
        ...rest: Array<any>
      ): Instance
    },
    ...declared: K
  ): {
    new <Self extends Instance & Partial<Record<K[number], unknown>>>(
      props: Simplify<
        Readonly<
          // Pick self
          Pick<Self, Extract<keyof Instance[Shape] | K[number], keyof Self>> &
            // Declared-but-untyped keys become required + `never` as an error
            Record<
              Exclude<keyof Instance[Shape] | K[number], keyof Self>,
              never
            >
        >
      >,
      ...rest: ConstructorParameters<This> extends [unknown, ...infer Rest] ?
        Rest
      : []
    ): ShapeCarrier<Pick<Self, keyof Instance[Shape] | K[number]>> & Instance
  } & This {
    const Derived = class<
      Self extends Instance & Partial<Record<K[number], unknown>>,
    > extends this {
      constructor(
        props: Readonly<Pick<Self, keyof Instance[Shape] | K[number]>>,
        ...rest: ConstructorParameters<This> extends [unknown, ...infer Rest] ?
          Rest
        : []
      ) {
        super(props as never, ...rest) // Defer to super for base key assignment and rest props
        // Assign declared props
        for (let i = 0; i < declared.length; i += 1) {
          const key = declared[i] as keyof this
          if (hasOwn(props, key)) this[key] = props[key] as never
        }
      }

      declare readonly [Shape]: {
        readonly [x in keyof Instance[Shape] | K[number]]: null
      }
    }

    // @ts-expect-error Readonly assignment
    Derived.prototype[Shape] = declared.reduce<Record<PropertyKey, null>>(
      (acc, cur) => {
        acc[cur] = null
        return acc
      },
      Object.assign({}, (this.prototype as Instance)[Shape]), // Clone superclass shape before mutating
    )

    return Derived
  }
}

Object.assign(DataClass.prototype, {
  [Brand]: Brand,
  [Shape]: {},
})
