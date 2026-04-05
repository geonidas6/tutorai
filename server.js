const express = require('express');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const QWEN_CONFIG_DIR = path.join(process.env.HOME || '/root', '.qwen');
const LESSONS_FILE = path.join(DATA_DIR, 'lessons.json');
const PREFS_FILE = path.join(DATA_DIR, 'preferences.json');

// Session/Auth file (cached by qwen CLI)
const OAUTH_FILE = path.join(QWEN_CONFIG_DIR, 'oauth_creds.json');
const SETTINGS_FILE = path.join(QWEN_CONFIG_DIR, 'settings.json');

// Initialisation des répertoires
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(LESSONS_FILE)) fs.writeFileSync(LESSONS_FILE, JSON.stringify([]));
if (!fs.existsSync(PREFS_FILE)) fs.writeFileSync(PREFS_FILE, JSON.stringify({ topics: ['Informatique', 'IA', 'Actualités'] }));

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

/**
 * Exécute une commande Qwen via le CLI
 */
function runQwen(prompt) {
    return new Promise((resolve, reject) => {
        // Mode headless avec -p
        const command = `qwen -p "${prompt.replace(/"/g, '\\"')}"`;
        console.log(`Exécution : ${command}`);
        
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Erreur CLI : ${stderr || error.message}`);
                return reject(stderr || error.message);
            }
            resolve(stdout.trim());
        });
    });
}

// --- AUTH ROUTES ---

// Vérifier l'état de l'authentification
app.get('/api/auth/status', (req, res) => {
    // On vérifie si un fichier de session existe ou si qwen-max est configuré avec une clé
    const hasOAuth = fs.existsSync(OAUTH_FILE);
    const hasSettings = fs.existsSync(SETTINGS_FILE);
    
    res.json({ 
        authenticated: hasOAuth || hasSettings,
        method: hasOAuth ? 'oauth' : (hasSettings ? 'apikey' : 'none')
    });
});

// Lancer le flux OAuth et tenter de capturer l'URL
app.get('/api/auth/start', (req, res) => {
    // On lance 'qwen /auth'. Le CLI attend une interaction (sélection du mode)
    // On va tenter de forcer le premier choix (OAuth) en envoyant une nouvelle ligne
    const qwenProcess = spawn('qwen', ['/auth']);
    let capturedUrl = '';
    let responseSent = false;

    qwenProcess.stdout.on('data', (data) => {
        const output = data.toString();
        // Regex pour capturer une URL Qwen d'activation (ex: https://qwen.ai/auth/device?code=...)
        const urlRegex = /(https?:\/\/qwen\.ai\/auth\/[^\s]+)/g;
        const match = output.match(urlRegex);
        
        if (match && !responseSent) {
            capturedUrl = match[0];
            responseSent = true;
            res.json({ url: capturedUrl });
            // On laisse le process tourner un peu pour que l'utilisateur valide
        }

        // On envoie un "Entrée" pour choisir l'option 1 par défaut si le menu apparaît
        if (output.includes('Select authentication method')) {
            qwenProcess.stdin.write('\n');
        }
    });

    qwenProcess.stderr.on('data', (data) => {
        console.error(`CLI Auth Error: ${data}`);
    });

    // Timeout de sécurité pour la réponse
    setTimeout(() => {
        if (!responseSent) {
            responseSent = true;
            res.status(408).json({ error: "Délai dépassé pour obtenir l'URL OAuth." });
        }
    }, 10000);
});

// Sauvegarder une Clé API manuellement
app.post('/api/auth/key', (req, res) => {
    const { apiKey } = req.body;
    if (!apiKey) return res.status(400).json({ error: "Clé manquante" });

    const settings = {
        modelProviders: {
            openai: [{
                id: "qwen-max",
                name: "Qwen Max via DashScope",
                baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
                envKey: "DASHSCOPE_API_KEY"
            }]
        },
        env: { DASHSCOPE_API_KEY: apiKey },
        security: { auth: { selectedType: "openai" } },
        model: { name: "qwen-max" }
    };

    if (!fs.existsSync(QWEN_CONFIG_DIR)) fs.mkdirSync(QWEN_CONFIG_DIR, { recursive: true });
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    res.json({ success: true });
});

// --- API ROUTES ---

// Récupérer les préférences
app.get('/api/preferences', (req, res) => {
    const prefs = JSON.parse(fs.readFileSync(PREFS_FILE));
    res.json(prefs);
});

// Sauvegarder les préférences
app.post('/api/preferences', (req, res) => {
    const { topics } = req.body;
    fs.writeFileSync(PREFS_FILE, JSON.stringify({ topics }));
    res.json({ success: true });
});

// Récupérer l'historique
app.get('/api/history', (req, res) => {
    const lessons = JSON.parse(fs.readFileSync(LESSONS_FILE));
    res.json(lessons);
});

// Demander la leçon du jour
app.get('/api/lesson', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const lessons = JSON.parse(fs.readFileSync(LESSONS_FILE));
        
        // Vérifier si une leçon existe déjà pour aujourd'hui
        const existing = lessons.find(l => l.date === today);
        if (existing) {
            return res.json(existing);
        }

        // Sinon, générer avec Qwen
        const prefs = JSON.parse(fs.readFileSync(PREFS_FILE));
        const topicsStr = prefs.topics.join(', ');
        const prompt = `Agis en tant que tuteur expert. En te basant sur l'actualité de ce jour (${today}), enseigne moi quelque chose de nouveau et de fascinant sur l'un de mes sujets favoris : ${topicsStr}. 
        Format de réponse :
        # [Titre de la leçon]
        ## L'info du jour 
        [Résumé de l'actu]
        ## Ce qu'il faut retenir
        [Explications claires]
        ## Quiz rapide
        [Une question pour vérifier ma compréhension]
        
        Réponds en français uniquement. Sois concis et passionnant.`;

        const content = await runQwen(prompt);
        
        const newLesson = {
            date: today,
            content: content,
            topics: prefs.topics
        };

        lessons.unshift(newLesson);
        fs.writeFileSync(LESSONS_FILE, JSON.stringify(lessons));
        
        res.json(newLesson);
    } catch (error) {
        res.status(500).json({ error: "Erreur lors de la génération : " + error });
    }
});

app.listen(PORT, () => {
    console.log(`Serveur TutorAI démarré sur http://localhost:${PORT}`);
});
