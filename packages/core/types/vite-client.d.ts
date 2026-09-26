// Type declarations for `*.terminal.yaml` and VHS `*.tape` imports.
//
// Add to a project's tsconfig:
//   { "compilerOptions": { "types": ["@casoon/castwright/vite/client"] } }
// or reference it from a .d.ts file in the project:
//   /// <reference types="@casoon/castwright/vite/client" />

declare module '*.terminal.yaml' {
  const demo: {
    cast: import('@casoon/castwright').Cast;
    finalFrame: string;
  };
  export const cast: import('@casoon/castwright').Cast;
  export const finalFrame: string;
  export default demo;
}

declare module '*.tape' {
  const demo: {
    cast: import('@casoon/castwright').Cast;
    finalFrame: string;
  };
  export const cast: import('@casoon/castwright').Cast;
  export const finalFrame: string;
  export default demo;
}
