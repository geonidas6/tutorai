/**
 * TutorAI - Logique Frontend
 * Auteur: Antigravity
 */

class TutorApp {
    constructor() {
        this.currentView = 'lesson-view';
        this.preferences = { topics: [] };
        this.history = [];
        this.selectedTopics = []; // Sujets pour la génération en cours
        
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

        // Ajouter un sujet à la sélection via le bouton +
        document.getElementById('btn-add-topic').addEventListener('click', () => {
            this.addSelectedTopic();
        });

        // Entrée dans le champ sujet
        document.getElementById('gen-topic').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addSelectedTopic();
        });

        // Auto-Génération
        document.getElementById('btn-auto-gen').addEventListener('click', () => {
            this.handleAutoGeneration();
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

        if (this.selectedTopics.length === 0 && !topic) {
            alert("Veuillez entrer ou sélectionner au moins un sujet.");
            return;
        }

        const finalTopics = [...this.selectedTopics];
        if (topic) finalTopics.push(topic);

        // UI Loading
        btn.disabled = true;
        btn.innerText = "Génération... ⏳";
        loader.classList.remove('hidden');
        loader.innerText = `Qwen génère ${count > 1 ? count + ' leçons' : 'votre leçon'} sur "${finalTopics.join(', ')}"... 🤖`;
        header.classList.add('hidden');
        body.innerHTML = "";
        footer.classList.add('hidden');

        try {
            const resp = await fetch('/api/lesson/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ topic: finalTopics, count })
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
    async handleAutoGeneration() {
        const btn = document.getElementById('btn-auto-gen');
        const loader = document.getElementById('lesson-loader');
        const header = document.getElementById('lesson-header');
        const body = document.getElementById('lesson-body');
        const footer = document.getElementById('lesson-footer');

        btn.disabled = true;
        btn.innerText = "Recherche d'actu... 📡";
        loader.classList.remove('hidden');
        loader.innerText = "Qwen scanne les actualités mondiales du jour pour vous... 🔎";
        header.classList.add('hidden');
        body.innerHTML = "";
        footer.classList.add('hidden');

        try {
            const resp = await fetch('/api/lesson/auto-generate', { method: 'POST' });
            const data = await resp.json();

            if (data.error) {
                alert("Erreur: " + data.error);
                this.loadLesson();
                return;
            }

            alert(`Nouvelle leçon générée sur l'actualité !`);
            await this.loadHistory();
            
            loader.classList.add('hidden');
            header.classList.remove('hidden');
            footer.classList.remove('hidden');
            document.getElementById('lesson-title').innerText = this.extractTitle(data.lesson.content) || "Actualité du Jour";
            body.innerHTML = this.parseMarkdown(data.lesson.content);
            this.switchView('lesson-view');

        } catch (err) {
            console.error("Erreur auto-génération", err);
        } finally {
            btn.disabled = false;
            btn.innerText = "Auto-Génération ✨";
        }
    }

    /**
     * Charge les préférences utilisateur
     */
    async loadPreferences() {
        const resp = await fetch('/api/preferences');
        this.preferences = await resp.json();
        this.renderTopics();
        this.renderDatalist();
    }

    renderDatalist() {
        const datalist = document.getElementById('prefs-topics');
        datalist.innerHTML = this.preferences.topics
            .map(t => `<option value="${t}"></option>`)
            .join('');
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
            this.renderDatalist();
        }
    }

    addSelectedTopic() {
        const input = document.getElementById('gen-topic');
        const val = input.value.trim();
        if (val && !this.selectedTopics.includes(val)) {
            this.selectedTopics.push(val);
            input.value = "";
            this.renderSelectedTopics();
            
            // On l'ajoute aussi aux préférences si nouveau
            if (!this.preferences.topics.includes(val)) {
                this.preferences.topics.push(val);
                this.savePreferences(false); // Silencieux
                this.renderDatalist();
            }
        }
    }

    renderSelectedTopics() {
        const container = document.getElementById('selected-topics-container');
        container.innerHTML = "";
        this.selectedTopics.forEach(topic => {
            const pill = document.createElement('div');
            pill.className = 'pill';
            pill.innerHTML = `
                <span>${topic}</span>
                <span class="remove-pill">&times;</span>
            `;
            pill.querySelector('.remove-pill').onclick = () => this.removeSelectedTopic(topic);
            container.appendChild(pill);
        });
    }

    removeSelectedTopic(topic) {
        this.selectedTopics = this.selectedTopics.filter(t => t !== topic);
        this.renderSelectedTopics();
    }

    removeTopic(topic) {
        this.preferences.topics = this.preferences.topics.filter(t => t !== topic);
        this.renderTopics();
    }

    async loadHistory() {
        const resp = await fetch('/api/history');
        this.history = await resp.json();
        const list = document.getElementById('history-list');
        list.innerHTML = "";
        
        this.history.forEach((item, index) => {
            const title = this.extractTitle(item.content) || "Leçon sans titre";
            const div = document.createElement('div');
            div.className = 'history-item glass-card clickable';
            div.style.marginBottom = '10px';
            div.style.padding = '15px';
            div.innerHTML = `
                <div class="history-item-content">
                    <strong style="display: block; margin-bottom: 4px;">${title}</strong>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">
                        <span>📅 ${item.date}</span> &bull; 
                        <span>🏷️ ${item.topics.join(', ')}</span>
                    </div>
                </div>
                <div class="history-item-action">📘 Lire</div>
            `;
            div.onclick = () => this.showLessonFromHistory(index);
            list.appendChild(div);
        });
    }

    /**
     * Affiche une leçon spécifique de l'historique
     */
    showLessonFromHistory(index) {
        const lesson = this.history[index];
        if (!lesson) return;

        const body = document.getElementById('lesson-body');
        const header = document.getElementById('lesson-header');
        const footer = document.getElementById('lesson-footer');
        const loader = document.getElementById('lesson-loader');

        loader.classList.add('hidden');
        header.classList.remove('hidden');
        footer.classList.remove('hidden');

        document.getElementById('lesson-title').innerText = this.extractTitle(lesson.content) || "Archive";
        document.getElementById('lesson-date').innerText = lesson.date;
        body.innerHTML = this.parseMarkdown(lesson.content);
        
        this.switchView('lesson-view');
        
        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
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
            .replace(/\!\[(.*?)\]\((.*?)\)/gim, '<img src="$2" alt="$1" class="lesson-img" onerror="this.style.display=\'none\'">')
            .replace(/\[(.*?)\]\((.*?)\)/gim, '<a href="$2" target="_blank" class="lesson-link">$1</a>')
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
