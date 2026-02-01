/**
 * triggers/executor.js
 * Core logic: actually run one trigger cycle (append message → generate → tools → auto-queue)
 */

const fs = require('fs').promises;
const path = require('path');
const { readChatFile, writeChatFile } = require('../lib/chat');
const { getCharacterChatDir } = require('../lib/paths'); // If needed for character loading

// SillyTavern internal requires - adjust paths if necessary
const { getStatusAsync } = require('../../server/openai'); // Relative from plugin
const { generateOpenAIResponse } = require('../../server/openai-stream');
const { getRequestPrompt } = require('../../server/prompts');
// For character loading - assuming characters module exists
const characters = require('../../server/characters'); // Placeholder: use actual way to load character

// Placeholder for summarization - assuming a summarize function
async function summarizeMessages(messages) {
    // TODO: Integrate with SillyTavern's summarizer extension or built-in
    // For example: require('../../extensions/summarize/index').summarizeChat(messages)
    console.warn('[SillyAgents] Summarization not implemented - returning original messages');
    return messages;
}

// Placeholder for tool execution
async function executeToolCalls(toolCalls, skills = []) {
    const results = [];
    for (const call of toolCalls) {
        const { name, arguments: args } = call;
        if (name === 'finish') {
            // Special finish tool - signal completion
            return { finished: true, result: args?.reason || 'Task completed' };
        }
        // TODO: Execute actual tool or skill
        // Integrate with Agent Skills: find skill by name and run its script/workflow
        console.log(`[SillyAgents] Executing tool: ${name} with args:`, args);
        results.push({ tool: name, result: 'Placeholder result - implement tool execution' });
    }
    return { finished: false, results };
}

/**
 * Execute one trigger cycle for a subroutine
 * @param {string} characterName
 * @param {string} chatName - For logging/context
 * @param {Object} cfg   // subroutine_config
 * @param {string} chatFilePath
 * @param {number} [depth=0] - Recursion depth to prevent infinite loops
 * @returns {Promise<boolean>} true if finished (via finish tool), false otherwise
 */
async function fireSubroutineTrigger(characterName, chatName, cfg, chatFilePath, depth = 0) {
    const MAX_DEPTH = 20; // Prevent stack overflow / infinite loops
    if (depth > MAX_DEPTH) {
        console.error(`[SillyAgents] Max recursion depth reached for ${chatName}`);
        return true; // Consider as finished
    }

    let { metadata, messages } = await readChatFile(chatFilePath);

    // 1. Load character data for system prompt
    const character = await loadCharacter(characterName); // Implement below
    const systemPrompt = character?.description || 'You are an autonomous agent.';

    // 2. Append trigger message (or auto-queue prompt if depth > 0)
    let newMsg;
    if (depth === 0) {
        const triggerText = cfg.triggerText?.trim() || cfg.fallbackTriggerText || 'Heartbeat: Continue your task.';
        newMsg = {
            name: metadata.user_name || 'User',
            mes: triggerText,
            is_user: cfg.triggerRole !== 'assistant',
            is_system: cfg.triggerRole === 'system',
            sendDate: new Date().toISOString(),
        };
    } else {
        // For recursion, this would be tool results or auto-queue
        // But handled in callers
    }
    if (newMsg) messages.push(newMsg);

    // 3. Optional summarization
    let processedMessages = messages;
    if (cfg.useSummary) {
        processedMessages = await summarizeMessages(messages);
    }

    // 4. Build full prompt
    const promptData = {
        character, // If getRequestPrompt needs full character
        messages: processedMessages,
        system_prompt: systemPrompt,
        use_lorebooks: cfg.useLorebooks,
        use_examples: cfg.useExampleMessages, // Assuming this means example_dialogue from character
        // Add more if needed: jailbreak, etc.
    };
    const fullPrompt = getRequestPrompt(promptData); // Returns array of {role, content}

    // 5. Check backend status
    const status = await getStatusAsync();
    if (!status?.extended?.tools) {
        console.warn(`[SillyAgents] Backend for ${chatName} may not support tools`);
    }

    // 6. Define tools - always include finish, plus any attached skills
    const tools = [
        {
            type: 'function',
            function: {
                name: 'finish',
                description: 'Call this when the task is complete or no further actions needed.',
                parameters: {
                    type: 'object',
                    properties: {
                        reason: { type: 'string', description: 'Why finishing' },
                    },
                },
            },
        },
        // TODO: Load and add Agent Skills as tools
        // e.g., await getAttachedSkills(characterName, chatName)
    ];

    // 7. Generate response
    const generationOptions = {
        // TODO: Fetch from user settings or config
        temperature: 0.7,
        max_tokens: 1024,
        tools, // Enable tool calling
        tool_choice: 'auto',
    };
    const response = await generateOpenAIResponse(fullPrompt, generationOptions);

    // 8. Parse response (OpenAI-like)
    const choice = response.choices?.[0]?.message || {};
    const aiContent = choice.content || '';
    const toolCalls = choice.tool_calls || [];

    // 9. Append AI message
    messages.push({
        name: characterName,
        mes: aiContent,
        is_user: false,
        sendDate: new Date().toISOString(),
        // extra: { tool_calls } if needed
    });

    // 10. Handle tool calls
    let finished = false;
    if (toolCalls.length > 0) {
        const toolResult = await executeToolCalls(toolCalls);
        if (toolResult.finished) {
            finished = true;
            messages.push({
                name: 'System',
                mes: `Task finished: ${toolResult.result}`,
                is_user: true,
                is_system: true,
                sendDate: new Date().toISOString(),
            });
        } else {
            // Append tool results as user message
            messages.push({
                name: 'Tool',
                mes: JSON.stringify(toolResult.results || 'Tool executed'),
                is_user: true,
                sendDate: new Date().toISOString(),
            });
            // Recurse for next generation
            return fireSubroutineTrigger(characterName, chatName, cfg, chatFilePath, depth + 1);
        }
    } else if (cfg.autoQueue && aiContent.trim() && !finished) {
        // Auto-queue if no tools and not finished
        const queuePrompt = cfg.autoQueuePrompt || 'Continue reasoning and take next action if needed.';
        messages.push({
            name: metadata.user_name || 'User',
            mes: queuePrompt,
            is_user: true,
            sendDate: new Date().toISOString(),
        });
        // Recurse
        return fireSubroutineTrigger(characterName, chatName, cfg, chatFilePath, depth + 1);
    }

    // 11. Save updated chat
    await writeChatFile(chatFilePath, metadata, messages);

    return finished;
}

// Helper: Load character data
async function loadCharacter(characterName) {
    // TODO: Implement properly
    // Example: const charDir = path.join(process.cwd(), 'public/characters');
    // const charFile = path.join(charDir, `${characterName}.yaml`); // or .json / .png with tavern card
    // Then parse YAML or tavern card
    console.warn('[SillyAgents] Character loading placeholder');
    return { description: 'You are an autonomous agent.' };
}

module.exports = {
    fireSubroutineTrigger,
};
