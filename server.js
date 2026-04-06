require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');

// Import des routes modulaires
const authRoutes = require('./routes/auth');
const lessonRoutes = require('./routes/lessons');
const preferencesRoutes = require('./routes/preferences');

// Import du middleware rate limiting
const { createRateLimitMiddleware, strictLimiter, moderateLimiter } = require('./middleware/rate-limiter');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const LESSONS_FILE = path.join(DATA_DIR, 'lessons.json');
const PREFS_FILE = path.join(DATA_DIR, 'preferences.json');

// Initialisation des répertoires et fichiers par défaut
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(LESSONS_FILE)) fs.writeFileSync(LESSONS_FILE, JSON.stringify([]));
if (!fs.existsSync(PREFS_FILE)) fs.writeFileSync(PREFS_FILE, JSON.stringify({
    topics: ['Informatique', 'IA', 'Actualités'],
    difficulty: 'intermédiaire',
    rssFeeds: []
}));

// --- Middleware ---
app.use(cors());
app.use(express.json({ limit: '1mb' })); // Limite taille du body
app.use(express.static('public'));

// Logging structuré
app.use(morgan('combined'));

// Rate limiting général
app.use('/api/', createRateLimitMiddleware(moderateLimiter));

// --- Routes ---

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0'
    });
});

// API routes avec rate limiting strict pour la génération
app.use('/api/auth', require('./routes/auth'));
app.use('/api/lesson', (req, res, next) => {
    if (req.method === 'POST') {
        return createRateLimitMiddleware(strictLimiter)(req, res, next);
    }
    next();
}, lessonRoutes);
app.use('/api/preferences', preferencesRoutes);

// Fallback 404
app.use((req, res) => {
    res.status(404).json({ error: 'Route non trouvée' });
});

// Gestionnaire d'erreurs global
app.use((err, req, res, next) => {
    console.error('[Server] Erreur non gérée:', err.message);
    res.status(500).json({ error: 'Erreur interne du serveur' });
});

app.listen(PORT, () => {
    console.log(`🚀 TutorAI démarré sur http://localhost:${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
});

module.exports = app;
