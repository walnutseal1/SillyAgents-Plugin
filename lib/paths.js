const fs = require('fs').promises;
const path = require('path');

let PLUGIN_DIR;
let SKILLS_DIR;
const DATA_ROOT = path.join(process.cwd(), 'data');

async function initializeDirectories() {
    PLUGIN_DIR = path.join(DATA_ROOT, 'sillyagents');
    SKILLS_DIR = path.join(PLUGIN_DIR, 'skills');

    const dirs = [PLUGIN_DIR, SKILLS_DIR];

    for (const dir of dirs) {
        try {
            await fs.access(dir);
        } catch {
            await fs.mkdir(dir, { recursive: true });
            console.log(`[SillyAgents] Created directory: ${dir}`);
        }
    }

    return { PLUGIN_DIR, SKILLS_DIR };
}

function getCharacterChatDir(characterName, userDirectories) {
    const chatsRoot = userDirectories?.chats || path.join(DATA_ROOT, 'default-user', 'chats');
    return path.join(chatsRoot, characterName);
}

module.exports = {
    initializeDirectories,
    getCharacterChatDir,
    PLUGIN_DIR,
    SKILLS_DIR,
};
