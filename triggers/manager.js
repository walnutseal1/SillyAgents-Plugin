/**
 * triggers/manager.js
 * Manages active trigger jobs (timers, future webhooks, etc.)
 */

const { fireSubroutineTrigger } = require('./executor');

// key → { type, timer?, cfg, chatFilePath, characterName }
const activeTriggers = new Map();

/**
 * Start a trigger job according to its type
 * @returns {Promise<boolean>} true = started now, false = already running
 */
async function startTrigger(key, cfg, chatFilePath, characterName) {
    if (activeTriggers.has(key)) {
        return false;
    }

    if (cfg.triggerType === 'time-based') {
        if (!cfg.interval || cfg.interval < 1) {
            throw new Error('time-based trigger requires valid interval (seconds)');
        }

        const intervalMs = cfg.interval * 1000;

        const timer = setInterval(async () => {
            try {
                await fireSubroutineTrigger(characterName, cfg, chatFilePath);
            } catch (err) {
                console.error(`[SillyAgents] trigger execution failed ${key}:`, err);
            }
        }, intervalMs);

        activeTriggers.set(key, {
            type: 'interval',
            timer,
            cfg,
            chatFilePath,
            characterName,
        });

        return true;
    }

    if (cfg.triggerType === 'tool-based') {
        // Future: polling loop that checks tool result before firing
        console.warn('[SillyAgents] tool-based trigger started (placeholder polling)');
        activeTriggers.set(key, { type: 'tool-based', cfg, chatFilePath, characterName });
        return true;
    }

    if (cfg.triggerType === 'api-based') {
        // Future: just mark as active → webhook endpoint will fire it
        console.warn('[SillyAgents] api-based trigger activated (webhook mode)');
        activeTriggers.set(key, { type: 'api', cfg, chatFilePath, characterName });
        return true;
    }

    throw new Error(`Unknown trigger type: ${cfg.triggerType}`);
}

/**
 * Stop a running trigger job
 * @returns {boolean} true = was running and is now stopped
 */
async function stopTrigger(key) {
    const job = activeTriggers.get(key);
    if (!job) return false;

    if (job.type === 'interval' && job.timer) {
        clearInterval(job.timer);
    }

    // tool-based / api-based can have cleanup here later

    activeTriggers.delete(key);
    return true;
}

/**
 * Graceful shutdown – stop all running timers
 */
async function shutdownTriggers() {
    console.log('[SillyAgents] Stopping all active triggers...');

    for (const [key, job] of activeTriggers.entries()) {
        if (job.type === 'interval' && job.timer) {
            clearInterval(job.timer);
        }
        console.log(`[SillyAgents] Stopped trigger: ${key}`);
    }

    activeTriggers.clear();
}

module.exports = {
    startTrigger,
    stopTrigger,
    shutdownTriggers,
};
