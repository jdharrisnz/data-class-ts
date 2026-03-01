import { describe, expect, it } from "vitest"

import { DataClass } from "../src/index.js"

describe("DataClass runtime behavior", () => {
  const token = Symbol("token")

  class Base extends DataClass.extend("id")<Base> {
    declare id: string
  }

  class User extends Base.extend("name")<User> {
    declare name?: string
  }

  class UserWithAge extends User.extend("age")<UserWithAge> {
    declare age: number
  }

  class UserAllowUndefinedName extends Base.extend(
    "name",
  )<UserAllowUndefinedName> {
    declare name?: string | undefined
  }

  class WithSymbol extends Base.extend(token)<WithSymbol> {
    declare [token]: number
  }

  class Child extends Base.extend("name")<Child> {
    declare name?: string
  }

  class Reading extends DataClass.extend("value")<Reading> {
    declare value: number
  }

  class Address extends DataClass.extend("city")<Address> {
    declare city: string
  }

  class UserWithAddress extends Base.extend("address")<UserWithAddress> {
    declare address: Address
  }

  class AddressWithCountry extends Address.extend(
    "country",
  )<AddressWithCountry> {
    declare country: string
  }

  class UserWithDetailedAddress extends Base.extend(
    "address",
  )<UserWithDetailedAddress> {
    declare address: AddressWithCountry
  }

  class AddressWithZip extends Address.extend("zip")<AddressWithZip> {
    declare zip: string
  }

  describe("extend()", () => {
    it("multi-level extend preserves inherited keys at runtime", () => {
      const child = new Child({ id: "u_1", name: "Ada" })
      expect(child.pick()).toEqual({ id: "u_1", name: "Ada" })
    })
  })

  describe("isDataClass()", () => {
    it("detects DataClass instances and rejects plain values", () => {
      expect(DataClass.isDataClass(new User({ id: "u_1" }))).toBe(true)
      expect(DataClass.isDataClass({ id: "u_1" })).toBe(false)
      expect(DataClass.isDataClass(null)).toBe(false)
      expect(DataClass.isDataClass(undefined)).toBe(false)
    })
  })

  describe("pick()", () => {
    it("includes declared own properties and omits undeclared ad-hoc fields", () => {
      const user = new User({ id: "u_1", name: "Ada" })
      ;(user as any).role = "admin"

      expect(user.pick()).toEqual({ id: "u_1", name: "Ada" })
      expect(Reflect.ownKeys(user.pick())).not.toContain("role")
    })

    it("omits declared keys that are not present on the instance", () => {
      const user = new User({ id: "u_1" })
      const picked = user.pick()

      expect(picked).toEqual({ id: "u_1" })
      expect(Reflect.ownKeys(picked)).not.toContain("name")
    })

    it("projects only selected declared keys", () => {
      const user = new UserWithAge({ id: "u_1", age: 42 })

      expect(user.pick("id")).toEqual({ id: "u_1" })
      expect(user.pick("name", "age")).toEqual({ age: 42 })
    })

    it("returns a fresh object", () => {
      const user = new Base({ id: "u_1" })
      const picked = user.pick()

      picked.id = "mutated"

      expect(user.pick().id).toBe("u_1")
      expect(picked).not.toBe(user.pick())
    })

    it("preserves symbol-declared fields via Reflect.ownKeys", () => {
      const value = new WithSymbol({ id: "u_1", [token]: 42 })
      const picked = value.pick()
      const keys = Reflect.ownKeys(picked)

      expect(keys).toContain(token)
      expect(picked[token]).toBe(42)
      expect(picked.id).toBe("u_1")
    })
  })

  describe("keys()", () => {
    it("returns all declared keys, including optional keys not present", () => {
      const user = new User({ id: "u_1" })
      const keys = user.keys()

      expect(keys).toContain("id")
      expect(keys).toContain("name")
      expect(keys).toHaveLength(2)
    })

    it("includes symbol declarations", () => {
      const value = new WithSymbol({ id: "u_1", [token]: 42 })
      const keys = value.keys()

      expect(keys).toContain("id")
      expect(keys).toContain(token)
      expect(keys).toHaveLength(2)
    })
  })

  describe("entries()", () => {
    it("includes only present declared keys", () => {
      const user = new User({ id: "u_1" })
      const entries = user.entries()

      expect(entries).toEqual([["id", "u_1"]])
    })

    it("includes declared symbol entries", () => {
      const value = new WithSymbol({ id: "u_1", [token]: 42 })
      const entries = value.entries()
      const tokenEntry = entries.find(([key]) => key === token)

      expect(entries).toContainEqual(["id", "u_1"])
      expect(tokenEntry).toEqual([token, 42])
      expect(entries).toHaveLength(2)
    })
  })

  describe("omit()", () => {
    it("excludes selected declared keys", () => {
      const user = new UserWithAge({ id: "u_1", name: "Ada", age: 42 })

      expect(user.omit("name")).toEqual({ id: "u_1", age: 42 })
      expect(user.omit("id", "age")).toEqual({ name: "Ada" })
    })

    it("with no keys is equivalent to pick()", () => {
      const user = new User({ id: "u_1" })

      expect(user.omit()).toEqual(user.pick())
    })

    it("supports declared symbol keys", () => {
      const value = new WithSymbol({ id: "u_1", [token]: 42 })
      const omitted = value.omit(token)

      expect(omitted).toEqual({ id: "u_1" })
      expect(Reflect.ownKeys(omitted)).not.toContain(token)
    })
  })

  describe("equals()", () => {
    it("compares declared primitive values and rejects non-instances", () => {
      const a = new User({ id: "u_1", name: "Ada" })
      const b = new User({ id: "u_1", name: "Ada" })
      const c = new User({ id: "u_1", name: "Grace" })

      expect(a.equals(b)).toBe(true)
      expect(a.equals(c)).toBe(false)
    })

    it("allows a supertype receiver to ignore extra subtype keys", () => {
      const base = new Base({ id: "u_1" })
      const child = new Child({ id: "u_1", name: "Ada" })

      expect(base.equals(child)).toBe(true)
    })

    it("treats NaN as equal via Object.is semantics", () => {
      const a = new Reading({ value: Number.NaN })
      const b = new Reading({ value: Number.NaN })
      const c = new Reading({ value: 1 })

      expect(a.equals(b)).toBe(true)
      expect(a.equals(c)).toBe(false)
    })

    it("distinguishes absent optional keys from present undefined keys", () => {
      const absent = new User({ id: "u_1" })
      const presentUndefinedA = new User({ id: "u_1" })
      const presentUndefinedB = new User({ id: "u_1" })

      ;(presentUndefinedA as any).name = undefined
      ;(presentUndefinedB as any).name = undefined

      expect(absent.equals(presentUndefinedA)).toBe(false)
      expect(presentUndefinedA.equals(absent)).toBe(false)
      expect(presentUndefinedA.equals(presentUndefinedB)).toBe(true)
    })

    it("performs deep checks for nested DataClass values", () => {
      const a = new UserWithAddress({
        id: "u_1",
        address: new Address({ city: "NYC" }),
      })
      const b = new UserWithAddress({
        id: "u_1",
        address: new Address({ city: "NYC" }),
      })
      const c = new UserWithAddress({
        id: "u_1",
        address: new Address({ city: "SF" }),
      })

      expect(a.equals(b)).toBe(true)
      expect(a.equals(c)).toBe(false)
    })
  })

  describe("diff()", () => {
    it("returns only changed primitive keys", () => {
      const before = new User({ id: "u_1", name: "Ada" })
      const after = new User({ id: "u_2", name: "Ada" })

      expect(before.diff(after)).toEqual({
        id: { self: "u_1", that: "u_2" },
      })
    })

    it("distinguishes absent optional keys from present undefined keys", () => {
      const absent = new UserAllowUndefinedName({ id: "u_1" })
      const presentUndefined = new UserAllowUndefinedName({
        id: "u_1",
        name: undefined,
      })

      expect(absent.diff(presentUndefined)).toEqual({
        name: { self: undefined, that: undefined },
      })
    })

    it("recurses into nested DataClass values", () => {
      const a = new UserWithDetailedAddress({
        id: "u_1",
        address: new AddressWithCountry({ city: "NYC", country: "US" }),
      })
      const b = new UserWithDetailedAddress({
        id: "u_1",
        address: new AddressWithCountry({ city: "SF", country: "US" }),
      })

      expect(a.diff(b)).toEqual({
        address: {
          city: { self: "NYC", that: "SF" },
        },
      })
    })

    it("does not recurse when nested DataClass shapes differ", () => {
      const left = new UserWithAddress({
        id: "u_1",
        address: new Address({ city: "NYC" }),
      })
      const right = new UserWithAddress({
        id: "u_1",
        address: new AddressWithZip({ city: "NYC", zip: "10001" }) as any,
      })

      expect(left.diff(right)).toEqual({
        address: { self: left.address, that: right.address },
      })
    })
  })

  describe("toJSON()", () => {
    it("serializes only declared fields and integrates with stringify", () => {
      const user = new User({ id: "u_1" })
      ;(user as any).role = "admin"

      expect(user.toJSON()).toEqual({ id: "u_1" })
      expect(JSON.stringify(user)).toBe('{"id":"u_1"}')
    })
  })
})
