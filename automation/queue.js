const Logger = require('./logger');

class JobQueue {
    constructor() {
        this.queue = [];
        this.isProcessing = false;
        
        // Health Monitoring
        this.stats = {
            success_count: 0,
            failure_count: 0,
            last_error: null,
            consecutiveFailures: 0,
            last_reauth_triggered: false
        };
    }

    getHealth() {
        // Evaluate auth status based on env directly
        const hasTokens = !!process.env.SESSION_TOKEN && !!process.env.CSRF_TOKEN;
        
        return {
            system: "online",
            auth: hasTokens && !this.stats.last_reauth_triggered ? "valid" : "expired",
            queue: this.isProcessing ? "busy" : "idle",
            queueLength: this.queue.length,
            successes: this.stats.success_count,
            failures: this.stats.failure_count,
            last_error: this.stats.last_error
        };
    }

    async add(taskName, taskFunction) {
        return new Promise((resolve, reject) => {
            this.queue.push({ taskFunction, resolve, reject });
            Logger.info(`job_added_to_queue_size_${this.queue.length}`, { task: taskName });
            this.processNext();
        });
    }

    async processNext() {
        if (this.isProcessing || this.queue.length === 0) {
            return;
        }

        this.isProcessing = true;
        const job = this.queue.shift();

        try {
            Logger.info("job_preflight_validation");
            if (!process.env.SESSION_TOKEN || !process.env.CSRF_TOKEN) {
                this.stats.last_reauth_triggered = true;
                throw new Error("Session error: No tokens found in .env");
            }
            
            Logger.info("job_started");
            if (this.stats.consecutiveFailures >= 3) {
                 Logger.error("queue_system", "3 consecutive failures detected! Alert raised.");
            }

            const result = await job.taskFunction();
            
            // On Success
            this.stats.consecutiveFailures = 0;
            this.stats.success_count++;
            this.stats.last_reauth_triggered = false;
            
            Logger.success("job_completed");
            job.resolve(result);
        } catch (error) {
            this.stats.consecutiveFailures++;
            this.stats.failure_count++;
            this.stats.last_error = error.message;
            
            if (error.message.includes('Session expired') || error.message.includes('Session error')) {
                this.stats.last_reauth_triggered = true;
                Logger.error("auth_system", "Re-auth required state triggered");
            }
            
            Logger.error("job_failed", error.message);
            job.reject(error);
        } finally {
            this.isProcessing = false;
            this.processNext();
        }
    }
}

module.exports = new JobQueue();
