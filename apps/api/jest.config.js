/**
 * Unit tests (test/unit) load only pure modules and run as is.
 * The API integration suite (test/*.integration.spec.ts) loads NestJS 12, which
 * ships ES modules; run it with Node's VM modules flag and Firebase credentials (GOOGLE_APPLICATION_CREDENTIALS or gcloud ADC):
 *   NODE_OPTIONS=--experimental-vm-modules pnpm --filter @neighborhood/api test:api
 * @type {import('jest').Config}
 */
module.exports = {
  // Firebase Admin keeps sockets open after the tests finish.
  forceExit: true,
  testEnvironment: "node",
  roots: ["<rootDir>/test"],
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: {
          module: "CommonJS",
          moduleResolution: "Node",
          target: "ES2022",
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          esModuleInterop: true,
          types: ["node", "jest"],
        },
      },
    ],
  },
  testRegex: ".*\\.spec\\.ts$",
  testPathIgnorePatterns: ["/node_modules/"],
  moduleFileExtensions: ["ts", "js", "json"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
};
