/**
 * A small, deterministic JSON-Schema validator over the subset MCP tools actually
 * use for their `outputSchema`. No dependency (the lean core stays lean), no LLM,
 * fully pure — given a schema and a value it returns the list of violations.
 *
 * Supported: type (incl. unions + integer), enum, const, required, properties,
 * additionalProperties (false | schema), items (single | tuple), anyOf/oneOf/allOf,
 * string min/max length + pattern, number min/max (+ exclusive), array min/maxItems.
 * Unknown keywords are ignored rather than erroring — we report real mismatches,
 * not schema-dialect nitpicks.
 */

export interface ValidationError {
  path: string;
  message: string;
}

const TYPE_CHECKS: Record<string, (v: unknown) => boolean> = {
  string: (v) => typeof v === "string",
  number: (v) => typeof v === "number" && !Number.isNaN(v),
  integer: (v) => typeof v === "number" && Number.isInteger(v),
  boolean: (v) => typeof v === "boolean",
  object: (v) => typeof v === "object" && v !== null && !Array.isArray(v),
  array: (v) => Array.isArray(v),
  null: (v) => v === null,
};

/** Validate `value` against `schema`. Returns [] when it conforms. */
export function validate(schema: unknown, value: unknown, path = "$"): ValidationError[] {
  if (schema == null || typeof schema !== "object" || Array.isArray(schema)) return [];
  const s = schema as Record<string, unknown>;
  const errors: ValidationError[] = [];

  if (Array.isArray(s.allOf)) {
    for (const sub of s.allOf) errors.push(...validate(sub, value, path));
  }
  if (Array.isArray(s.anyOf) && !s.anyOf.some((sub) => validate(sub, value, path).length === 0)) {
    errors.push({ path, message: "matches none of the anyOf schemas" });
  }
  if (Array.isArray(s.oneOf)) {
    const n = s.oneOf.filter((sub) => validate(sub, value, path).length === 0).length;
    if (n !== 1) errors.push({ path, message: `must match exactly one oneOf schema, matched ${n}` });
  }

  if (Array.isArray(s.enum) && !s.enum.some((e) => deepEqual(e, value))) {
    errors.push({ path, message: `value not in enum ${short(s.enum)}` });
  }
  if ("const" in s && !deepEqual(s.const, value)) {
    errors.push({ path, message: `must equal ${short(s.const)}` });
  }

  const types = s.type == null ? [] : Array.isArray(s.type) ? s.type : [s.type];
  if (types.length > 0) {
    const ok = types.some((t) => typeof t === "string" && TYPE_CHECKS[t]?.(value));
    if (!ok) {
      errors.push({ path, message: `expected type ${types.join("|")}, got ${typeName(value)}` });
      return errors; // a type mismatch makes the deeper constraints meaningless
    }
  }

  if (typeof value === "string") {
    if (typeof s.minLength === "number" && value.length < s.minLength) errors.push({ path, message: `shorter than minLength ${s.minLength}` });
    if (typeof s.maxLength === "number" && value.length > s.maxLength) errors.push({ path, message: `longer than maxLength ${s.maxLength}` });
    if (typeof s.pattern === "string" && !new RegExp(s.pattern).test(value)) errors.push({ path, message: `does not match pattern /${s.pattern}/` });
  }

  if (typeof value === "number") {
    if (typeof s.minimum === "number" && value < s.minimum) errors.push({ path, message: `below minimum ${s.minimum}` });
    if (typeof s.maximum === "number" && value > s.maximum) errors.push({ path, message: `above maximum ${s.maximum}` });
    if (typeof s.exclusiveMinimum === "number" && value <= s.exclusiveMinimum) errors.push({ path, message: `not above exclusiveMinimum ${s.exclusiveMinimum}` });
    if (typeof s.exclusiveMaximum === "number" && value >= s.exclusiveMaximum) errors.push({ path, message: `not below exclusiveMaximum ${s.exclusiveMaximum}` });
  }

  if (Array.isArray(value)) {
    if (typeof s.minItems === "number" && value.length < s.minItems) errors.push({ path, message: `fewer than minItems ${s.minItems}` });
    if (typeof s.maxItems === "number" && value.length > s.maxItems) errors.push({ path, message: `more than maxItems ${s.maxItems}` });
    if (s.items && typeof s.items === "object" && !Array.isArray(s.items)) {
      value.forEach((item, i) => errors.push(...validate(s.items, item, `${path}[${i}]`)));
    } else if (Array.isArray(s.items)) {
      s.items.forEach((sub, i) => {
        if (i < value.length) errors.push(...validate(sub, value[i], `${path}[${i}]`));
      });
    }
  }

  if (TYPE_CHECKS.object(value)) {
    const obj = value as Record<string, unknown>;
    const props = (s.properties && typeof s.properties === "object" ? s.properties : {}) as Record<string, unknown>;
    if (Array.isArray(s.required)) {
      for (const key of s.required) {
        if (typeof key === "string" && !(key in obj)) errors.push({ path: `${path}.${key}`, message: "required property missing" });
      }
    }
    for (const [key, sub] of Object.entries(props)) {
      if (key in obj) errors.push(...validate(sub, obj[key], `${path}.${key}`));
    }
    if (s.additionalProperties === false) {
      for (const key of Object.keys(obj)) {
        if (!(key in props)) errors.push({ path: `${path}.${key}`, message: "additional property not allowed" });
      }
    } else if (s.additionalProperties && typeof s.additionalProperties === "object") {
      for (const key of Object.keys(obj)) {
        if (!(key in props)) errors.push(...validate(s.additionalProperties, obj[key], `${path}.${key}`));
      }
    }
  }

  return errors;
}

function typeName(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v === "number" && Number.isInteger(v)) return "integer";
  return typeof v;
}

function short(v: unknown): string {
  const s = JSON.stringify(v) ?? "undefined";
  return s.length > 60 ? `${s.slice(0, 57)}...` : s;
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
