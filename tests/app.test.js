const request = require('supertest');

// Mock the qwen-runner to avoid actual CLI calls
jest.mock('../utils/qwen-runner', () => ({
    runQwen: jest.fn().mockResolvedValue('# Leçon Test\n\nCeci est un test.\n\n## Quiz rapide\nQuestion de test?\n- Option A\n- Option B'),
    sanitizeInput: jest.fn((input) => input)
}));

const app = require('../server');

describe('TutorAI API Tests', () => {
    afterAll(async () => {
        // Give server time to close if needed
        await new Promise(resolve => setTimeout(resolve, 100));
    });

    // Health Check
    describe('GET /health', () => {
        it('should return ok status', async () => {
            const res = await request(app).get('/health');
            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('status', 'ok');
            expect(res.body).toHaveProperty('uptime');
            expect(res.body).toHaveProperty('timestamp');
        });
    });

    // Auth Status
    describe('GET /api/auth/status', () => {
        it('should return auth status', async () => {
            const res = await request(app).get('/api/auth/status');
            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('authenticated');
            expect(res.body).toHaveProperty('method');
        });
    });

    // Preferences
    describe('GET /api/preferences', () => {
        it('should return preferences', async () => {
            const res = await request(app).get('/api/preferences');
            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('topics');
        });
    });

    describe('POST /api/preferences', () => {
        it('should save preferences', async () => {
            const res = await request(app)
                .post('/api/preferences')
                .send({ topics: ['Test', 'IA'], difficulty: 'débutant' });
            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('success', true);
        });
    });

    // History
    describe('GET /api/lesson/history', () => {
        it('should return history array', async () => {
            const res = await request(app).get('/api/lesson/history');
            expect(res.statusCode).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
        });
    });

    // Lesson generation (uses mocked Qwen)
    describe('POST /api/lesson/generate', () => {
        it('should generate a lesson', async () => {
            const res = await request(app)
                .post('/api/lesson/generate')
                .send({ topic: ['Test'], count: 1, difficulty: 'débutant' });

            // May be rate limited, so accept 200 or 429
            expect([200, 429]).toContain(res.statusCode);

            if (res.statusCode === 200) {
                expect(res.body).toHaveProperty('success', true);
                expect(res.body).toHaveProperty('count');
                expect(res.body).toHaveProperty('lastLesson');
            }
        });
    });

    // Streak
    describe('GET /api/lesson/streak', () => {
        it('should return streak count', async () => {
            const res = await request(app).get('/api/lesson/streak');
            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('streak');
        });
    });
});
