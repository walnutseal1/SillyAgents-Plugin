const { getCharacterChatDir } = require('../lib/paths');
const { isSubroutine, createSubroutineMetadata, readChatFile, writeChatFile } = require('../lib/chat');

/**
 * @param {import('express').Router} router
 */
function initSubroutineRoutes(router) {
    // Create new subroutine
    router.post('/subroutines', async (req, res) => {
        try {
            const { characterName, chatName, triggerType, config = {} } = req.body;

            if (!characterName || !chatName || !triggerType) {
                return res.status(400).json({ error: 'Missing required fields' });
            }

            const validTriggers = ['time-based', 'tool-based', 'api-based'];
            if (!validTriggers.includes(triggerType)) {
                return res.status(400).json({ error: `Invalid trigger type. Must be one of: ${validTriggers.join(', ')}` });
            }

            const chatDir = getCharacterChatDir(characterName, req.user?.directories);
            await fs.promises.mkdir(chatDir, { recursive: true });

            const chatFileName = `${chatName}.jsonl`;
            const chatFilePath = path.join(chatDir, chatFileName);

            try {
                await fs.promises.access(chatFilePath);
                return res.status(409).json({ error: 'Chat with this name already exists' });
            } catch {
                // good - file does not exist
            }

            const subroutineConfig = {
                id: Date.now().toString(36) + Math.random().toString(36).slice(2, 9),
                triggerType,
                ...config,
            };

            const metadata = {
                user_name: config.userName || 'User',
                character_name: characterName,
                create_date: new Date().toISOString(),
                chat_metadata: createSubroutineMetadata(subroutineConfig),
            };

            await writeChatFile(chatFilePath, metadata, []);

            res.json({
                success: true,
                subroutine: {
                    characterName,
                    chatName,
                    filePath: chatFileName,
                    ...metadata.chat_metadata.subroutine_config,
                }
            });
        } catch (err) {
            console.error('[SillyAgents] create subroutine error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // List all subroutines
    router.get('/subroutines', async (req, res) => {
        try {
            const chatsRoot = req.user?.directories?.chats || path.join(process.cwd(), 'data', 'default-user', 'chats');
            const subroutines = [];

            const characterDirs = await fs.promises.readdir(chatsRoot);

            for (const charName of characterDirs) {
                const charPath = path.join(chatsRoot, charName);
                if (!(await fs.promises.stat(charPath)).isDirectory()) continue;

                const chatFiles = await fs.promises.readdir(charPath);

                for (const file of chatFiles) {
                    if (!file.endsWith('.jsonl')) continue;

                    const fullPath = path.join(charPath, file);
                    try {
                        const { metadata } = await readChatFile(fullPath);
                        if (isSubroutine(metadata)) {
                            subroutines.push({
                                characterName: charName,
                                chatName: file.replace('.jsonl', ''),
                                filePath: file,
                                ...metadata.chat_metadata.subroutine_config,
                            });
                        }
                    } catch {
                        // skip broken files
                    }
                }
            }

            res.json({ subroutines });
        } catch (err) {
            console.error('[SillyAgents] list subroutines error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ... you can add the other CRUD endpoints (GET one, PUT, DELETE) here similarly
    // They follow almost the same pattern as in the original file
}

module.exports = { initSubroutineRoutes };
