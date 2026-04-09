const fs = require('fs');
const path = require('path');

const JOBS_PATH = path.join(__dirname, '..', 'scheduled_jobs.json');

class Scheduler {
    constructor() {
        this.jobs = this.loadJobs();
    }

    loadJobs() {
        if (fs.existsSync(JOBS_PATH)) {
            try {
                return JSON.parse(fs.readFileSync(JOBS_PATH, 'utf-8'));
            } catch (e) {
                return [];
            }
        }
        return [];
    }

    saveJobs() {
        fs.writeFileSync(JOBS_PATH, JSON.stringify(this.jobs, null, 2));
    }

    schedule(jid, timeStr, message) {
        // timeStr format from AI: "YYYY-MM-DD HH:mm"
        // Force BST (+06:00) parsing
        let fullTimeStr = timeStr.includes('T') ? timeStr : timeStr.replace(' ', 'T');
        if (!fullTimeStr.includes('+')) {
            fullTimeStr += '+06:00';
        }

        let targetTime = new Date(fullTimeStr);
        const now = new Date();

        if (isNaN(targetTime.getTime()) || targetTime < now) {
            console.error(`[Scheduler] Invalid time: ${fullTimeStr} (Parsed as: ${targetTime.toISOString()}) vs Now: ${now.toISOString()}`);
            throw new Error("Invalid or past time format. Please try again with a future time.");
        }

        const job = {
            id: Date.now().toString(),
            jid,
            time: targetTime.getTime(),
            message,
            status: 'pending'
        };

        this.jobs.push(job);
        this.saveJobs();
        return job;
    }

    async startWorker(sock) {
        setInterval(async () => {
            const now = Date.now();
            const pendingJobs = this.jobs.filter(j => j.status === 'pending' && j.time <= now);

            for (const job of pendingJobs) {
                try {
                    console.log(`[Scheduler] Sending job ${job.id} to ${job.jid}`);
                    await sock.sendMessage(job.jid, { text: job.message });
                    job.status = 'completed';
                    job.sentAt = new Date().toISOString();
                } catch (error) {
                    console.error(`[Scheduler] Failed job ${job.id}:`, error);
                    job.status = 'failed';
                    job.error = error.message;
                }
            }

            if (pendingJobs.length > 0) {
                this.saveJobs();
            }
        }, 60000); // Check every minute
    }
}

module.exports = new Scheduler();
