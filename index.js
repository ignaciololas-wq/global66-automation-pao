'use strict';
const { iniciar } = require('./src/slack');

iniciar().catch(err => {
  console.error('Error al iniciar el bot:', err);
  process.exit(1);
});
