/**
 * triggers/executor.js
 * Core logic: actually run one trigger cycle (append message → generate → tools → auto-queue)
 *
 * Currently contains placeholders for OpenAI / SillyTavern generation integration.
 * You will need to hook this into SillyTavern's actual prompt builder & generator.
 */

const fs = require('fs').promises;
const { readChatFile, writeChatFile } = require('../lib/chat');

/**
 * Execute one trigger cycle for a subroutine
 * @param {string} characterName
 * @param {Object} cfg   // subroutine_config
 * @param {string} chatFilePath
 */
async function fireSubroutineTrigger(characterName, cfg, chatFilePath) {
    let { metadata, messages } = await readChatFile(chatFilePath);

    // 1. Append trigger message
    const triggerText = cfg.triggerText || cfg.fallbackTriggerText || '(trigger activated)';
    const triggerMsg = {
        name: metadata.user_name || 'System',
        mes: triggerText,
        is_user: true,
        is_system: cfg.triggerRole === 'system',
        sendDate: new Date().toISOString(),
    };
    messages.push(triggerMsg);

    // 2. Build prompt context
    // ────────────────────────────────────────────────────────────────
    //   This part needs real integration with SillyTavern's prompt system
    //   Placeholder for now — replace with actual logic
    // ────────────────────────────────────────────────────────────────
    const systemPrompt = "You are an autonomous agent executing a long-running task."; // ← from character card
    const fullMessages = [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({
            role: m.is_user ? 'user' : 'assistant',
            content: m.mes
        }))
    ];

    // Respect config flags (lorebooks, examples, summary, etc.)
    // if (cfg.useSummary) { fullMessages = await summarizeIfNeeded(fullMessages); }
    // if (!cfg.useLorebooks) { removeLorebookEntries(fullMessages); }

    // 3. Call LLM (placeholder – replace with real SillyTavern/OpenAI call)
    //    Should support tool calling
    const generationResult = await fakeGenerateWithTools(fullMessages, {
        temperature: 0.7,
        max_tokens: 1200,
        tools: true, // enable function calling
    });

    const aiContent = generationResult.content;
    const toolCalls = generationResult.tool_calls || [];

    // 4. Append AI response
    messages.push({
        name: characterName,
        mes: aiContent || '(no response generated)',
        is_user: false,
        sendDate: new Date().toISOString(),
    });

    // 5. Handle tool calls (placeholder)
    if (toolCalls.length > 0) {
        const toolResults = await executeToolCalls(toolCalls); // ← implement or delegate to MCP / extensions

        messages.push({
            name: 'tool',
            mes: JSON.stringify(toolResults, null, 2),
            is_user: true,
            sendDate: new Date().toISOString(),
        });

        // Recurse: continue after tool results
        return fireSubroutineTrigger(characterName, cfg, chatFilePath);
    }

    // 6. Auto-queue mode
    if (cfg.autoQueue && toolCalls.length === 0) {
        const continueMsg = {
            name: metadata.user_name || 'System',
            mes: cfg.autoQueuePrompt || 'Continue your current task. Think step by step and decide on the next action.',
            is_user: true,
            sendDate: new Date().toISOString(),
        };
        messages.push(continueMsg);

        // Recurse
        return fireSubroutineTrigger(characterName, cfg, chatFilePath);
    }

    // 7. Save updated history
    await writeChatFile(chatFilePath, metadata, messages);
}

/**
 * Placeholder – replace with real generation call
 */
async function fakeGenerateWithTools(messages, options) {
    // In real code → call SillyTavern's generateOpenAIResponse or extension endpoint
    console.log('[fakeGenerate] Would send to LLM:', messages.slice(-3));

    return {
        content: "I'm thinking... (placeholder response)",
        tool_calls: [], // or [{ name: "search_web", arguments: {...} }]
    };
}

/**
 * Placeholder for tool execution
 */
async function executeToolCalls(toolCalls) {
    // TODO: integrate with SillyTavern tool system or MCP client
    console.log('[executeToolCalls] Would run:', toolCalls);
    return { status: 'not_implemented_yet' };
}

module.exports = {
    fireSubroutineTrigger,
};
