// A `?module` import (Nitro wasm support) yields a compiled module; the app project sees it through the typed API.
declare module '*.wasm?module' {
  const module: WebAssembly.Module;
  export default module;
}
