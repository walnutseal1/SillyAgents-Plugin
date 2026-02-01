/**
 * routes/triggers.js
 * HTTP endpoints for starting / stopping subroutine triggers
 */

const path = require('path');
const { getCharacterChatDir } = require('../lib/paths');
const { readChatFile, writeChatFile, isSubroutine } = require('../lib/chat');
const { startTrigger, stopTrigger, shutdownTriggers } = require('../triggers/manager');

/**
 * @param {import('express').Router} router
 */
function initTriggerRoutes(router) {
    // Start trigger for a specific subroutine chat
    router.post('/triggers/:characterName/:chatName/start', async (req, res) => {
        try {
            const { characterName, chatName } = req.params;
            const key = `${characterName}|${chatName}`;

            const chatDir = getCharacterChatDir(characterName, req.user?.directories);
            const chatFilePath = path.join(chatDir, `${chatName}.jsonl`);

            const { metadata, messages } = await readChatFile(chatFilePath);

            if (!isSubroutine(metadata)) {
                return res.status(400).json({ error: 'Not a subroutine chat' });
            }

            const cfg = metadata.chat_metadata.subroutine_config;

            // Start the trigger (manager will handle persistence & scheduling)
            const started = await startTrigger(key, cfg, chatFilePath, metadata.character_name);

            if (!started) {
                return res.status(409).json({ error: 'Trigger already running' });
            }

            // Persist active = true if it wasn't already
            if (!cfg.active) {
                cfg.active = true;
                metadata.chat_metadata.subroutine_config = cfg;
                await writeChatFile(chatFilePath, metadata, messages);
            }

            res.json({ success: true, status: 'started' });
        } catch (err) {
            console.error('[SillyAgents] start trigger error:', err);
            if (err.code === 'ENOENT') {
                return res.status(404).json({ error: 'Subroutine chat not found' });
            }
            res.status(500).json({ error: err.message });
        }
    });

    // Stop trigger
    router.post('/triggers/:characterName/:chatName/stop', async (req, res) => {
        try {
            const { characterName, chatName } = req.params;
            const key = `${characterName}|${chatName}`;

            const stopped = await stopTrigger(key);

            if (!stopped) {
                return res.status(404).json({ error: 'No running trigger found' });
            }

            // Optional: persist active = false
            const chatDir = getCharacterChatDir(characterName, req.user?.directories);
            const chatFilePath = path.join(chatDir, `${chatName}.jsonl`);

            try {
                const { metadata, messages } = await readChatFile(chatFilePath);
                if (isSubroutine(metadata)) {
                    metadata.chat_metadata.subroutine_config.active = false;
                    await writeChatFile(chatFilePath, metadata, messages);
                }
            } catch {
                // best effort - don't fail the stop if file is gone
            }

            res.json({ success: true, status: 'stopped' });
        } catch (err) {
            console.error('[SillyAgents] stop trigger error:', err);
            res.status(500).json({ error: err.message });
        }
    });
}

module.exports = {
    initTriggerRoutes,
    shutdownTriggers,   // re-export so index.js can call it on exit
};
