/**
 * TutorAI - Logique Frontend
 * Auteur: Antigravity
 */

class TutorApp {
    constructor() {
        this.currentView = 'lesson-view';
        this.preferences = { topics: [] };
        this.history = [];
        
        this.init();
    }

    async init() {
        this.bindEvents();
        await this.checkAuth();
        this.registerSW();
    }

    async registerSW() {
        if ('serviceWorker' in navigator) {
            try {
                await navigator.serviceWorker.register('/sw.js');
                console.log("Service Worker enregistré avec succès !");
            } catch (err) {
                console.error("Échec de l'enregistrement du Service Worker", err);
            }
        }
    }

    async checkAuth() {
        try {
            const resp = await fetch('/api/auth/status');
            const status = await resp.json();
            
            if (!status.authenticated) {
                document.getElementById('auth-overlay').classList.remove('hidden');
                return;
            }

            document.getElementById('auth-overlay').classList.add('hidden');
            await this.loadPreferences();
            await this.loadLesson();
            await this.loadHistory();
        } catch (err) {
            console.error("Erreur de vérification d'auth", err);
        }
    }

    bindEvents() {
        // Navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const targetView = e.currentTarget.dataset.view;
                this.switchView(targetView);
            });
        });

        // Connexion OAuth
        document.getElementById('btn-oauth').addEventListener('click', () => {
            this.startOAuth();
        });

        // Sauvegarde Clé API
        document.getElementById('btn-save-key').addEventListener('click', () => {
            this.saveApiKey();
        });

        // Ajouter un sujet
        document.getElementById('add-topic').addEventListener('click', () => {
            this.addTopicFromInput();
        });

        // Sauvegarder config
        document.getElementById('save-config').addEventListener('click', () => {
            this.savePreferences();
        });

        // Générer de nouveaux cours
        document.getElementById('btn-generate').addEventListener('click', () => {
            this.handleGeneration();
        });
    }

    /**
     * Change la vue active avec une animation fluide
     */
    switchView(viewId) {
        requestAnimationFrame(() => {
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            
            document.getElementById(viewId).classList.add('active');
            document.querySelector(`[data-view="${viewId}"]`).classList.add('active');
            this.currentView = viewId;
        });
    }

    /**
     * Charge la leçon du jour depuis l'API
     */
    async loadLesson() {
        const loader = document.getElementById('lesson-loader');
        const header = document.getElementById('lesson-header');
        const body = document.getElementById('lesson-body');
        const footer = document.getElementById('lesson-footer');

        loader.classList.remove('hidden');
        header.classList.add('hidden');
        body.innerHTML = "";

        try {
            const resp = await fetch('/api/lesson');
            const data = await resp.json();

            if (data.error) {
                body.innerHTML = `<p class="error">${data.error}</p>`;
                return;
            }

            // Rendu du contenu
            loader.classList.add('hidden');
            header.classList.remove('hidden');
            footer.classList.remove('hidden');
            
            document.getElementById('lesson-title').innerText = this.extractTitle(data.content) || "Leçon du Jour";
            body.innerHTML = this.parseMarkdown(data.content);
            
        } catch (err) {
            body.innerHTML = `<p class="error">Impossible de joindre le serveur. Assurez-vous que Docker est bien lancé.</p>`;
        }
    }

    async handleGeneration() {
        const topic = document.getElementById('gen-topic').value.trim();
        const count = document.getElementById('gen-count').value;
        const btn = document.getElementById('btn-generate');
        const loader = document.getElementById('lesson-loader');
        const header = document.getElementById('lesson-header');
        const body = document.getElementById('lesson-body');
        const footer = document.getElementById('lesson-footer');

        if (!topic) {
            alert("Veuillez entrer un sujet précis.");
            return;
        }

        // UI Loading
        btn.disabled = true;
        btn.innerText = "Génération... ⏳";
        loader.classList.remove('hidden');
        loader.innerText = `Qwen génère ${count > 1 ? count + ' leçons' : 'votre leçon'} sur "${topic}"... Cela peut prendre une minute. 🤖`;
        header.classList.add('hidden');
        body.innerHTML = "";
        footer.classList.add('hidden');

        try {
            const resp = await fetch('/api/lesson/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ topic, count })
            });

            const data = await resp.json();

            if (data.error) {
                alert("Erreur: " + data.error);
                this.loadLesson(); // Reload default
                return;
            }

            // Success
            alert(`${data.count} leçon(s) générée(s) avec succès !`);
            
            // On recharge tout
            await this.loadPreferences();
            await this.loadHistory();
            
            // On affiche la dernière leçon générée
            loader.classList.add('hidden');
            header.classList.remove('hidden');
            footer.classList.remove('hidden');
            document.getElementById('lesson-title').innerText = this.extractTitle(data.lastLesson.content) || "Nouvelle Leçon";
            body.innerHTML = this.parseMarkdown(data.lastLesson.content);
            this.switchView('lesson-view');

        } catch (err) {
            console.error("Erreur de génération", err);
            alert("Erreur de communication avec le serveur.");
        } finally {
            btn.disabled = false;
            btn.innerText = "Génération 🚀";
            loader.innerText = "Un instant, Qwen prépare votre leçon... 🤖";
        }
    }

    /**
     * Charge les préférences utilisateur
     */
    async loadPreferences() {
        const resp = await fetch('/api/preferences');
        this.preferences = await resp.json();
        this.renderTopics();
    }

    /**
     * Sauvegarde les préférences
     */
    async savePreferences() {
        const resp = await fetch('/api/preferences', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(this.preferences)
        });
        if (resp.ok) {
            alert("Préférences enregistrées ! La prochaine leçon sera adaptée.");
            this.loadLesson();
        }
    }

    renderTopics() {
        const grid = document.getElementById('topics-grid');
        grid.innerHTML = "";
        this.preferences.topics.forEach(topic => {
            const tag = document.createElement('span');
            tag.className = 'topic-tag active';
            tag.innerText = topic;
            tag.onclick = () => this.removeTopic(topic);
            grid.appendChild(tag);
        });
    }

    addTopicFromInput() {
        const input = document.getElementById('new-topic');
        const val = input.value.trim();
        if (val && !this.preferences.topics.includes(val)) {
            this.preferences.topics.push(val);
            input.value = "";
            this.renderTopics();
        }
    }

    removeTopic(topic) {
        this.preferences.topics = this.preferences.topics.filter(t => t !== topic);
        this.renderTopics();
    }

    async loadHistory() {
        const resp = await fetch('/api/history');
        this.history = await resp.json();
        const list = document.getElementById('history-list');
        list.innerHTML = this.history.map(item => `
            <div class="history-item glass-card" style="margin-bottom: 10px; padding: 15px;">
                <strong>${item.date}</strong><br>
                <small>${item.topics.join(', ')}</small>
            </div>
        `).join('');
    }

    /**
     * Lance le flux OAuth
     */
    async startOAuth() {
        const status = document.getElementById('auth-status');
        const linkContainer = document.getElementById('oauth-link-container');
        const link = document.getElementById('oauth-link');

        status.classList.remove('hidden');
        status.innerText = "Génération du lien d'activation... ⏳";
        linkContainer.classList.add('hidden');

        try {
            const resp = await fetch('/api/auth/start');
            const data = await resp.json();

            if (data.url) {
                status.innerText = "Lien généré ! Ouverture de la page d'autorisation... 🚀";
                link.href = data.url;
                linkContainer.classList.remove('hidden');
                
                // Ouverte automatique de l'URL dans un nouvel onglet
                window.open(data.url, '_blank');
                
                // On poll toutes les 5 secondes pour voir si l'auth est réussie
                this.pollAuthStatus();
            } else {
                status.innerText = "Échec de génération du lien. Réessayez ou utilisez une clé API.";
            }
        } catch (err) {
            status.innerText = "Erreur de communication avec le serveur.";
        }
    }

    /**
     * Sauvegarde la clé API manuellement
     */
    async saveApiKey() {
        const key = document.getElementById('api-key-input').value.trim();
        const status = document.getElementById('auth-status');
        
        if (!key) return;

        status.classList.remove('hidden');
        status.innerText = "Validation de la clé... ⏳";

        try {
            const resp = await fetch('/api/auth/key', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey: key })
            });

            if (resp.ok) {
                status.innerText = "Clé validée ! Chargement de l'application...";
                setTimeout(() => this.checkAuth(), 1500);
            } else {
                status.innerText = "Erreur lors de la sauvegarde de la clé.";
            }
        } catch (err) {
            status.innerText = "Erreur serveur.";
        }
    }

    /**
     * Vérifie périodiquement si l'utilisateur a fini l'auth OAuth
     */
    pollAuthStatus() {
        const interval = setInterval(async () => {
            const resp = await fetch('/api/auth/status');
            const status = await resp.json();
            
            if (status.authenticated) {
                clearInterval(interval);
                this.checkAuth();
            }
        }, 5000);
    }

    /**
     * Petit parser Markdown maison pour les titres et listes
     */
    parseMarkdown(md) {
        let html = md
            .replace(/^# (.*$)/gim, '<h3>$1</h3>')
            .replace(/^## (.*$)/gim, '<h4>$1</h4>')
            .replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>')
            .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
            .replace(/\n$/gim, '<br>');
        
        return html;
    }

    extractTitle(md) {
        const match = md.match(/^# (.*$)/m);
        return match ? match[1] : null;
    }
}

// Lancement de l'app une fois le DOM chargé
document.addEventListener('DOMContentLoaded', () => {
    window.app = new TutorApp();
});
