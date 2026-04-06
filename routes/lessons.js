const express = require('express');
const fs = require('fs');
const path = require('path');
const Parser = require('rss-parser');
const NodeCache = require('node-cache');
const { runQwen } = require('../utils/qwen-runner');

const router = express.Router();
const parser = new Parser();

// Cache pour les flux RSS (5 minutes)
const rssCache = new NodeCache({ stdTTL: 300 });

const DATA_DIR = path.join(__dirname, '..', 'data');
const LESSONS_FILE = path.join(DATA_DIR, 'lessons.json');

// Flux RSS par défaut (peuvent être surchargés par .env)
const DEFAULT_RSS_FEEDS = [
    'https://www.lemonde.fr/rss/une.xml',
    'https://www.france24.com/fr/rss',
    'https://news.google.com/rss?hl=fr&gl=FR&ceid=FR:fr'
];

function getRssFeeds() {
    const envFeeds = process.env.RSS_FEEDS;
    if (envFeeds) {
        try {
            return JSON.parse(envFeeds);
        } catch {
            // Si le parse échoue, utiliser les feeds par défaut
        }
    }
    return DEFAULT_RSS_FEEDS;
}

// Récupérer la leçon du jour (ou la générer)
router.get('/', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const lessons = JSON.parse(fs.readFileSync(LESSONS_FILE));

        // Vérifier si une leçon existe déjà pour aujourd'hui
        const existing = lessons.find(l => l.date === today);
        if (existing) {
            return res.json(existing);
        }

        // Sinon, générer avec Qwen
        const prefsFile = path.join(DATA_DIR, 'preferences.json');
        const prefs = fs.existsSync(prefsFile)
            ? JSON.parse(fs.readFileSync(prefsFile))
            : { topics: ['Informatique', 'IA', 'Actualités'] };

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
            topics: prefs.topics,
            difficulty: prefs.difficulty || 'intermédiaire'
        };

        lessons.unshift(newLesson);
        fs.writeFileSync(LESSONS_FILE, JSON.stringify(lessons, null, 2));

        res.json(newLesson);
    } catch (error) {
        console.error('[Lessons] Erreur génération:', error.message);
        res.status(500).json({ error: "Erreur lors de la génération : " + error.message });
    }
});

// Générer de nouvelles leçons personnalisées
router.post('/generate', async (req, res) => {
    try {
        const { topic, count, difficulty } = req.body;
        const numLessons = Math.min(parseInt(count) || 1, 5); // Max 5
        const lessons = JSON.parse(fs.readFileSync(LESSONS_FILE));
        const today = new Date().toISOString().split('T')[0];
        const safeDifficulty = difficulty || 'intermédiaire';

        // Validation du sujet
        if (!topic || (Array.isArray(topic) && topic.length === 0)) {
            return res.status(400).json({ error: "Sujet requis" });
        }

        const generatedLessons = [];

        for (let i = 0; i < numLessons; i++) {
            console.log(`[Lessons] Génération ${i + 1}/${numLessons} sur: ${topic}`);

            const prompt = `Agis en tant que tuteur expert. Enseigne moi quelque chose de nouveau et de fascinant sur ces sujets spécifiques : ${Array.isArray(topic) ? topic.join(', ') : topic}.
Niveau de difficulté : ${safeDifficulty}
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
                topics: Array.isArray(topic) ? topic : [topic],
                difficulty: safeDifficulty,
                custom: true,
                favorite: false
            };

            generatedLessons.push(newLesson);
            lessons.unshift(newLesson);
        }

        fs.writeFileSync(LESSONS_FILE, JSON.stringify(lessons, null, 2));
        res.json({ success: true, count: numLessons, lastLesson: generatedLessons[0] });
    } catch (error) {
        console.error('[Lessons] Erreur génération personnalisée:', error.message);
        res.status(500).json({ error: "Erreur lors de la génération : " + error.message });
    }
});

// Auto-Générer une leçon basée sur l'actualité (RSS)
router.post('/auto-generate', async (req, res) => {
    try {
        const lessons = JSON.parse(fs.readFileSync(LESSONS_FILE));
        const today = new Date().toISOString().split('T')[0];

        console.log("[Lessons] Auto-Génération via Flux RSS...");

        // 1. Récupérer une news via RSS (avec cache)
        const feeds = getRssFeeds();
        const feedUrl = feeds[Math.floor(Math.random() * feeds.length)];

        let item;
        const cachedItem = rssCache.get('rss_item');

        if (cachedItem) {
            item = cachedItem;
            console.log('[Lessons] News depuis le cache RSS');
        } else {
            const feed = await parser.parseURL(feedUrl);
            item = feed.items[0];
            if (!item) throw new Error("Impossible de récupérer un flux RSS valide.");
            rssCache.set('rss_item', item);
            console.log(`[Lessons] News source: ${item.title}`);
        }

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
            auto: true,
            favorite: false
        };

        lessons.unshift(newLesson);
        fs.writeFileSync(LESSONS_FILE, JSON.stringify(lessons, null, 2));

        res.json({ success: true, lesson: newLesson });
    } catch (error) {
        console.error('[Lessons] Erreur auto-génération RSS:', error.message);
        res.status(500).json({ error: "Erreur lors de l'auto-génération RSS : " + error.message });
    }
});

// Récupérer l'historique avec recherche/filtre
router.get('/history', (req, res) => {
    try {
        const lessons = JSON.parse(fs.readFileSync(LESSONS_FILE));
        const { search, topic, favorite } = req.query;

        let filtered = lessons;

        // Filtre par sujet
        if (topic) {
            filtered = filtered.filter(l =>
                l.topics && l.topics.some(t => t.toLowerCase().includes(topic.toLowerCase()))
            );
        }

        // Filtre favoris
        if (favorite === 'true') {
            filtered = filtered.filter(l => l.favorite === true);
        }

        // Recherche par texte
        if (search) {
            const searchLower = search.toLowerCase();
            filtered = filtered.filter(l =>
                l.content.toLowerCase().includes(searchLower) ||
                (l.topics && l.topics.some(t => t.toLowerCase().includes(searchLower)))
            );
        }

        res.json(filtered);
    } catch (error) {
        res.status(500).json({ error: "Erreur de lecture de l'historique" });
    }
});

// Supprimer une leçon
router.delete('/history/:index', (req, res) => {
    try {
        const index = parseInt(req.params.index);
        const lessons = JSON.parse(fs.readFileSync(LESSONS_FILE));

        if (index >= 0 && index < lessons.length) {
            lessons.splice(index, 1);
            fs.writeFileSync(LESSONS_FILE, JSON.stringify(lessons, null, 2));
            res.json({ success: true });
        } else {
            res.status(404).json({ error: "Leçon non trouvée" });
        }
    } catch (error) {
        res.status(500).json({ error: "Erreur de suppression" });
    }
});

// Basculer une leçon en favori
router.patch('/history/:index/favorite', (req, res) => {
    try {
        const index = parseInt(req.params.index);
        const lessons = JSON.parse(fs.readFileSync(LESSONS_FILE));

        if (index >= 0 && index < lessons.length) {
            lessons[index].favorite = !lessons[index].favorite;
            fs.writeFileSync(LESSONS_FILE, JSON.stringify(lessons, null, 2));
            res.json({ success: true, favorite: lessons[index].favorite });
        } else {
            res.status(404).json({ error: "Leçon non trouvée" });
        }
    } catch (error) {
        res.status(500).json({ error: "Erreur lors du marquage favori" });
    }
});

// Récupérer le streak (jours consécutifs)
router.get('/streak', (req, res) => {
    try {
        const lessons = JSON.parse(fs.readFileSync(LESSONS_FILE));
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let streak = 0;
        let currentDate = new Date(today);

        // Vérifier s'il y a une leçon aujourd'hui
        const todayStr = today.toISOString().split('T')[0];
        const hasTodayLesson = lessons.some(l => l.date === todayStr);

        if (!hasTodayLesson) {
            // Pas de leçon aujourd'hui, le streak est cassé
            return res.json({ streak: 0 });
        }

        // Compter les jours consécutifs en arrière
        while (true) {
            const dateStr = currentDate.toISOString().split('T')[0];
            const hasLesson = lessons.some(l => l.date === dateStr);

            if (hasLesson) {
                streak++;
                currentDate.setDate(currentDate.getDate() - 1);
            } else {
                break;
            }
        }

        res.json({ streak });
    } catch (error) {
        res.status(500).json({ error: "Erreur de calcul du streak" });
    }
});

module.exports = router;
