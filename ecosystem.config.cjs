module.exports = {
  apps: [{
    name: 'epaper-web-v2',
    script: '.output/server/index.mjs',
    instances: 1,  // or 'max' for load balancing
    exec_mode: 'fork',  // or 'cluster' for multiple instances
    env: {
      NODE_ENV: 'production',
      PORT: 3999  // or your desired port
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
}