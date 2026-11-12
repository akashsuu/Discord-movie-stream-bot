module.exports = {
  apps: [
    {
      name: "discord-stream-bot",
      script: "login.js",
      cwd: __dirname,
      interpreter: "node",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "2G",
      restart_delay: 5000,
      env: {
        NODE_ENV: "production",
        DISPLAY: process.env.DISPLAY || ":99",
        PULSE_SINK: process.env.PULSE_SINK || "Virtual_Sink",
        BROWSER_PATH: process.env.BROWSER_PATH || "/usr/bin/chromium",
        HEADLESS: "false",
      },
      error_file: "./logs/err.log",
      out_file: "./logs/out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      merge_logs: true,
    },
  ],
};
