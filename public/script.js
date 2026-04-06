/**
 * TutorAI - Logique Frontend v3.0
 * Features: Markdown (marked), Theme Toggle, Streak, Favorites,
 *           Search, Quiz, Difficulty, RSS, Export, Notifications
 */

import { marked } from 'https://cdn.jsdelivr.net/npm/marked@15/lib/marked.esm.js';

class TutorApp {
    constructor() {
        this.currentView = 'lesson-view';
        this.preferences = { topics: [], difficulty: 'intermédiaire', rssFeeds: [] };
        this.history = [];
        this.selectedTopics = [];
        this.currentDifficulty = 'intermédiaire';
        this.currentLessonIndex = null;
        this.currentFilter = 'all';
        this.currentLessonContent = '';
        this.isDarkTheme = true;

        this.init();
        console.log("TutorAI v3.0 - Toutes les améliorations activées");
    }

    async init() {
        this.bindEvents();
        this.loadThemePreference();
        await this.checkAuth();
        this.registerSW();
    }

    async registerSW() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('/sw.js?v=3');
                registration.update();
                console.log("Service Worker enregistré (v3) !");
            } catch (err) {
                console.error("Échec de l'enregistrement du Service Worker", err);
            }
        }
    }

    // ==================== AUTH ====================

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
            await this.loadStreak();
            await this.loadLesson();
        } catch (err) {
            console.error("Erreur de vérification d'auth", err);
        }
    }

    // ==================== EVENTS ====================

    bindEvents() {
        // Navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const targetView = e.currentTarget.dataset.view;
                this.switchView(targetView);
            });
        });

        // Theme Toggle
        document.getElementById('theme-toggle').addEventListener('click', () => {
            this.toggleTheme();
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

        // Difficulty selector in lesson view
        document.querySelectorAll('#lesson-view .diff-option').forEach(el => {
            el.addEventListener('click', () => {
                document.querySelectorAll('#lesson-view .diff-option').forEach(d => d.classList.remove('selected'));
                el.classList.add('selected');
                this.currentDifficulty = el.dataset.diff;
            });
        });

        // Difficulty selector in settings
        document.querySelectorAll('#settings-difficulty .diff-option').forEach(el => {
            el.addEventListener('click', () => {
                document.querySelectorAll('#settings-difficulty .diff-option').forEach(d => d.classList.remove('selected'));
                el.classList.add('selected');
                this.preferences.difficulty = el.dataset.diff;
            });
        });

        // Ajouter un sujet à la sélection
        document.getElementById('btn-add-topic').addEventListener('click', () => {
            this.addSelectedTopic();
        });

        document.getElementById('gen-topic').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addSelectedTopic();
        });

        // Auto-Génération
        document.getElementById('btn-auto-gen').addEventListener('click', () => {
            this.handleAutoGeneration();
        });

        // Générer
        document.getElementById('btn-generate').addEventListener('click', () => {
            this.handleGeneration();
        });

        // Favori toggle
        document.getElementById('fav-toggle').addEventListener('click', () => {
            this.toggleFavorite();
        });

        // Export
        document.getElementById('export-lesson').addEventListener('click', () => {
            this.exportLesson();
        });

        // RSS Feed
        document.getElementById('add-rss-feed').addEventListener('click', () => {
            this.addRssFeed();
        });

        document.getElementById('new-rss-feed').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addRssFeed();
        });

        // History search
        document.getElementById('history-search').addEventListener('input', (e) => {
            this.loadHistory(e.target.value);
        });

        // History filters
        document.querySelectorAll('#history-filters .filter-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                document.querySelectorAll('#history-filters .filter-pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                this.currentFilter = pill.dataset.filter;
                const search = document.getElementById('history-search').value;
                this.loadHistory(search);
            });
        });
    }

    // ==================== THEME ====================

    loadThemePreference() {
        const saved = localStorage.getItem('tutorai-theme');
        if (saved === 'light') {
            this.isDarkTheme = false;
            document.body.classList.remove('dark-theme');
            document.getElementById('theme-toggle').textContent = '☀️';
        }
    }

    toggleTheme() {
        this.isDarkTheme = !this.isDarkTheme;
        const btn = document.getElementById('theme-toggle');

        if (this.isDarkTheme) {
            document.body.classList.add('dark-theme');
            btn.textContent = '🌙';
            localStorage.setItem('tutorai-theme', 'dark');
        } else {
            document.body.classList.remove('dark-theme');
            btn.textContent = '☀️';
            localStorage.setItem('tutorai-theme', 'light');
        }
    }

    // ==================== NAVIGATION ====================

    switchView(viewId) {
        requestAnimationFrame(() => {
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

            document.getElementById(viewId).classList.add('active');
            document.querySelector(`[data-view="${viewId}"]`).classList.add('active');
            this.currentView = viewId;

            if (viewId === 'history-view') {
                this.loadHistory();
            }
        });
    }

    // ==================== LESSONS ====================

    async loadLesson() {
        const loader = document.getElementById('lesson-loader');
        const header = document.getElementById('lesson-header');
        const body = document.getElementById('lesson-body');
        const footer = document.getElementById('lesson-footer');
        const quizSection = document.getElementById('quiz-section');

        loader.classList.remove('hidden');
        header.classList.add('hidden');
        body.innerHTML = "";
        footer.classList.add('hidden');
        quizSection.classList.add('hidden');

        try {
            const resp = await fetch('/api/lesson');
            const data = await resp.json();

            if (data.error) {
                body.innerHTML = `<p class="error">${data.error}</p>`;
                return;
            }

            loader.classList.add('hidden');
            header.classList.remove('hidden');
            footer.classList.remove('hidden');

            document.getElementById('lesson-title').innerText = this.extractTitle(data.content) || "Leçon du Jour";

            // Afficher la difficulté
            const diffBadge = document.getElementById('lesson-difficulty');
            if (data.difficulty) {
                diffBadge.textContent = data.difficulty;
                diffBadge.className = `difficulty-badge ${data.difficulty}`;
                diffBadge.style.display = 'inline-block';
            } else {
                diffBadge.style.display = 'none';
            }

            // Mettre à jour le bouton favori
            this.currentLessonIndex = 0; // La leçon du jour est toujours en position 0
            this.updateFavButton(data.favorite || false);

            // Rendu Markdown avec marked
            body.innerHTML = marked.parse(data.content);
            this.currentLessonContent = data.content;

            // Extraire et afficher le quiz
            this.extractAndShowQuiz(data.content);

        } catch (err) {
            body.innerHTML = `<p class="error">Impossible de joindre le serveur.</p>`;
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
        const quizSection = document.getElementById('quiz-section');

        if (this.selectedTopics.length === 0 && !topic) {
            alert("Veuillez entrer ou sélectionner au moins un sujet.");
            return;
        }

        const finalTopics = [...this.selectedTopics];
        if (topic) finalTopics.push(topic);

        btn.disabled = true;
        btn.innerText = "Génération... ⏳";
        loader.classList.remove('hidden');
        loader.innerText = `Qwen génère ${count > 1 ? count + ' leçons' : 'votre leçon'} sur "${finalTopics.join(', ')}"... 🤖`;
        header.classList.add('hidden');
        body.innerHTML = "";
        footer.classList.add('hidden');
        quizSection.classList.add('hidden');

        try {
            const resp = await fetch('/api/lesson/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ topic: finalTopics, count, difficulty: this.currentDifficulty })
            });

            const data = await resp.json();

            if (data.error) {
                alert("Erreur: " + data.error);
                this.loadLesson();
                return;
            }

            alert(`${data.count} leçon(s) générée(s) avec succès !`);
            await this.loadPreferences();
            await this.loadHistory();
            await this.loadStreak();

            loader.classList.add('hidden');
            header.classList.remove('hidden');
            footer.classList.remove('hidden');
            document.getElementById('lesson-title').innerText = this.extractTitle(data.lastLesson.content) || "Nouvelle Leçon";

            // Afficher la difficulté
            const diffBadge = document.getElementById('lesson-difficulty');
            if (data.lastLesson.difficulty) {
                diffBadge.textContent = data.lastLesson.difficulty;
                diffBadge.className = `difficulty-badge ${data.lastLesson.difficulty}`;
                diffBadge.style.display = 'inline-block';
            }

            body.innerHTML = marked.parse(data.lastLesson.content);
            this.currentLessonContent = data.lastLesson.content;
            this.currentLessonIndex = 0;
            this.updateFavButton(false);

            this.extractAndShowQuiz(data.lastLesson.content);
            this.switchView('lesson-view');

        } catch (err) {
            console.error("Erreur de génération", err);
            alert("Erreur de communication avec le serveur.");
        } finally {
            btn.disabled = false;
            btn.innerText = "Générer 🚀";
            loader.innerText = "Un instant, Qwen prépare votre leçon... 🤖";
        }
    }

    async handleAutoGeneration() {
        const btn = document.getElementById('btn-auto-gen');
        const loader = document.getElementById('lesson-loader');
        const header = document.getElementById('lesson-header');
        const body = document.getElementById('lesson-body');
        const footer = document.getElementById('lesson-footer');
        const quizSection = document.getElementById('quiz-section');

        btn.disabled = true;
        btn.innerText = "Recherche d'actu... 📡";
        loader.classList.remove('hidden');
        loader.innerText = "Qwen scanne les actualités mondiales du jour pour vous... 🔎";
        header.classList.add('hidden');
        body.innerHTML = "";
        footer.classList.add('hidden');
        quizSection.classList.add('hidden');

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
            await this.loadStreak();

            loader.classList.add('hidden');
            header.classList.remove('hidden');
            footer.classList.remove('hidden');
            document.getElementById('lesson-title').innerText = this.extractTitle(data.lesson.content) || "Actualité du Jour";

            const diffBadge = document.getElementById('lesson-difficulty');
            diffBadge.style.display = 'none';

            body.innerHTML = marked.parse(data.lesson.content);
            this.currentLessonContent = data.lesson.content;
            this.currentLessonIndex = 0;
            this.updateFavButton(false);

            this.extractAndShowQuiz(data.lesson.content);
            this.switchView('lesson-view');

        } catch (err) {
            console.error("Erreur auto-génération", err);
        } finally {
            btn.disabled = false;
            btn.innerText = "Auto-Génération ✨";
        }
    }

    // ==================== QUIZ ====================

    extractAndShowQuiz(content) {
        const quizSection = document.getElementById('quiz-section');
        const quizQuestion = document.getElementById('quiz-question');
        const quizOptions = document.getElementById('quiz-options');
        const quizResult = document.getElementById('quiz-result');

        // Chercher le quiz dans le markdown: ## Quiz rapide\n followed by content
        const quizMatch = content.match(/## Quiz rapide\n([\s\S]*?)(?=---|$)/);
        if (!quizMatch) {
            quizSection.classList.add('hidden');
            return;
        }

        const quizText = quizMatch[1].trim();
        if (!quizText) {
            quizSection.classList.add('hidden');
            return;
        }

        // Parser simple: première ligne = question, lignes suivantes = options/réponse
        const lines = quizText.split('\n').filter(l => l.trim());
        if (lines.length < 2) {
            quizSection.classList.add('hidden');
            return;
        }

        const question = lines[0].replace(/^[-*•]\s*/, '').trim();
        const options = lines.slice(1).map(l => l.replace(/^[-*•]\s*/, '').trim()).filter(l => l);

        if (options.length < 2) {
            // Afficher le quiz comme texte simple
            quizSection.classList.remove('hidden');
            quizQuestion.textContent = question;
            quizOptions.innerHTML = `<p style="color: var(--text-muted); font-style: italic;">${options.join('<br>')}</p>`;
            quizResult.classList.add('hidden');
            return;
        }

        // Considérer la première option comme la bonne réponse (convention du prompt)
        const correctIndex = 0;

        // Mélanger les options pour l'affichage
        const shuffled = options.map((opt, i) => ({ text: opt, isCorrect: i === correctIndex }));
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        quizSection.classList.remove('hidden');
        quizQuestion.textContent = question;
        quizResult.classList.add('hidden');

        quizOptions.innerHTML = '';
        shuffled.forEach((opt, idx) => {
            const btn = document.createElement('div');
            btn.className = 'quiz-option';
            btn.textContent = opt.text;
            btn.addEventListener('click', () => {
                // Désactiver les clics suivants
                quizOptions.querySelectorAll('.quiz-option').forEach(b => b.style.pointerEvents = 'none');

                if (opt.isCorrect) {
                    btn.classList.add('correct');
                    quizResult.textContent = '✅ Bonne réponse !';
                    quizResult.className = 'quiz-result success';
                } else {
                    btn.classList.add('incorrect');
                    // Montrer la bonne réponse
                    quizOptions.querySelectorAll('.quiz-option').forEach((b, i) => {
                        if (shuffled[i].isCorrect) b.classList.add('correct');
                    });
                    quizResult.textContent = '❌ Pas tout à fait... La bonne réponse est en vert.';
                    quizResult.className = 'quiz-result error';
                }
                quizResult.classList.remove('hidden');
            });
            quizOptions.appendChild(btn);
        });
    }

    // ==================== FAVORITES ====================

    async toggleFavorite() {
        if (this.currentLessonIndex === null) return;

        try {
            const resp = await fetch(`/api/history/${this.currentLessonIndex}/favorite`, { method: 'PATCH' });
            const data = await resp.json();

            if (data.success) {
                this.updateFavButton(data.favorite);
                await this.loadHistory();
            }
        } catch (err) {
            console.error("Erreur toggle favori", err);
        }
    }

    updateFavButton(isFav) {
        const btn = document.getElementById('fav-toggle');
        btn.textContent = isFav ? '★' : '☆';
        btn.classList.toggle('active', isFav);
    }

    // ==================== EXPORT ====================

    exportLesson() {
        if (!this.currentLessonContent) {
            alert("Aucune leçon à exporter.");
            return;
        }

        const text = this.currentLessonContent;
        const title = this.extractTitle(text) || 'lecon';

        // Copier dans le presse-papier
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text).then(() => {
                const btn = document.getElementById('export-lesson');
                const origText = btn.innerHTML;
                btn.innerHTML = '✅ Copié !';
                setTimeout(() => { btn.innerHTML = origText; }, 2000);
            });
        }

        // Essayer le partage natif (mobile)
        if (navigator.share) {
            navigator.share({
                title: title,
                text: text.slice(0, 4000) // Limite de caractères
            }).catch(() => {}); // L'annulation n'est pas une erreur
        }
    }

    // ==================== STREAK ====================

    async loadStreak() {
        try {
            const resp = await fetch('/api/lesson/streak');
            const data = await resp.json();
            document.getElementById('streak-val').textContent = data.streak || 0;
        } catch (err) {
            console.error("Erreur chargement streak", err);
        }
    }

    // ==================== PREFERENCES ====================

    async loadPreferences() {
        const resp = await fetch('/api/preferences');
        this.preferences = await resp.json();
        this.renderTopics();
        this.renderDatalist();
        this.renderDifficultySettings();
        this.renderRssFeeds();
    }

    renderDifficultySettings() {
        const container = document.getElementById('settings-difficulty');
        if (!container) return;
        container.querySelectorAll('.diff-option').forEach(el => {
            el.classList.toggle('selected', el.dataset.diff === this.preferences.difficulty);
        });
    }

    renderRssFeeds() {
        const container = document.getElementById('rss-feeds-list');
        if (!container) return;
        const feeds = this.preferences.rssFeeds || [];
        if (feeds.length === 0) {
            container.innerHTML = '<p style="font-size: 0.8rem; color: var(--text-muted);">Aucun flux personnalisé ajouté.</p>';
            return;
        }
        container.innerHTML = feeds.map(url => `
            <div class="rss-feed-item">
                <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; margin-right: 10px;">${url}</span>
                <button class="remove-rss-feed" data-url="${url}">✕</button>
            </div>
        `).join('');

        container.querySelectorAll('.remove-rss-feed').forEach(btn => {
            btn.addEventListener('click', () => this.removeRssFeed(btn.dataset.url));
        });
    }

    async addRssFeed() {
        const input = document.getElementById('new-rss-feed');
        const url = input.value.trim();
        if (!url) return;

        try {
            const resp = await fetch('/api/preferences/rss-feed', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });
            const data = await resp.json();

            if (data.success) {
                this.preferences.rssFeeds = data.rssFeeds;
                this.renderRssFeeds();
                input.value = '';
            } else {
                alert(data.error);
            }
        } catch (err) {
            alert("Erreur d'ajout du flux RSS");
        }
    }

    async removeRssFeed(url) {
        try {
            const resp = await fetch('/api/preferences/rss-feed', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });
            const data = await resp.json();
            if (data.success) {
                this.preferences.rssFeeds = data.rssFeeds;
                this.renderRssFeeds();
            }
        } catch (err) {
            alert("Erreur de suppression du flux RSS");
        }
    }

    renderDatalist() {
        const datalist = document.getElementById('prefs-topics');
        datalist.innerHTML = this.preferences.topics
            .map(t => `<option value="${t}"></option>`)
            .join('');
    }

    async savePreferences(silent = true) {
        // Récupérer la difficulté sélectionnée dans les settings
        const selectedDiff = document.querySelector('#settings-difficulty .diff-option.selected');
        if (selectedDiff) {
            this.preferences.difficulty = selectedDiff.dataset.diff;
        }

        const resp = await fetch('/api/preferences', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(this.preferences)
        });
        if (resp.ok) {
            if (!silent) {
                alert("Préférences enregistrées ! La prochaine leçon sera adaptée.");
            }
            this.loadLesson();
        }
    }

    renderTopics() {
        const grid = document.getElementById('topics-grid');
        if (!grid) return;
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

            if (!this.preferences.topics.includes(val)) {
                this.preferences.topics.push(val);
                this.savePreferences(true);
                this.renderDatalist();
            }
        }
    }

    renderSelectedTopics() {
        const container = document.getElementById('selected-topics-container');
        if (!container) return;
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

    // ==================== HISTORY ====================

    async loadHistory(search = '') {
        let url = '/api/history?';
        if (this.currentFilter === 'favorites') {
            url += 'favorite=true&';
        }
        if (search) {
            url += `search=${encodeURIComponent(search)}&`;
        }

        const resp = await fetch(url);
        this.history = await resp.json();
        const list = document.getElementById('history-list');
        list.innerHTML = "";

        if (this.history.length === 0) {
            list.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 20px;">Aucune leçon trouvée.</p>';
            return;
        }

        this.history.forEach((item, index) => {
            const title = this.extractTitle(item.content) || "Leçon sans titre";
            const div = document.createElement('div');
            div.className = 'history-item glass-card clickable';
            div.style.marginBottom = '10px';
            div.style.padding = '15px';
            const favStar = item.favorite ? '★' : '☆';
            const diffBadge = item.difficulty ? `<span class="difficulty-badge ${item.difficulty}" style="margin-right: 6px;">${item.difficulty}</span>` : '';

            div.innerHTML = `
                <div class="history-item-content">
                    <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                        <span class="fav-btn ${item.favorite ? 'active' : ''}" style="font-size: 1rem; cursor: default;">${favStar}</span>
                        <strong style="flex: 1;">${title}</strong>
                    </div>
                    <div style="font-size: 0.75rem; color: var(--text-muted); display: flex; align-items: center; flex-wrap: wrap; gap: 4px;">
                        ${diffBadge}
                        <span>📅 ${item.date}</span> &bull;
                        <span>🏷️ ${(item.topics || []).join(', ')}</span>
                    </div>
                </div>
                <div class="history-item-actions">
                    <div class="btn-read">📘 Lire</div>
                    <div class="btn-delete" title="Supprimer">🗑️ <span class="delete-text">SUPPRIMER</span></div>
                </div>
            `;

            div.querySelector('.btn-read').onclick = (e) => {
                e.stopPropagation();
                this.showLessonFromHistory(index);
            };

            div.querySelector('.btn-delete').onclick = (e) => {
                e.stopPropagation();
                this.deleteLesson(index);
            };

            div.onclick = () => this.showLessonFromHistory(index);

            list.appendChild(div);
        });
    }

    async deleteLesson(index) {
        if (!confirm("Voulez-vous vraiment supprimer cette leçon de vos archives ?")) {
            return;
        }

        try {
            const resp = await fetch(`/api/history/${index}`, { method: 'DELETE' });
            if (resp.ok) {
                await this.loadHistory();
                await this.loadStreak();
            } else {
                alert("Erreur lors de la suppression.");
            }
        } catch (err) {
            console.error("Erreur suppression", err);
            alert("Erreur de communication avec le serveur.");
        }
    }

    showLessonFromHistory(index) {
        const lesson = this.history[index];
        if (!lesson) return;

        const body = document.getElementById('lesson-body');
        const header = document.getElementById('lesson-header');
        const footer = document.getElementById('lesson-footer');
        const loader = document.getElementById('lesson-loader');
        const quizSection = document.getElementById('quiz-section');

        loader.classList.add('hidden');
        header.classList.remove('hidden');
        footer.classList.remove('hidden');
        quizSection.classList.add('hidden');

        document.getElementById('lesson-title').innerText = this.extractTitle(lesson.content) || "Archive";
        document.getElementById('lesson-date').innerText = lesson.date;

        // Afficher la difficulté
        const diffBadge = document.getElementById('lesson-difficulty');
        if (lesson.difficulty) {
            diffBadge.textContent = lesson.difficulty;
            diffBadge.className = `difficulty-badge ${lesson.difficulty}`;
            diffBadge.style.display = 'inline-block';
        } else {
            diffBadge.style.display = 'none';
        }

        this.updateFavButton(lesson.favorite || false);

        body.innerHTML = marked.parse(lesson.content);
        this.currentLessonContent = lesson.content;
        this.currentLessonIndex = index;

        this.extractAndShowQuiz(lesson.content);

        this.switchView('lesson-view');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ==================== AUTH ====================

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
                window.open(data.url, '_blank');
                this.pollAuthStatus();
            } else {
                status.innerText = "Échec de génération du lien. Réessayez ou utilisez une clé API.";
            }
        } catch (err) {
            status.innerText = "Erreur de communication avec le serveur.";
        }
    }

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

    // ==================== UTILS ====================

    extractTitle(md) {
        const match = md.match(/^# (.*$)/m);
        return match ? match[1] : null;
    }
}

// Lancement
document.addEventListener('DOMContentLoaded', () => {
    window.app = new TutorApp();
});
