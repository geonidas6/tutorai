const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const router = express.Router();

const QWEN_CONFIG_DIR = path.join(process.env.HOME || '/root', '.qwen');
const OAUTH_FILE = path.join(QWEN_CONFIG_DIR, 'oauth_creds.json');
const SETTINGS_FILE = path.join(QWEN_CONFIG_DIR, 'settings.json');

// Vérifier l'état de l'authentification
router.get('/status', (req, res) => {
    const hasOAuth = fs.existsSync(OAUTH_FILE);
    const hasSettings = fs.existsSync(SETTINGS_FILE);

    res.json({
        authenticated: hasOAuth || hasSettings,
        method: hasOAuth ? 'oauth' : (hasSettings ? 'apikey' : 'none')
    });
});

// Lancer le flux OAuth
router.get('/start', (req, res) => {
    console.log("[Auth] Démarrage de l'authentification Qwen...");
    const qwenProcess = spawn('qwen', ['auth', 'qwen-oauth'], { shell: false });
    let capturedUrl = '';
    let responseSent = false;

    const handleData = (data, isError = false) => {
        const output = data.toString();
        if (isError) console.log(`[Auth] Qwen stderr: ${output.slice(0, 200)}`);
        else console.log(`[Auth] Qwen stdout: ${output.slice(0, 200)}`);

        // Regex flexible pour Qwen
        const urlRegex = /(https?:\/\/[^\s]*qwen\.ai\/[^\s]+)/g;
        const match = output.match(urlRegex);

        if (match && !responseSent) {
            capturedUrl = match[0];
            responseSent = true;
            console.log(`[Auth] URL capturée: ${capturedUrl}`);
            res.json({ url: capturedUrl });
        }

        // Auto-sélection option 1 si menu
        if (output.includes('Select authentication method')) {
            qwenProcess.stdin.write('\n');
        }
    };

    qwenProcess.stdout.on('data', (data) => handleData(data, false));
    qwenProcess.stderr.on('data', (data) => handleData(data, true));

    qwenProcess.on('close', (code) => {
        if (!responseSent) {
            responseSent = true;
            console.error(`[Auth] Processus fermé prématurément (code: ${code})`);
            res.status(500).json({ error: "Le processus d'authentification s'est arrêté sans générer d'URL." });
        }
    });

    // Timeout de sécurité
    setTimeout(() => {
        if (!responseSent) {
            responseSent = true;
            qwenProcess.kill();
            console.error("[Auth] Timeout 30s dépassé");
            res.status(408).json({ error: "Délai dépassé pour obtenir l'URL OAuth." });
        }
    }, 30000);
});

// Sauvegarder une Clé API manuellement
router.post('/key', (req, res) => {
    const { apiKey } = req.body;
    if (!apiKey) return res.status(400).json({ error: "Clé manquante" });

    // Validation basique du format de clé
    if (typeof apiKey !== 'string' || apiKey.length < 10) {
        return res.status(400).json({ error: "Format de clé invalide" });
    }

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

    if (!fs.existsSync(QWEN_CONFIG_DIR)) {
        fs.mkdirSync(QWEN_CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    console.log("[Auth] Clé API sauvegardée");
    res.json({ success: true });
});

module.exports = router;
