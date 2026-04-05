const express = require('express');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const Parser = require('rss-parser');

const app = express();
const parser = new Parser();
const RSS_FEEDS = [
    'https://www.lemonde.fr/rss/une.xml',
    'https://www.france24.com/fr/rss',
    'https://news.google.com/rss?hl=fr&gl=FR&ceid=FR:fr',
    'https://wired.com/feed/rss'
];
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
    // Correction : Utilisation du type exact 'qwen-oauth' et de la commande 'auth'
    console.log("Démarrage de l'authentification Qwen...");
    const qwenProcess = spawn('qwen', ['auth', 'qwen-oauth']);
    let capturedUrl = '';
    let responseSent = false;

    const handleData = (data, isError = false) => {
        const output = data.toString();
        // Loggez tout pour voir ce qui arrive (utile pour le débug via docker logs)
        if (isError) console.log(`Qwen CLI Error Out: ${output}`);
        else console.log(`Qwen CLI Out: ${output}`);
        
        // Regex plus flexible pour Qwen (chat.qwen.ai ou qwen.ai)
        const urlRegex = /(https?:\/\/[^\s]*qwen\.ai\/[^\s]+)/g;
        const match = output.match(urlRegex);
        
        if (match && !responseSent) {
            capturedUrl = match[0];
            responseSent = true;
            console.log(`URL d'authentification capturée via ${isError ? 'stderr' : 'stdout'} : ${capturedUrl}`);
            res.json({ url: capturedUrl });
        }

        // On envoie un "Entrée" pour choisir l'option 1 par défaut si le menu apparaît (fallback)
        if (output.includes('Select authentication method')) {
            qwenProcess.stdin.write('\n');
        }
    };

    qwenProcess.stdout.on('data', (data) => handleData(data, false));
    qwenProcess.stderr.on('data', (data) => handleData(data, true));

    // Détection de la fin prématurée du processus
    qwenProcess.on('close', (code) => {
        if (!responseSent) {
            responseSent = true;
            console.error(`Le processus Qwen s'est arrêté prématurément (Code: ${code})`);
            res.status(500).json({ error: "Le processus d'authentification s'est arrêté sans générer d'URL." });
        }
    });

    // Timeout de sécurité pour la réponse
    setTimeout(() => {
        if (!responseSent) {
            responseSent = true;
            qwenProcess.kill();
            console.error("Timeout de 30s atteint pour l'obtention de l'URL.");
            res.status(408).json({ error: "Délai dépassé pour obtenir l'URL OAuth." });
        }
    }, 30000); // Maintenu à 30s par sécurité
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

// Générer de nouvelles leçons personnalisées
app.post('/api/lesson/generate', async (req, res) => {
    try {
        const { topic, count } = req.body;
        const numLessons = parseInt(count) || 1;
        const lessons = JSON.parse(fs.readFileSync(LESSONS_FILE));
        const today = new Date().toISOString().split('T')[0];

        const generatedLessons = [];

        for (let i = 0; i < numLessons; i++) {
            console.log(`Génération de la leçon ${i + 1}/${numLessons} sur le sujet : ${topic}`);
            
            const prompt = `Agis en tant que tuteur expert. Enseigne moi quelque chose de nouveau et de fascinant sur ces sujets spécifiques : ${Array.isArray(topic) ? topic.join(', ') : topic}. 
            Format de réponse impératif :
            # [Titre de la leçon]
            
            ![Image illustrative](https://source.unsplash.com/featured/?${encodeURIComponent(Array.isArray(topic) ? topic[0] : topic)})

            ## Introduction 
            [Présentation du concept]
            
            ## Ce qu'il faut retenir
            [Explications claires en plusieurs points]
            
            ## Anecdote fascinante
            [Un fait peu connu pour briller en société]

            ---
            **Source :** [En savoir plus sur Wikipédia](https://fr.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(Array.isArray(topic) ? topic[0] : topic)})
            
            Réponds en français uniquement. Sois concis, structuré et passionnant.`;

            const content = await runQwen(prompt);
            
            const newLesson = {
                date: today,
                content: content,
                topics: [topic],
                custom: true
            };
            
            generatedLessons.push(newLesson);
            lessons.unshift(newLesson);
        }

        fs.writeFileSync(LESSONS_FILE, JSON.stringify(lessons, null, 2));
        res.json({ success: true, count: numLessons, lastLesson: generatedLessons[0] });
    } catch (error) {
        console.error("Erreur génération personnalisée:", error);
        res.status(500).json({ error: "Erreur lors de la génération : " + error });
    }
});

// Auto-Générer une leçon basée sur l'actualité du moment (via RSS)
app.post('/api/lesson/auto-generate', async (req, res) => {
    try {
        const lessons = JSON.parse(fs.readFileSync(LESSONS_FILE));
        const today = new Date().toISOString().split('T')[0];
        
        console.log("Auto-Génération via Flux RSS...");

        // 1. Récupérer une news réelle depuis les flux
        const feedUrl = RSS_FEEDS[Math.floor(Math.random() * RSS_FEEDS.length)];
        const feed = await parser.parseURL(feedUrl);
        const item = feed.items[0]; // On prend le dernier item (le plus frais)
        
        if (!item) throw new Error("Impossible de récupérer un flux RSS valide.");

        console.log(`News source : ${item.title}`);

        const prompt = `Agis en tant que tuteur expert et journaliste. 
        En te basant sur cette actualité réelle et récente ISSUE D'UN FLUX RSS :
        TITRE : ${item.title}
        DESCRIPTION : ${item.contentSnippet || item.content || 'Pas de description'}
        LIEN SOURCE : ${item.link}

        1. Analyse cette information et génère une leçon passionnante dessus.
        2. Format de réponse impératif :
        # [Titre de l'Actualité Marquante]
        
        ![Image de l'actualité](https://source.unsplash.com/featured/?${encodeURIComponent(item.title)})

        ## L'info du moment
        [Explique ce qui se passe et pourquoi c'est important]
        
        ## Ce qu'il faut comprendre
        [Détaille les concepts clés derrière cette news]
        
        ## Pourquoi ça change tout
        [L'impact futur de cette découverte ou cet événement]
        
        ---
        **Source :** [Lire l'article complet](${item.link})

        Réponds en français uniquement. Sois captivant et informatif.`;

        const content = await runQwen(prompt);
        
        const newLesson = {
            date: today,
            content: content,
            topics: ['Actualités', 'RSS'],
            sourceLink: item.link,
            custom: true,
            auto: true
        };
        
        lessons.unshift(newLesson);
        fs.writeFileSync(LESSONS_FILE, JSON.stringify(lessons, null, 2));
        
        res.json({ success: true, lesson: newLesson });
    } catch (error) {
        console.error("Erreur auto-génération RSS:", error);
        res.status(500).json({ error: "Erreur lors de l'auto-génération RSS : " + error.message });
    }
});

// Demander la leçon du jour (fallback automatique)
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
