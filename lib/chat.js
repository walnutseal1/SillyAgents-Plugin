const fs = require('fs').promises;
const { getCharacterChatDir } = require('./paths');

function isSubroutine(metadata) {
    return metadata?.chat_metadata?.subroutine === true;
}

function createSubroutineMetadata(config) {
    return {
        subroutine: true,
        subroutine_config: {
            id: config.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 9),
            triggerType: config.triggerType,
            active: config.active ?? false,
            triggerText: config.triggerText || null,
            triggerRole: config.triggerRole || "user",
            fallbackTriggerText: config.fallbackTriggerText,
            interval: config.interval,
            toolName: config.toolName,
            toolCondition: config.toolCondition,
            autoQueue: config.autoQueue ?? false,
            autoQueuePrompt: config.autoQueuePrompt,
            useSummary: config.useSummary ?? false,
            color: config.color || '#6366f1',
            useLorebooks: config.useLorebooks !== false,
            useExampleMessages: config.useExampleMessages !== false,
            createdAt: config.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        }
    };
}

async function readChatFile(chatFilePath) {
    const content = await fs.readFile(chatFilePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    if (lines.length === 0) {
        throw new Error('Empty chat file');
    }

    const metadata = JSON.parse(lines[0]);
    const messages = lines.slice(1).map(line => JSON.parse(line));

    return { metadata, messages };
}

async function writeChatFile(chatFilePath, metadata, messages) {
    const lines = [
        JSON.stringify(metadata),
        ...messages.map(msg => JSON.stringify(msg))
    ];

    await fs.writeFile(chatFilePath, lines.join('\n') + '\n', 'utf-8');
}

module.exports = {
    isSubroutine,
    createSubroutineMetadata,
    readChatFile,
    writeChatFile,
};
