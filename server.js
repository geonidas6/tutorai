const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const LESSONS_FILE = path.join(DATA_DIR, 'lessons.json');
const PREFS_FILE = path.join(DATA_DIR, 'preferences.json');

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
