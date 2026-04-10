const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');

const JOBS_PATH = path.join(__dirname, '../jobs.json');
const TIMEZONE = 'Asia/Dhaka';

let jobs = [];
let whatsappSock = null;
let telegramBot = null;
let workerInterval = null;

// Initialization
function init(sock = null, bot = null) {
    whatsappSock = sock;
    telegramBot = bot;
    loadJobs();
    startWorker();
    console.log("✅ [Scheduler] Engine Initialized (Asia/Dhaka)");
}

function loadJobs() {
    if (fs.existsSync(JOBS_PATH)) {
        try {
            const data = fs.readFileSync(JOBS_PATH, 'utf-8');
            jobs = JSON.parse(data);
        } catch (e) {
            console.error("❌ [Scheduler] Error loading jobs.json:", e.message);
            jobs = [];
        }
    }
}

function saveJobs() {
    fs.writeFileSync(JOBS_PATH, JSON.stringify(jobs, null, 2));
}

/**
 * Add a new job to the scheduler
 */
function addJob({ platform, target, message, scheduledTime, creator }) {
    // scheduledTime should be in YYYY-MM-DD HH:mm format (Asia/Dhaka)
    const bstMoment = moment.tz(scheduledTime, 'YYYY-MM-DD HH:mm', TIMEZONE);
    if (!bstMoment.isValid() || bstMoment.isBefore(moment())) {
        throw new Error("Invalid or past time provided.");
    }

    const job = {
        id: 'job_' + Date.now() + Math.floor(Math.random() * 1000),
        platform,
        target,
        message,
        scheduled_time: bstMoment.toISOString(), // Store as UTC ISO for reliability
        display_time: bstMoment.format('YYYY-MM-DD HH:mm'),
        creator,
        status: 'pending',
        attempts: 0
    };

    jobs.push(job);
    saveJobs();
    return job;
}

/**
 * Worker tick every 30 seconds
 */
function startWorker() {
    if (workerInterval) clearInterval(workerInterval);
    workerInterval = setInterval(async () => {
        const now = moment();
        const pendingJobs = jobs.filter(j => j.status === 'pending');

        for (const job of pendingJobs) {
            const jobTime = moment(job.scheduled_time);
            if (now.isSameOrAfter(jobTime)) {
                await executeJob(job);
            }
        }
    }, 30000); // 30 seconds poll
}

async function executeJob(job) {
    console.log(`🚀 [Scheduler] Executing Job: ${job.id} for ${job.target}`);
    job.attempts++;
    
    try {
        if (job.platform === 'whatsapp' && whatsappSock) {
            await whatsappSock.sendMessage(job.target, { text: job.message });
        } else if (job.platform === 'telegram' && telegramBot) {
            await telegramBot.telegram.sendMessage(job.target, job.message);
        } else {
            throw new Error(`Platform ${job.platform} or instance not ready.`);
        }

        // Mark as success
        job.status = 'completed';
        job.executed_at = moment().tz(TIMEZONE).format();
        console.log(`✅ [Scheduler] Job ${job.id} delivered.`);
    } catch (err) {
        console.error(`❌ [Scheduler] Job ${job.id} failed:`, err.message);
        if (job.attempts >= 2) {
            job.status = 'failed';
            job.error = err.message;
        }
    }
    saveJobs();
}

function getStats() {
    return {
        total: jobs.length,
        pending: jobs.filter(j => j.status === 'pending').length,
        completed: jobs.filter(j => j.status === 'completed').length,
        failed: jobs.filter(j => j.status === 'failed').length,
        last_job: jobs.length > 0 ? jobs[jobs.length - 1] : null,
        state: workerInterval ? 'Running' : 'Stopped'
    };
}

// Compatibility with old call pattern
function startWorkerLegacy(sock, bot) {
    init(sock, bot);
}

module.exports = {
    init,
    addJob,
    getStats,
    startWorker: startWorkerLegacy,
    updateInstances: (sock, bot) => { whatsappSock = sock; telegramBot = bot; }
};
