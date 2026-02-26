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
})
