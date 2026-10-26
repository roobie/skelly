declare module 'gltf-validator' {
  interface ValidationReport {
    readonly issues: {
      readonly numErrors: number;
      readonly numWarnings: number;
      readonly numInfos: number;
      readonly numHints: number;
      readonly messages: readonly {
        readonly code: string;
        readonly message: string;
        readonly pointer?: string;
        readonly severity: number;
      }[];
    };
  }
  const validator: {
    validateBytes: (data: Uint8Array, options?: { uri?: string; maxIssues?: number }) => Promise<ValidationReport>;
  };
  // biome-ignore lint/style/noDefaultExport: mirrors the package's CommonJS default export
  export default validator;
}
