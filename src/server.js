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
  
  app.listen(PORT, () => {
    console.log(`[AlertNet] Application Instance [${INSTANCE_ID}] live and listening on http://localhost:${PORT}`);
  });
}

bootstrap().catch(err => {
  console.error('[Fatal Bootstrap Error]', err);
});

module.exports = app;
