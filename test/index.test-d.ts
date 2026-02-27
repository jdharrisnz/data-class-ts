import { assertType, expectTypeOf, test } from "vitest"

import { DataClass } from "../src/index.js"
import type { ShapeCarrier } from "../src/index.js"
import {
  Base,
  MissingTypedField,
  Narrowed,
  RequiredName,
  User,
} from "./type-fixtures.js"

test("base construction and pick() shape", () => {
  const user = new User({ id: "u_1" })
  const picked = user.pick()

  expectTypeOf(picked).toEqualTypeOf<{ id: string; name?: string }>()
  assertType<{ id: string; name?: string }>(picked)
})

test("pick(...keys) narrows to selected keys", () => {
  const user = new User({ id: "u_1" })

  const idOnly = user.pick("id")
  const nameAndId = user.pick("name", "id")

  assertType<{ id: string }>(idOnly)
  assertType<{ id: string; name?: string }>(nameAndId)

  // @ts-expect-error unknown key
  user.pick("extra")
})

test("keys() returns declared key union", () => {
  const user = new User({ id: "u_1" })
  const keys = user.keys()

  assertType<Array<"id" | "name">>(keys)
  expectTypeOf(keys).toEqualTypeOf<Array<"id" | "name">>()
})

test("keys() includes declared symbol keys in the type", () => {
  const token = Symbol("token")

  class WithSymbol extends DataClass.extend(token, "id")<WithSymbol> {
    declare id: string;
    declare [token]: number
  }

  const keys = new WithSymbol({ id: "u_1", [token]: 42 }).keys()
  assertType<Array<"id" | typeof token>>(keys)
})

test("entries() omits optional undefined from tuple value types", () => {
  const user = new User({ id: "u_1" })
  const entries = user.entries()

  assertType<Array<["id", string] | ["name", string]>>(entries)
})

test("entries() includes declared symbol keys in tuple types", () => {
  const token = Symbol("token")

  class WithSymbol extends DataClass.extend(token, "id")<WithSymbol> {
    declare id: string;
    declare [token]: number
  }

  const entries = new WithSymbol({ id: "u_1", [token]: 42 }).entries()
  assertType<Array<["id", string] | [typeof token, number]>>(entries)
})

test("exact optional field semantics are preserved in pick()", () => {
  const picked = new User({ id: "u_1" }).pick()

  assertType<{ id: string; name?: string }>(picked)

  const valid: typeof picked = { id: "u_1" }
  void valid

  // @ts-expect-error exactOptionalPropertyTypes forbids explicit undefined here
  const invalid: typeof picked = { id: "u_1", name: undefined }
  void invalid
})

test("declared-but-not-typed keys become never in constructor props", () => {
  // @ts-expect-error name is required as never
  new MissingTypedField({ id: "u_1" })

  // @ts-expect-error name is never and cannot accept a value
  new MissingTypedField({ id: "u_1", name: "Ada" })
})

test("constructor rejects unknown keys", () => {
  // @ts-expect-error unknown key
  new User({ id: "u_1", extra: true })
})

test("subclass override narrowing works with extend()<Sub>", () => {
  const narrowed = new Narrowed({ id: 1 })
  expectTypeOf(narrowed.pick().id).toEqualTypeOf<number>()
  assertType<number>(narrowed.pick().id)
})

test("incompatible subclass override is rejected", () => {
  // @ts-expect-error boolean is not compatible with string | number
  class Incompatible extends Base.extend()<Incompatible> {
    // @ts-expect-error boolean is not compatible with inherited id
    declare id: boolean
  }

  void Base
  void Incompatible
})

test("subclass can tighten optionality and pick() reflects it", () => {
  const required = new RequiredName({ name: "Ada" })

  // @ts-expect-error name is required after override
  new RequiredName({})

  expectTypeOf(required.pick()).toEqualTypeOf<{ name: string }>()
  assertType<{ name: string }>(required.pick())
})

test("ShapeCarrier remains assignable for advanced consumers", () => {
  const user = new User({ id: "u_1" })
  assertType<ShapeCarrier<{ id: string }>>(user)
})

test("toJSON() returns declared data shape", () => {
  const user = new User({ id: "u_1" })
  const json = user.toJSON()

  assertType<{ id: string; name?: string }>(json)
})

test("omit(...keys) narrows by excluding selected keys", () => {
  const user = new User({ id: "u_1" })
  const withoutName = user.omit("name")
  const withoutAll = user.omit("id", "name")

  assertType<{ id: string }>(withoutName)
  assertType<{}>(withoutAll)

  // @ts-expect-error unknown key
  user.omit("extra")
})

test("omit(...keys) supports symbol keys in types", () => {
  const token = Symbol("token")

  class WithSymbol extends DataClass.extend(token, "id")<WithSymbol> {
    declare id: string
    declare [token]: number
  }

  const instance = new WithSymbol({ id: "u_1", [token]: 42 })
  const withoutToken = instance.omit(token)
  const onlyToken = instance.pick(token)

  assertType<{ id: string }>(withoutToken)
  assertType<{ [K in typeof token]: number }>(onlyToken)
})

test("equals() narrows unknown to this", () => {
  const user = new User({ id: "u_1" })
  const candidate: unknown = new User({ id: "u_1" })

  if (user.equals(candidate)) {
    assertType<User>(candidate)
    const id = candidate.id
    assertType<string>(id)
  } else {
    assertType<unknown>(candidate)
  }
})

test("diff() returns optional changed-key map for primitive keys", () => {
  const before = new User({ id: "u_1", name: "Ada" })
  const after = new User({ id: "u_2", name: "Ada" })
  const diff = before.diff(after)

  assertType<{
    id?: { self: string; that: string }
    name?: { self: string | undefined; that: string | undefined }
  }>(diff)
})

test("diff() nests for DataClass properties", () => {
  class Address extends DataClass.extend("city", "country")<Address> {
    declare city: string
    declare country: string
  }
  class UserWithAddress extends DataClass.extend("id", "address")<UserWithAddress> {
    declare id: string
    declare address: Address
  }

  const a = new UserWithAddress({
    id: "u_1",
    address: new Address({ city: "NYC", country: "US" }),
  })
  const b = new UserWithAddress({
    id: "u_1",
    address: new Address({ city: "SF", country: "US" }),
  })
  const diff = a.diff(b)

  assertType<{
    id?: { self: string; that: string }
    address?: {
      city?: { self: string; that: string }
      country?: { self: string; that: string }
    }
  }>(diff)
})
