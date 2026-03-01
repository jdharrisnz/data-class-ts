import { DataClass } from "../src/index.js"

export class User extends DataClass.extend("id", "name")<{
  id: string
  name?: string
}> {}

export class MissingTypedField extends DataClass.extend("id", "name")<{
  id: string
}> {}

export class Base extends DataClass.extend("id")<{ id: string | number }> {}

export class Narrowed extends Base.extend()<{ id: number }> {}

export class OptionalBase extends DataClass.extend("name")<{ name?: string }> {}

export class RequiredName extends OptionalBase.extend()<{ name: string }> {}
