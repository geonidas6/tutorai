const { spawn } = require('child_process');

/**
 * Caractères autorisés dans les prompts (whitelist stricte)
 * Permet : lettres, chiffres, espaces, ponctuation courante, accents français
 */
const ALLOWED_CHARS_REGEX = /^[a-zA-Z0-9À-ÿ\s\-_.,;:!?'()\/@#&+=%€$*\n\r\t[\]{}<>|\\]+$/;

/**
 * Nettoyage d'input utilisateur — supprime tout caractère potentiellement dangereux
 */
function sanitizeInput(input, maxLength = 2000) {
    if (typeof input !== 'string') {
        throw new Error('Input doit être une chaîne de caractères');
    }

    // Tronquer si trop long
    let cleaned = input.slice(0, maxLength);

    // Supprimer les caractères shell dangereux : $ ` " ' \ ; | & < > ( ) { }
    // On ne garde que les caractères alphanumériques + ponctuation safe
    cleaned = cleaned.replace(/[;|&$`\\<>{}()!]/g, '');

    // Vérifier la whitelist globale
    if (!ALLOWED_CHARS_REGEX.test(cleaned) && cleaned.length > 0) {
        // Fallback : ne garder que les caractères safe un par un
        cleaned = cleaned.replace(/[^a-zA-Z0-9À-ÿ\s\-_.,;:!?'()\/@#&+=%€$*\n\r\t[\]{}<>|\\]/g, '');
    }

    return cleaned.trim();
}

/**
 * Exécute une commande Qwen via le CLI de manière sécurisée
 * Utilise spawn au lieu de exec pour éviter l'injection shell
 * @param {string} prompt - Le prompt à envoyer à Qwen
 * @param {object} options - Options (timeout, maxBuffer)
 * @returns {Promise<string>}
 */
function runQwen(prompt, options = {}) {
    return new Promise((resolve, reject) => {
        const {
            timeout = 120000, // 2 minutes max par défaut
            model = 'qwen-max'
        } = options;

        // Sanitiser le prompt
        const safePrompt = sanitizeInput(prompt);

        if (!safePrompt) {
            return reject(new Error('Prompt vide ou invalide après sanitisation'));
        }

        console.log(`[Qwen] Exécution avec modèle: ${model} (timeout: ${timeout}ms)`);

        // Utiliser spawn avec -p pour le mode prompt
        // On passe le prompt via stdin plutôt qu'en argument de ligne de commande
        const qwenProcess = spawn('qwen', ['-p', safePrompt], {
            timeout,
            shell: false, // JAMAIS de shell pour éviter les injections
            env: { ...process.env, FORCE_COLOR: '0' } // Désactiver les couleurs dans la sortie
        });

        let stdout = '';
        let stderr = '';
        let timedOut = false;

        // Timeout de sécurité
        const timeoutId = setTimeout(() => {
            timedOut = true;
            qwenProcess.kill('SIGTERM');
            reject(new Error(`Qwen a dépassé le timeout de ${timeout}ms`));
        }, timeout);

        qwenProcess.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        qwenProcess.stderr.on('data', (data) => {
            const chunk = data.toString();
            stderr += chunk;
            // Log les warnings mais ne pas échouer uniquement pour stderr
            if (chunk.toLowerCase().includes('error')) {
                console.warn(`[Qwen] Stderr warning: ${chunk.trim().slice(0, 200)}`);
            }
        });

        qwenProcess.on('close', (code) => {
            clearTimeout(timeoutId);

            if (timedOut) return; // Déjà rejeté par le timeout

            if (code !== 0) {
                const errorMsg = stderr || `Processus Qwen terminé avec le code ${code}`;
                console.error(`[Qwen] Erreur (code ${code}): ${errorMsg.slice(0, 500)}`);
                return reject(new Error(`Qwen CLI error: ${errorMsg.slice(0, 200)}`));
            }

            const result = stdout.trim();
            if (!result) {
                return reject(new Error('Qwen n\'a retourné aucune réponse'));
            }

            console.log(`[Qwen] Réponse reçue (${result.length} caractères)`);
            resolve(result);
        });

        qwenProcess.on('error', (err) => {
            clearTimeout(timeoutId);
            if (err.code === 'ENOENT') {
                reject(new Error('CLI Qwen non installé. Exécutez: npm install -g @qwen-code/qwen-code'));
            } else {
                reject(new Error(`Erreur processus Qwen: ${err.message}`));
            }
        });
    });
}

module.exports = { runQwen, sanitizeInput };
