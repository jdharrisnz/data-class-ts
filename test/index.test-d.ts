import { assertType, expectTypeOf, test } from "vitest"

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
