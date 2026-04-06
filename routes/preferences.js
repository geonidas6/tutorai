const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

const DATA_DIR = path.join(__dirname, '..', 'data');
const PREFS_FILE = path.join(DATA_DIR, 'preferences.json');

// Récupérer les préférences
router.get('/', (req, res) => {
    try {
        const prefs = JSON.parse(fs.readFileSync(PREFS_FILE));
        res.json(prefs);
    } catch (error) {
        // Retourner des valeurs par défaut si le fichier n'existe pas
        res.json({ topics: ['Informatique', 'IA', 'Actualités'], difficulty: 'intermédiaire', rssFeeds: [] });
    }
});

// Sauvegarder les préférences
router.post('/', (req, res) => {
    try {
        const { topics, difficulty, rssFeeds } = req.body;

        const prefs = {
            topics: Array.isArray(topics) ? topics : [],
            difficulty: difficulty || 'intermédiaire',
            rssFeeds: Array.isArray(rssFeeds) ? rssFeeds : []
        };

        fs.writeFileSync(PREFS_FILE, JSON.stringify(prefs, null, 2));
        res.json({ success: true, preferences: prefs });
    } catch (error) {
        res.status(500).json({ error: "Erreur de sauvegarde des préférences" });
    }
});

// Ajouter un flux RSS personnalisé
router.post('/rss-feed', (req, res) => {
    try {
        const { url } = req.body;
        if (!url || typeof url !== 'string') {
            return res.status(400).json({ error: "URL du flux requise" });
        }

        // Validation basique d'URL
        try {
            new URL(url);
        } catch {
            return res.status(400).json({ error: "URL invalide" });
        }

        const prefs = JSON.parse(fs.readFileSync(PREFS_FILE));
        if (!prefs.rssFeeds) prefs.rssFeeds = [];

        if (prefs.rssFeeds.includes(url)) {
            return res.status(400).json({ error: "Ce flux existe déjà" });
        }

        prefs.rssFeeds.push(url);
        fs.writeFileSync(PREFS_FILE, JSON.stringify(prefs, null, 2));
        res.json({ success: true, rssFeeds: prefs.rssFeeds });
    } catch (error) {
        res.status(500).json({ error: "Erreur d'ajout du flux RSS" });
    }
});

// Supprimer un flux RSS personnalisé
router.delete('/rss-feed', (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: "URL requise" });

        const prefs = JSON.parse(fs.readFileSync(PREFS_FILE));
        if (prefs.rssFeeds) {
            prefs.rssFeeds = prefs.rssFeeds.filter(f => f !== url);
            fs.writeFileSync(PREFS_FILE, JSON.stringify(prefs, null, 2));
        }
        res.json({ success: true, rssFeeds: prefs.rssFeeds || [] });
    } catch (error) {
        res.status(500).json({ error: "Erreur de suppression du flux RSS" });
    }
});

module.exports = router;
