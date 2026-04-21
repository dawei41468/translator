// ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: "translator",
      cwd: __dirname,
      // N.B. The nested path is correct: tsc preserves directory structure from the monorepo
      // root when compiling cross-package includes (packages/db/src is included via relative
      // path in tsconfig.json), so output lands at dist/apps/server/src/index.js.
      script: "./apps/server/dist/apps/server/src/index.js",
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      env: {
        PORT: 4003,
        NODE_ENV: "production",
      },
      error_file: "/var/log/pm2/translator.err.log",
      out_file: "/var/log/pm2/translator.out.log",
      time: true,
    },
  ],
};
