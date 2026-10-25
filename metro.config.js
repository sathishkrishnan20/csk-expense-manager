const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// @anthropic-ai/sdk has an import cycle (BetaToolRunner <-> resources/beta)
// that only initialises correctly from its CommonJS build. Metro picks the
// ESM build for `import`, which crashes at startup, so force the "require"
// condition for this one package.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "@anthropic-ai/sdk") {
    return context.resolveRequest(
      { ...context, unstable_conditionNames: ["require", "react-native"] },
      moduleName,
      platform,
    );
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
