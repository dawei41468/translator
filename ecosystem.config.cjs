// ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: "translator",
      cwd: __dirname,
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
