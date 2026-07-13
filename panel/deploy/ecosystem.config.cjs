// PM2: pm2 start deploy/ecosystem.config.cjs && pm2 save
module.exports = {
  apps: [
    {
      name: 'vps-panel-api',
      cwd: '/opt/vps-panel/backend',
      script: 'src/server.js',
      instances: 1,
      autorestart: true,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
      },
      // Las variables sensibles viven en backend/.env (las carga dotenv)
      time: true,
      out_file: '/var/log/vps-panel/out.log',
      error_file: '/var/log/vps-panel/error.log',
    },
  ],
};
