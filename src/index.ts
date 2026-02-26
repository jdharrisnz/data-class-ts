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

/** Like regular Pick, but defaults to `never` instead of `unknown`. */
type PickOrNever<A extends object, K extends keyof A> = {
  [P in K]: P extends keyof A ? A[P] : never
}

type Simplify<A extends object> =
  { [K in keyof A]: A[K] } extends infer B extends A ? B : never

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
   * Project the declared data fields on `this` into a fresh POJO.
   *
   * This is primarily useful when consumers want to spread data from class
   * instances without tripping class-spread linting rules.
   */
  pick(): { -readonly [K in keyof this[ShapeId]]: this[K] } {
    const out: Record<PropertyKey, unknown> = {}

    const keys = Reflect.ownKeys(this[ShapeId])
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i] as keyof this
      if (Object.prototype.hasOwnProperty.call(this, key)) {
        out[key] = this[key]
      }
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
    const K extends Array<PropertyKey> = [],
  >(
    this: This & { new (...args: any): Instance },
    ...declared: K
  ): {
    new <Self extends Instance & Partial<Record<K[number], unknown>>>(
      props: [ConstructorParameters<This>[0]] extends [never] ?
        Simplify<Readonly<PickOrNever<Self, K[number]>>>
      : Simplify<
          Readonly<PickOrNever<Self, keyof Instance[ShapeId] | K[number]>>
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
        props: [ConstructorParameters<This>[0]] extends [never] ?
          Readonly<Pick<Self, K[number]>>
        : Readonly<Pick<Self, keyof Instance[ShapeId] | K[number]>>,
        ...rest: ConstructorParameters<This> extends [unknown, ...infer Rest] ?
          Rest
        : []
      ) {
        super(props, ...rest)
        for (let i = 0; i < declared.length; i += 1) {
          const key = declared[i] as never
          if (Object.prototype.hasOwnProperty.call(props, key)) {
            this[key] = props[key]
          }
        }
      }

      declare readonly [ShapeId]: {
        readonly [K_ in keyof Instance[ShapeId] | K[number]]: null
      }
    }

    // @ts-expect-error Readonly assignment
    Derived.prototype[ShapeId] = {
      ...(this.prototype as Instance)[ShapeId],
      ...declared.reduce<Record<PropertyKey, null>>((acc, cur) => {
        acc[cur] = null
        return acc
      }, {}),
    }

    return Derived
  }
}

// @ts-expect-error Readonly assignment
DataClass.prototype[ShapeId] = {}
