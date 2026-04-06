/**
 * Rate Limiter simple basé sur l'adresse IP
 * Limite le nombre de requêtes par fenêtre de temps
 */
class RateLimiter {
    constructor(maxRequests = 10, windowMs = 60000) {
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
        this.clients = new Map(); // IP -> { count, resetTime }
    }

    isLimited(ip) {
        const now = Date.now();
        let client = this.clients.get(ip);

        if (!client || now > client.resetTime) {
            // Nouvelle fenêtre
            client = {
                count: 1,
                resetTime: now + this.windowMs
            };
            this.clients.set(ip, client);
            return false;
        }

        client.count++;

        if (client.count > this.maxRequests) {
            return true; // Limité
        }

        return false;
    }

    getRemaining(ip) {
        const client = this.clients.get(ip);
        if (!client) return this.maxRequests;
        return Math.max(0, this.maxRequests - client.count);
    }

    // Nettoyage périodique des anciennes entrées
    cleanup() {
        const now = Date.now();
        for (const [ip, client] of this.clients.entries()) {
            if (now > client.resetTime) {
                this.clients.delete(ip);
            }
        }
    }
}

// Instances pré-configurées
const strictLimiter = new RateLimiter(5, 60000);    // 5 req/min (endpoints lourds)
const moderateLimiter = new RateLimiter(20, 60000);  // 20 req/min (endpoints normaux)

/**
 * Middleware Express pour le rate limiting
 */
function createRateLimitMiddleware(limiter) {
    // Nettoyage toutes les 5 minutes
    setInterval(() => limiter.cleanup(), 5 * 60 * 1000);

    return (req, res, next) => {
        const ip = req.ip || req.connection.remoteAddress;

        if (limiter.isLimited(ip)) {
            return res.status(429).json({
                error: 'Trop de requêtes. Réessayez dans quelques minutes.',
                retryAfter: 60
            });
        }

        res.set('X-RateLimit-Remaining', limiter.getRemaining(ip).toString());
        next();
    };
}

module.exports = { RateLimiter, createRateLimitMiddleware, strictLimiter, moderateLimiter };
