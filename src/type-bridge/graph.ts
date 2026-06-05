export type TypeGraphKind = "class" | "interface" | "type" | "enum" | "function";

export interface TypeGraph {
  generatedAt: string;
  sources: TypeSource[];
  nodes: TypeGraphNode[];
}

export interface TypeSource {
  packageName: string;
  version: string;
  files: string[];
  hash: string;
}

export interface TypeGraphNode {
  name: string;
  kind: TypeGraphKind;
  packageName: string;
  exportPath: string;
  extends?: string[] | undefined;
  typeParameters?: string[] | undefined;
  constructors?: GraphFunction[] | undefined;
  methods?: GraphFunction[] | undefined;
  properties?: GraphProperty[] | undefined;
  values?: GraphEnumValue[] | undefined;
  type?: string | undefined;
  docs?: GraphDocs | undefined;
  deprecated?: string | undefined;
}

export interface GraphFunction {
  name: string;
  parameters: GraphParameter[];
  returns: string;
  typeParameters?: string[] | undefined;
  overloads?: GraphFunction[] | undefined;
  docs?: GraphDocs | undefined;
  deprecated?: string | undefined;
}

export interface GraphParameter {
  name: string;
  type: string;
  optional: boolean;
  docs?: string | undefined;
}

export interface GraphProperty {
  name: string;
  type: string;
  optional: boolean;
  readonly: boolean;
  docs?: GraphDocs | undefined;
  deprecated?: string | undefined;
}

export interface GraphEnumValue {
  name: string;
  value?: string | number | undefined;
  docs?: GraphDocs | undefined;
}

export interface GraphDocs {
  description?: string | undefined;
  params?: Record<string, string> | undefined;
  returns?: string | undefined;
  examples?: string[] | undefined;
  links?: string[] | undefined;
}

export interface YuriTypeMetadata {
  generatedAt: string;
  cacheKey: string;
  types: YuriTypeNode[];
}

export interface YuriTypeNode {
  name: string;
  kind: TypeGraphKind;
  packageName: string;
  exportPath: string;
  signature?: string | undefined;
  methods?: YuriCallable[] | undefined;
  properties?: YuriProperty[] | undefined;
  docs?: GraphDocs | undefined;
  deprecated?: string | undefined;
}

export interface YuriCallable {
  name: string;
  signature: string;
  parameters: GraphParameter[];
  returns: string;
  docs?: GraphDocs | undefined;
  deprecated?: string | undefined;
}

export interface YuriProperty {
  name: string;
  type: string;
  optional: boolean;
  readonly: boolean;
  docs?: GraphDocs | undefined;
  deprecated?: string | undefined;
}

export interface YuriEventMetadata {
  generatedAt: string;
  events: YuriEvent[];
}

export interface YuriEvent {
  name: string;
  parameters: GraphParameter[];
  requiredIntents: string[];
  docs?: GraphDocs | undefined;
}

export interface YuriBuilderMetadata {
  generatedAt: string;
  builders: YuriBuilder[];
}

export interface YuriBuilder {
  name: string;
  methods: YuriCallable[];
}

export interface YuriImportMetadata {
  generatedAt: string;
  symbols: Record<string, string>;
}

export interface YuriDocsMetadata {
  generatedAt: string;
  docs: Record<string, GraphDocs & { signature?: string | undefined; deprecated?: string | undefined }>;
}
