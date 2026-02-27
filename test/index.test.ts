import { describe, expect, it } from "vitest"

import { DataClass, ShapeId } from "../src/index.js"

describe("DataClass runtime behavior", () => {
  it("pick() includes declared own properties and omits undeclared ad-hoc fields", () => {
    class User extends DataClass.extend("id", "name")<User> {
      declare id: string
      declare name?: string
    }

    const user = new User({ id: "u_1", name: "Ada" })
    ;(user as any).role = "admin"

    expect(user.pick()).toEqual({ id: "u_1", name: "Ada" })
    expect(Reflect.ownKeys(user.pick())).not.toContain("role")
  })

  it("pick() omits declared keys that are not present on the instance", () => {
    class User extends DataClass.extend("id", "name")<User> {
      declare id: string
      declare name?: string
    }

    const user = new User({ id: "u_1" })
    const picked = user.pick()

    expect(picked).toEqual({ id: "u_1" })
    expect(Reflect.ownKeys(picked)).not.toContain("name")
  })

  it("pick(...keys) projects only selected declared keys", () => {
    class User extends DataClass.extend("id", "name", "age")<User> {
      declare id: string
      declare name?: string
      declare age: number
    }

    const user = new User({ id: "u_1", age: 42 })

    expect(user.pick("id")).toEqual({ id: "u_1" })
    expect(user.pick("name", "age")).toEqual({ age: 42 })
  })

  it("pick() returns a fresh object", () => {
    class User extends DataClass.extend("id")<User> {
      declare id: string
    }

    const user = new User({ id: "u_1" })
    const picked = user.pick()

    picked.id = "mutated"

    expect(user.pick().id).toBe("u_1")
    expect(picked).not.toBe(user.pick())
  })

  it("multi-level extend preserves inherited keys at runtime", () => {
    class Base extends DataClass.extend("id")<Base> {
      declare id: string
    }

    class Child extends Base.extend("name")<Child> {
      declare name?: string
    }

    const child = new Child({ id: "u_1", name: "Ada" })
    expect(child.pick()).toEqual({ id: "u_1", name: "Ada" })
  })

  it("ShapeId marker on prototype merges inherited and new declarations", () => {
    class Base extends DataClass.extend("id")<Base> {
      declare id: string
    }

    class Child extends Base.extend("name")<Child> {
      declare name?: string
    }

    expect(Base.prototype[ShapeId]).toEqual({ id: null })
    expect(Child.prototype[ShapeId]).toEqual({ id: null, name: null })
  })

  it("pick() preserves symbol-declared fields via Reflect.ownKeys", () => {
    const token = Symbol("token")

    class WithSymbol extends DataClass.extend(token, "id")<WithSymbol> {
      declare id: string;
      declare [token]: number
    }

    const value = new WithSymbol({ id: "u_1", [token]: 42 })
    const picked = value.pick()
    const keys = Reflect.ownKeys(picked)

    expect(keys).toContain(token)
    expect(picked[token]).toBe(42)
    expect(picked.id).toBe("u_1")
  })

  it("keys() returns all declared keys, including optional keys not present", () => {
    class User extends DataClass.extend("id", "name")<User> {
      declare id: string
      declare name?: string
    }

    const user = new User({ id: "u_1" })
    const keys = user.keys()

    expect(keys).toContain("id")
    expect(keys).toContain("name")
    expect(keys).toHaveLength(2)
  })

  it("keys() includes symbol declarations", () => {
    const token = Symbol("token")

    class WithSymbol extends DataClass.extend(token, "id")<WithSymbol> {
      declare id: string;
      declare [token]: number
    }

    const value = new WithSymbol({ id: "u_1", [token]: 42 })
    const keys = value.keys()

    expect(keys).toContain("id")
    expect(keys).toContain(token)
    expect(keys).toHaveLength(2)
  })

  it("entries() includes only present declared keys", () => {
    class User extends DataClass.extend("id", "name")<User> {
      declare id: string
      declare name?: string
    }

    const user = new User({ id: "u_1" })
    const entries = user.entries()

    expect(entries).toEqual([["id", "u_1"]])
  })

  it("entries() includes declared symbol entries", () => {
    const token = Symbol("token")

    class WithSymbol extends DataClass.extend(token, "id")<WithSymbol> {
      declare id: string;
      declare [token]: number
    }

    const value = new WithSymbol({ id: "u_1", [token]: 42 })
    const entries = value.entries()
    const tokenEntry = entries.find(([key]) => key === token)

    expect(entries).toContainEqual(["id", "u_1"])
    expect(tokenEntry).toEqual([token, 42])
    expect(entries).toHaveLength(2)
  })

  it("omit(...keys) excludes selected declared keys", () => {
    class User extends DataClass.extend("id", "name", "age")<User> {
      declare id: string
      declare name?: string
      declare age: number
    }

    const user = new User({ id: "u_1", name: "Ada", age: 42 })

    expect(user.omit("name")).toEqual({ id: "u_1", age: 42 })
    expect(user.omit("id", "age")).toEqual({ name: "Ada" })
  })

  it("omit() with no keys is equivalent to pick()", () => {
    class User extends DataClass.extend("id", "name")<User> {
      declare id: string
      declare name?: string
    }

    const user = new User({ id: "u_1" })

    expect(user.omit()).toEqual(user.pick())
  })

  it("omit(...keys) supports declared symbol keys", () => {
    const token = Symbol("token")

    class WithSymbol extends DataClass.extend(token, "id")<WithSymbol> {
      declare id: string
      declare [token]: number
    }

    const value = new WithSymbol({ id: "u_1", [token]: 42 })
    const omitted = value.omit(token)

    expect(omitted).toEqual({ id: "u_1" })
    expect(Reflect.ownKeys(omitted)).not.toContain(token)
  })

  it("equals() compares declared primitive values and rejects non-instances", () => {
    class User extends DataClass.extend("id", "name")<User> {
      declare id: string
      declare name?: string
    }

    const a = new User({ id: "u_1", name: "Ada" })
    const b = new User({ id: "u_1", name: "Ada" })
    const c = new User({ id: "u_1", name: "Grace" })

    expect(a.equals(b)).toBe(true)
    expect(a.equals(c)).toBe(false)
    expect(a.equals({ id: "u_1", name: "Ada" })).toBe(false)
  })

  it("equals() requires the same prototype", () => {
    class Base extends DataClass.extend("id")<Base> {
      declare id: string
    }
    class Child extends Base.extend("name")<Child> {
      declare name?: string
    }

    const base = new Base({ id: "u_1" })
    const child = new Child({ id: "u_1" })

    expect(base.equals(child)).toBe(false)
    expect(child.equals(base)).toBe(false)
  })

  it("equals() treats NaN as equal via Object.is semantics", () => {
    class Reading extends DataClass.extend("value")<Reading> {
      declare value: number
    }

    const a = new Reading({ value: Number.NaN })
    const b = new Reading({ value: Number.NaN })
    const c = new Reading({ value: 1 })

    expect(a.equals(b)).toBe(true)
    expect(a.equals(c)).toBe(false)
  })

  it("equals() distinguishes absent optional keys from present undefined keys", () => {
    class User extends DataClass.extend("id", "name")<User> {
      declare id: string
      declare name?: string
    }

    const absent = new User({ id: "u_1" })
    const presentUndefinedA = new User({ id: "u_1" })
    const presentUndefinedB = new User({ id: "u_1" })

    ;(presentUndefinedA as any).name = undefined
    ;(presentUndefinedB as any).name = undefined

    expect(absent.equals(presentUndefinedA)).toBe(false)
    expect(presentUndefinedA.equals(absent)).toBe(false)
    expect(presentUndefinedA.equals(presentUndefinedB)).toBe(true)
  })

  it("equals() performs deep checks for nested DataClass values", () => {
    class Address extends DataClass.extend("city")<Address> {
      declare city: string
    }

    class User extends DataClass.extend("id", "address")<User> {
      declare id: string
      declare address: Address
    }

    const a = new User({ id: "u_1", address: new Address({ city: "NYC" }) })
    const b = new User({ id: "u_1", address: new Address({ city: "NYC" }) })
    const c = new User({ id: "u_1", address: new Address({ city: "SF" }) })

    expect(a.equals(b)).toBe(true)
    expect(a.equals(c)).toBe(false)
  })

  it("toJSON() serializes only declared fields and integrates with stringify", () => {
    class User extends DataClass.extend("id", "name")<User> {
      declare id: string
      declare name?: string
    }

    const user = new User({ id: "u_1" })
    ;(user as any).role = "admin"

    expect(user.toJSON()).toEqual({ id: "u_1" })
    expect(JSON.stringify(user)).toBe('{"id":"u_1"}')
  })
})
