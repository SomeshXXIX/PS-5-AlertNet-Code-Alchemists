require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const apiRoutes = require('./routes/api');
const { startSOSTriageWorker } = require('./workers/sosTriageWorker');
const { startBroadcastWorkers } = require('./workers/broadcastWorkers');
const { relayOutboxEvents } = require('./services/outboxRelay');

const app = express();
const PORT = process.env.PORT || 4000;
const INSTANCE_ID = process.env.APP_INSTANCE_ID || 'instance-A';

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request Logging Middleware for Live Auditing
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (req.path.startsWith('/api') || req.path === '/health') {
      const duration = Date.now() - start;
      const clientIp = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
      console.log(`[HTTP] ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms (IP: ${clientIp})`);
    }
  });
  next();
});

// Serve frontend static assets
app.use(express.static(path.join(__dirname, '../public')));

// Mount API routes
app.use('/api', apiRoutes);

// Health route at root as well
app.get('/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    instance: INSTANCE_ID,
    timestamp: new Date().toISOString()
  });
});

// Single Page Application fallback
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Initialize Asynchronous Workers
async function bootstrap() {
  console.log(`[AlertNet] Starting backend instance: ${INSTANCE_ID} on port ${PORT}...`);
  await startSOSTriageWorker();
  await startBroadcastWorkers();
  
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[AlertNet] Application Instance [${INSTANCE_ID}] live and listening on http://0.0.0.0:${PORT}`);
  });

  // Graceful shutdown handling
  const shutdown = (signal) => {
    console.log(`\n[AlertNet] Received ${signal}. Closing HTTP server gracefully...`);
    server.close(() => {
      console.log('[AlertNet] HTTP server closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch(err => {
  console.error('[Fatal Bootstrap Error]', err);
});

module.exports = app;
