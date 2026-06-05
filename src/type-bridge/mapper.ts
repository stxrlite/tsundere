import type { GraphFunction, GraphProperty, TypeGraph, YuriCallable, YuriTypeMetadata, YuriTypeNode } from "./graph.js";

const primitiveMap = new Map<string, string>([
  ["string", "String"],
  ["number", "Number"],
  ["boolean", "Boolean"],
  ["void", "Void"],
  ["null", "Null"],
  ["undefined", "Undefined"],
  ["unknown", "Unknown"],
  ["any", "Any"]
]);

export function mapGraphToYuriTypes(graph: TypeGraph, cacheKey: string): YuriTypeMetadata {
  return {
    generatedAt: new Date().toISOString(),
    cacheKey,
    types: graph.nodes.map((node): YuriTypeNode => ({
      name: node.name,
      kind: node.kind,
      packageName: node.packageName,
      exportPath: node.exportPath,
      signature: node.type ? mapType(node.type) : undefined,
      methods: node.methods?.map(mapCallable),
      properties: node.properties?.map(mapProperty),
      docs: node.docs,
      deprecated: node.deprecated
    }))
  };
}

export function mapCallable(fn: GraphFunction): YuriCallable {
  const parameters = fn.parameters.map((param) => ({
    ...param,
    type: mapType(param.type)
  }));
  const returns = mapType(fn.returns);
  return {
    name: fn.name,
    parameters,
    returns,
    signature: `${fn.name}(${parameters.map((param) => `${param.name}${param.optional ? "?" : ""}: ${param.type}`).join(", ")}) -> ${returns}`,
    docs: fn.docs,
    deprecated: fn.deprecated
  };
}

export function mapProperty(property: GraphProperty): GraphProperty {
  return {
    ...property,
    type: mapType(property.type)
  };
}

export function mapType(type: string): string {
  let mapped = type.trim();
  mapped = mapped.replace(/\breadonly\s+(.+?)\[\]/gu, "ReadonlyList<$1>");
  mapped = mapped.replace(/\bArray<([^<>]+)>/gu, "List<$1>");
  mapped = mapped.replace(/\bReadonlyArray<([^<>]+)>/gu, "ReadonlyList<$1>");
  mapped = mapped.replace(/\bRecord<\s*([^,]+)\s*,\s*([^>]+)>/gu, "Map<$1, $2>");
  mapped = mapped.replace(/\bkeyof\s+([A-Za-z_$][\w$]*)/gu, "KeyOf<$1>");
  mapped = mapped.replace(/\btypeof\s+([A-Za-z_$][\w$]*)/gu, "TypeOf<$1>");
  mapped = mapped.replace(/([A-Za-z_$][\w$]*)\[\]/gu, "List<$1>");
  for (const [from, to] of primitiveMap) {
    mapped = mapped.replace(new RegExp(`\\b${from}\\b`, "gu"), to);
  }
  return mapped;
}
