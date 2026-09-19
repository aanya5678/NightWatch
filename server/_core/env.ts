export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  nightwatchAiEnabled: process.env.NIGHTWATCH_AI_ENABLED === "true",
  awsRegion: process.env.AWS_REGION ?? "",
  nightwatchBedrockModelId: process.env.NIGHTWATCH_BEDROCK_MODEL_ID ?? "",
  nightwatchAiTimeoutMs: Number(process.env.NIGHTWATCH_AI_TIMEOUT_MS ?? "5000"),
};
