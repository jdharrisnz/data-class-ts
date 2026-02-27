import { DataClass } from "../src/index.js"

export class User extends DataClass.extend("id", "name")<User> {
  declare id: string
  declare name?: string
}

export class MissingTypedField extends DataClass.extend(
  "id",
  "name",
)<MissingTypedField> {
  declare id: string
}

export class Base extends DataClass.extend("id")<Base> {
  declare id: string | number
}

export class Narrowed extends Base.extend()<Narrowed> {
  declare id: number
}

export class OptionalBase extends DataClass.extend("name")<OptionalBase> {
  declare name?: string
}

export class RequiredName extends OptionalBase.extend()<RequiredName> {
  declare name: string
}
