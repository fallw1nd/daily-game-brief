function typeMatches(value, type) {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  return typeof value === type;
}

export function validateJsonSchema(value, schema, path = "output") {
  const errors = [];
  const types = Array.isArray(schema?.type) ? schema.type : schema?.type ? [schema.type] : [];
  if (types.length && !types.some((type) => typeMatches(value, type))) return [`${path} must be ${types.join(" or ")}`];
  if (schema?.enum && !schema.enum.some((item) => Object.is(item, value))) errors.push(`${path} must be one of the allowed values`);
  if (typeof value === "string" && schema?.pattern && !new RegExp(schema.pattern, "u").test(value)) errors.push(`${path} has an invalid format`);
  if (typeof value === "number" && Number.isFinite(schema?.minimum) && value < schema.minimum) errors.push(`${path} must be at least ${schema.minimum}`);
  if (Array.isArray(value) && schema?.items) value.forEach((item, index) => errors.push(...validateJsonSchema(item, schema.items, `${path}[${index}]`)));
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const key of schema?.required || []) if (!Object.hasOwn(value, key)) errors.push(`${path}.${key} is required`);
    const properties = schema?.properties || {};
    if (schema?.additionalProperties === false) for (const key of Object.keys(value)) if (!Object.hasOwn(properties, key)) errors.push(`${path}.${key} is not allowed`);
    for (const [key, childSchema] of Object.entries(properties)) if (Object.hasOwn(value, key)) errors.push(...validateJsonSchema(value[key], childSchema, `${path}.${key}`));
  }
  return errors;
}
