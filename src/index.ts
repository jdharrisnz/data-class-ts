const hasOwn = <P extends PropertyKey>(
  self: object,
  property: P,
): self is Record<P, unknown> =>
  Object.prototype.hasOwnProperty.call(self, property)

/**
 * Symbol key used to store the declared data-shape marker on a class prototype.
 *
 * This is part of the public API so advanced consumers can use it for
 * type-level transforms (for example `Pick`/`Omit` against the shape).
 */
export const ShapeId: unique symbol = Symbol.for("DataClass")
export type ShapeId = typeof ShapeId

/**
 * Carries a type-level representation of which data fields are declared.
 *
 * The runtime value at {@link ShapeId} is a lightweight marker object used for
 * discovery (`pick`) and for preserving field optionality through extension.
 */
export interface ShapeCarrier<Source extends {}> {
  readonly [ShapeId]: { readonly [K in keyof Source]: null }
}

type Simplify<A extends {}> =
  { [K in keyof A]: A[K] } extends infer B ? B : never

/**
 * Base class for immutable-ish data classes.
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
 *   declare id: string
 *   declare name?: string
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
   * Project the declared data fields on `this` into a fresh POJO.
   *
   * This is primarily useful when consumers want to spread data from class
   * instances without tripping class-spread linting rules.
   */
  pick(): { -readonly [K in keyof this[ShapeId]]: this[K] } {
    const keys = Object.keys(this[ShapeId])
    const out: Record<PropertyKey, unknown> = {}
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i]!
      if (hasOwn(this, key)) out[key] = this[key]
    }
    return out as any
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
    const K extends PropertyKey,
  >(
    this: This & { new (...args: any): Instance },
    ...declared: Array<K>
  ): {
    new <Self extends Instance & Partial<Record<K, unknown>>>(
      props: [ConstructorParameters<This>[0]] extends [never] ?
        Simplify<Readonly<Pick<Self, K>>>
      : Simplify<Readonly<Pick<Self, keyof Instance[ShapeId] | K>>>,
      ...rest: ConstructorParameters<This> extends [unknown, ...infer Rest] ?
        Rest
      : []
    ): ShapeCarrier<Pick<Self, keyof Instance[ShapeId] | K>> & Instance
  } & This {
    const Derived = class<
      Self extends Instance & Partial<Record<K, unknown>>,
    > extends this {
      constructor(
        props: [ConstructorParameters<This>[0]] extends [never] ?
          Readonly<Pick<Self, K>>
        : Readonly<Pick<Self, keyof Instance[ShapeId] | K>>,
        ...rest: ConstructorParameters<This> extends [unknown, ...infer Rest] ?
          Rest
        : []
      ) {
        super(props, ...rest)
        for (let i = 0; i < declared.length; i += 1) {
          const key = declared[i] as never
          if (hasOwn(props, key)) this[key] = props[key]
        }
      }

      declare readonly [ShapeId]: {
        readonly [K_ in keyof Instance[ShapeId] | K]: null
      }
    }

    Object.assign(Derived.prototype, {
      [ShapeId]: {
        ...(this.prototype as Instance)[ShapeId],
        ...Object.fromEntries(declared.map((k) => [k, null])),
      },
    })

    return Derived
  }
}

Object.assign(DataClass.prototype, { [ShapeId]: {} })
