export function legacyCompatibleEditorialInput(input) {
  return {
    ...input,
    // Keep the packet envelope at v2 until the existing Scheduled Tasks are
    // explicitly switched. Source-language metadata is an additive extension.
    schemaVersion: 2,
  };
}

export function legacyCompatibleEditorialSchema(schema) {
  const output = structuredClone(schema);
  output.required = (output.required || []).filter((key) =>
    !new Set(["contractVersion", "locales"]).has(key)
  );
  const decisionSchema = output.properties?.decisions?.items;
  if (decisionSchema) {
    decisionSchema.required = (decisionSchema.required || []).filter((key) => key !== "sharedFactFrame");
  }
  return output;
}
