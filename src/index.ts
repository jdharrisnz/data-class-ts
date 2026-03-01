const hasOwn = <A extends PropertyKey>(
  self: object,
  prop: A,
): self is Record<A, unknown> =>
  Object.prototype.hasOwnProperty.call(self, prop)

const ns = "~data-class-ts/"
const Brand = `${ns}Brand`

declare const DataClassShape: unique symbol
/**
 * Type of the key used to store the declared data-shape marker on each
 * `DataClass` instance.
 *
 * This is part of the public API so advanced consumers can use it for
 * type-level transforms (for example `Pick`/`Omit` against the shape).
 */
export type DataClassShape = typeof DataClassShape

/**
 * Carries a type-level representation of which data fields are declared and
 * their optionality. The value itself is optional and never present.
 */
export interface ShapeCarrier<Source extends object> {
  readonly [DataClassShape]?: { readonly [K in keyof Source]: null }
}

/** Extract the shape of a `DataClass`. */
export type ShapeOf<A extends DataClass> = NonNullable<A[DataClassShape]>

type Simplify<A extends object> =
  { [K in keyof A]: A[K] } extends infer B extends A ? B : never

type PickOrNever<A, K extends keyof A, BaseK extends keyof A> = Readonly<
  // Pick declared part of props (including overrides)
  Pick<A, Extract<K | BaseK, keyof A>> &
    // Declared-but-untyped keys become required + `never` as an error
    Record<Exclude<K, keyof A>, never>
>

type Tail<A extends Array<unknown>> =
  A extends [unknown, ...infer Rest] ? Rest : []

type Mutable<A extends object> = { -readonly [K in keyof A]: A[K] }

type Diff<A extends DataClass> = Simplify<{
  -readonly [K in keyof ShapeOf<A>]?: A[K] extends DataClass ? Diff<A[K]>
  : { self: A[K]; that: A[K] }
}>

/**
 * Base class for immutable data classes.
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

  declare readonly [DataClassShape]?: {}

  /**
   * Get an array of declared keys for this instance. All keys will be present,
   * whether the instance's property is optional or not.
   */
  keys<This extends DataClass>(this: This): Array<keyof ShapeOf<This>> {
    return []
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
      [K in keyof ShapeOf<This>]-?: [K, Required<Pick<This, K>>[K]]
    }[keyof ShapeOf<This>]
  >
  entries(): Array<[PropertyKey, unknown]> {
    return this.keys().reduce<Array<[PropertyKey, unknown]>>((acc, key) => {
      if (hasOwn(this, key)) acc.push([key, this[key]])
      return acc
    }, [])
  }

  /**
   * Project the declared data fields on `this` into a fresh POJO.
   *
   * This is primarily useful when consumers want to spread data from class
   * instances without tripping class-spread linting rules.
   */
  pick(): Simplify<Mutable<Pick<this, keyof ShapeOf<this>>>>
  /** Project the provided keys of `this` into a fresh POJO. */
  pick<const K extends Array<keyof ShapeOf<this>>>(
    ...keys: K
  ): Simplify<Mutable<Pick<this, K[number]>>>
  pick(...keys: Array<keyof ShapeOf<this>>): Record<PropertyKey, unknown> {
    return (keys.length ? keys : this.keys()).reduce<
      Record<PropertyKey, unknown>
    >((acc, key) => {
      if (hasOwn(this, key)) acc[key] = this[key]
      return acc
    }, {})
  }

  /**
   * Project declared data while excluding specific keys.
   *
   * Optional keys that are absent remain absent in the returned object.
   */
  omit<const K extends Array<keyof ShapeOf<this>>>(
    ...keys: K
  ): Simplify<Mutable<Pick<this, Exclude<keyof ShapeOf<this>, K[number]>>>> {
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
   * - If a value is itself an instance of `DataClass`, will defer to that
   *   instance's `equals` method to check deeper (structural only, does not
   *   compare prototypes)
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
      const thatValue = that[key]
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
          thisValueKeys.every((nestedKey, i) => nestedKey === thatValueKeys[i])
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
    }, {}) as Diff<this>
  }

  toJSON() {
    return this.pick()
  }

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
    This extends { new (...args: Array<any>): DataClass },
    const K extends Array<PropertyKey>,
  >(
    this: This,
    ...declared: K
  ): {
    new <
      Props extends Partial<
        Record<K[number] | keyof ShapeOf<InstanceType<This>>, unknown>
      >,
    >(
      props: Simplify<
        PickOrNever<Props, K[number], keyof ShapeOf<InstanceType<This>>> &
          // Intersect base props if they exist
          (ConstructorParameters<This>[0] extends object ?
            ConstructorParameters<This>[0]
          : {})
      >,
      ...rest: Tail<ConstructorParameters<This>>
    ): PickOrNever<Props, K[number], keyof ShapeOf<InstanceType<This>>> &
      ShapeCarrier<Pick<Props, K[number] | keyof ShapeOf<InstanceType<This>>>> &
      InstanceType<This>
  } & This {
    /** All keys from base + declared, deduped. */
    let deduped: Array<PropertyKey> | undefined

    const Derived = class extends this {
      constructor(...args: Array<any>) {
        super(...args) // Defer to super for base key assignment and rest props
        const props = args[0] as this
        for (let i = 0; i < declared.length; i += 1) {
          const key = declared[i] as keyof this
          if (hasOwn(props, key)) this[key] = props[key]
        }
      }

      override keys<This extends DataClass>(
        this: This,
      ): Array<keyof ShapeOf<This>> {
        if (!deduped) {
          deduped = Array.from(
            new Set((super.keys() as Array<PropertyKey>).concat(declared)),
          )
        }

        return deduped.slice() as any
      }
    }

    return Derived as any
  }
}

// @ts-expect-error Readonly assignment
DataClass.prototype[Brand] = Brand
