const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// @anthropic-ai/sdk has an import cycle (BetaToolRunner <-> resources/beta)
// that only initialises correctly from its CommonJS build. Metro picks the
// ESM build for `import`, which crashes at startup, so force the "require"
// condition for this one package.
//
// pdfjs-dist (the PDF reader) also has `require()` calls for Node-only modules inside branches
// that never run in an app. Metro would fail to resolve them, so they resolve to an empty module.
const PDFJS_NODE_ONLY = new Set(["canvas", "fs", "http", "https", "url", "zlib", "path2d-polyfill"]);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (PDFJS_NODE_ONLY.has(moduleName) && context.originModulePath.includes("/node_modules/pdfjs-dist/")) {
    return { type: "empty" };
  }
  if (moduleName === "@anthropic-ai/sdk") {
    return context.resolveRequest(
      { ...context, unstable_conditionNames: ["require", "react-native"] },
      moduleName,
      platform,
    );
  }
  return context.resolveRequest(context, moduleName, platform);
};

// expo-sqlite on web: the SQLite engine is a .wasm file, and it runs in a worker that shares
// memory (SharedArrayBuffer), which browsers only allow on cross-origin isolated pages.
config.resolver.assetExts.push("wasm");
config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  return middleware(req, res, next);
};

module.exports = config;
