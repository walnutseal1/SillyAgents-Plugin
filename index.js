/**
 * SillyAgents Server Plugin
 * Brings autonomous agentic loops and agent skills to SillyTavern
 */

const path = require('path');
const fs = require('fs').promises;

// Plugin metadata
const info = {
    id: 'sillyagents',
    name: 'SillyAgents',
    description: 'Autonomous agentic loops and agent skills for SillyTavern',
};

// Storage paths
let PLUGIN_DIR;
let SKILLS_DIR;
let DATA_ROOT;

// Active triggers management
const activeTriggers = new Map(); // key: `${characterName}|${chatName}`

// Macros are handled by the extension side's macros.js

/**
 * Initialize the plugin
 * @param {import('express').Router} router - Express router
 * @returns {Promise<void>}
 */
async function init(router) {
    console.log('[SillyAgents] Initializing plugin...');
    
    // Get the global DATA_ROOT from SillyTavern
    DATA_ROOT = path.join(process.cwd(), 'data');
    
    // Set up storage directories
    PLUGIN_DIR = path.join(DATA_ROOT, 'sillyagents');
    SKILLS_DIR = path.join(PLUGIN_DIR, 'skills');
    
    // Create directories if they don't exist
    await ensureDirectories();
    
    // Register API routes
    registerSubroutineRoutes(router);
    registerSkillRoutes(router);
    registerMacroRoutes(router);
    registerTriggerRoutes(router);
    
    console.log('[SillyAgents] Plugin initialized successfully!');
    return Promise.resolve();
}

/**
 * Clean up plugin resources
 * @returns {Promise<void>}
 */
async function exit() {
    console.log('[SillyAgents] Shutting down...');
    // Stop all active triggers
    for (const [key, job] of activeTriggers.entries()) {
        if (job.type === 'interval') {
            clearInterval(job.timer);
        }
        activeTriggers.delete(key);
    }
    return Promise.resolve();
}

/**
 * Ensure all required directories exist
 */
async function ensureDirectories() {
    const dirs = [PLUGIN_DIR, SKILLS_DIR];
    
    for (const dir of dirs) {
        try {
            await fs.access(dir);
        } catch {
            await fs.mkdir(dir, { recursive: true });
            console.log(`[SillyAgents] Created directory: ${dir}`);
        }
    }
}

/**
 * Get the path to a character's chat directory
 * @param {string} characterName - Name of the character
 * @param {Object} directories - User directories object from req.user.directories
 * @returns {string} Path to character's chat directory
 */
function getCharacterChatDir(characterName, directories) {
    const chatsRoot = directories?.chats || path.join(DATA_ROOT, 'default-user', 'chats');
    return path.join(chatsRoot, characterName);
}

/**
 * Read a chat file and parse its content
 * @param {string} chatFilePath - Path to the chat file
 * @returns {Promise<Object>} Parsed chat data with metadata and messages
 */
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

/**
 * Write chat data to a file in JSONL format
 * @param {string} chatFilePath - Path to the chat file
 * @param {Object} metadata - Chat metadata (first line)
 * @param {Array} messages - Array of message objects
 */
async function writeChatFile(chatFilePath, metadata, messages) {
    const lines = [
        JSON.stringify(metadata),
        ...messages.map(msg => JSON.stringify(msg))
    ];
    
    await fs.writeFile(chatFilePath, lines.join('\n') + '\n', 'utf-8');
}

/**
 * Check if a chat is a subroutine by examining its metadata
 * @param {Object} metadata - Chat metadata object
 * @returns {boolean} True if chat is a subroutine
 */
function isSubroutine(metadata) {
    return metadata?.chat_metadata?.subroutine === true;
}

/**
 * Create subroutine metadata structure
 * @param {Object} config - Subroutine configuration
 * @returns {Object} Metadata object for subroutine
 */
function createSubroutineMetadata(config) {
    return {
        subroutine: true,
        subroutine_config: {
            id: config.id || generateId(),
            triggerType: config.triggerType,
            active: config.active ?? false,
            // Trigger prompt
            triggerText: config.triggerText || null,           // ← main addition
            triggerRole: config.triggerRole || "user",         // "user" | "system" | "assistant"
            // optional fallback if triggerText is empty
            fallbackTriggerText: config.fallbackTriggerText,
            // Trigger-specific config
            interval: config.interval, // for time-based and tool-based
            toolName: config.toolName, // for tool-based
            toolCondition: config.toolCondition, // for tool-based
            
            // Auto-queue mode
            autoQueue: config.autoQueue ?? false,
            autoQueuePrompt: config.autoQueuePrompt,
            
            // Other configs
            useSummary: config.useSummary ?? false,
            color: config.color || '#6366f1', // Default indigo
            useLorebooks: config.useLorebooks !== false, // Default true
            useExampleMessages: config.useExampleMessages !== false, // Default true
            
            // Timestamps
            createdAt: config.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        }
    };
}

/**
 * Register subroutine management routes
 * @param {import('express').Router} router
 */
function registerSubroutineRoutes(router) {
    // Create a new subroutine
    router.post('/subroutines', async (req, res) => {
        try {
            const { characterName, chatName, triggerType, config } = req.body;
            
            // Validate required fields
            if (!characterName || !chatName || !triggerType) {
                return res.status(400).json({ 
                    error: 'Missing required fields: characterName, chatName, triggerType' 
                });
            }
            
            // Validate trigger type
            const validTriggers = ['time-based', 'tool-based', 'api-based'];
            if (!validTriggers.includes(triggerType)) {
                return res.status(400).json({
                    error: `Invalid trigger type. Must be one of: ${validTriggers.join(', ')}`
                });
            }
            
            // Validate tool-based trigger config
            if (triggerType === 'tool-based') {
                if (!config?.toolName) {
                    return res.status(400).json({
                        error: 'tool-based triggers require config.toolName'
                    });
                }
            }
            
            // Validate time-based trigger config
            if (triggerType === 'time-based') {
                if (!config?.interval || config.interval < 1) {
                    return res.status(400).json({
                        error: 'time-based triggers require config.interval (in seconds, >= 1)'
                    });
                }
            }
            
            // Validate triggerText for non-api-based
            if (triggerType !== 'api-based' && !config?.triggerText?.trim()) {
                return res.status(400).json({
                    error: 'triggerText is required for time-based and tool-based triggers'
                });
            }
            
            // Get user's chat directory
            const chatDir = getCharacterChatDir(characterName, req.user?.directories);
            await fs.mkdir(chatDir, { recursive: true });
            
            // Create chat file path
            const chatFileName = `${chatName}.jsonl`;
            const chatFilePath = path.join(chatDir, chatFileName);
            
            // Check if chat already exists
            try {
                await fs.access(chatFilePath);
                return res.status(409).json({
                    error: 'A chat with this name already exists for this character'
                });
            } catch {
                // File doesn't exist, continue
            }
            
            // Create subroutine metadata
            const subroutineConfig = {
                id: generateId(),
                triggerType,
                ...config,
            };
            
            const metadata = {
                user_name: config.userName || 'User',
                character_name: characterName,
                create_date: new Date().toISOString(),
                chat_metadata: createSubroutineMetadata(subroutineConfig),
            };
            
            // Write the chat file with just the metadata (no messages yet)
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
        } catch (error) {
            console.error('[SillyAgents] Error creating subroutine:', error);
            res.status(500).json({ error: error.message });
        }
    });
    
    // List all subroutines
    router.get('/subroutines', async (req, res) => {
        try {
            const chatsRoot = req.user?.directories?.chats || path.join(DATA_ROOT, 'default-user', 'chats');
            const subroutines = [];
            
            // Read all character directories
            const characterDirs = await fs.readdir(chatsRoot);
            
            for (const characterName of characterDirs) {
                const characterPath = path.join(chatsRoot, characterName);
                const stats = await fs.stat(characterPath);
                
                if (!stats.isDirectory()) continue;
                
                // Read all chat files in character directory
                const chatFiles = await fs.readdir(characterPath);
                
                for (const chatFile of chatFiles) {
                    if (!chatFile.endsWith('.jsonl')) continue;
                    
                    const chatPath = path.join(characterPath, chatFile);
                    
                    try {
                        const { metadata } = await readChatFile(chatPath);
                        
                        // Check if this chat is a subroutine
                        if (isSubroutine(metadata)) {
                            subroutines.push({
                                characterName,
                                chatName: chatFile.replace('.jsonl', ''),
                                filePath: chatFile,
                                ...metadata.chat_metadata.subroutine_config,
                            });
                        }
                    } catch (error) {
                        console.error(`[SillyAgents] Error reading chat ${chatFile}:`, error);
                        // Continue to next chat file
                    }
                }
            }
            
            res.json({ subroutines });
        } catch (error) {
            console.error('[SillyAgents] Error listing subroutines:', error);
            res.status(500).json({ error: error.message });
        }
    });
    
    // Get a specific subroutine
    router.get('/subroutines/:characterName/:chatName', async (req, res) => {
        try {
            const { characterName, chatName } = req.params;
            
            const chatDir = getCharacterChatDir(characterName, req.user?.directories);
            const chatFilePath = path.join(chatDir, `${chatName}.jsonl`);
            
            const { metadata, messages } = await readChatFile(chatFilePath);
            
            if (!isSubroutine(metadata)) {
                return res.status(404).json({ 
                    error: 'This chat is not a subroutine' 
                });
            }
            
            res.json({ 
                subroutine: {
                    characterName,
                    chatName,
                    ...metadata.chat_metadata.subroutine_config,
                },
                messageCount: messages.length,
            });
        } catch (error) {
            if (error.code === 'ENOENT') {
                return res.status(404).json({ error: 'Subroutine not found' });
            }
            console.error('[SillyAgents] Error getting subroutine:', error);
            res.status(500).json({ error: error.message });
        }
    });
    
    // Update a subroutine
    router.put('/subroutines/:characterName/:chatName', async (req, res) => {
        try {
            const { characterName, chatName } = req.params;
            const updates = req.body;
            
            const chatDir = getCharacterChatDir(characterName, req.user?.directories);
            const chatFilePath = path.join(chatDir, `${chatName}.jsonl`);
            
            // Read existing chat
            const { metadata, messages } = await readChatFile(chatFilePath);
            
            if (!isSubroutine(metadata)) {
                return res.status(404).json({ 
                    error: 'This chat is not a subroutine' 
                });
            }
            
            // Update subroutine config
            const config = metadata.chat_metadata.subroutine_config;
            Object.assign(config, updates);
            config.updatedAt = new Date().toISOString();
            
            // Write back to file
            await writeChatFile(chatFilePath, metadata, messages);
            
            res.json({ 
                success: true, 
                subroutine: {
                    characterName,
                    chatName,
                    ...config,
                }
            });
        } catch (error) {
            if (error.code === 'ENOENT') {
                return res.status(404).json({ error: 'Subroutine not found' });
            }
            console.error('[SillyAgents] Error updating subroutine:', error);
            res.status(500).json({ error: error.message });
        }
    });
    
    // Delete a subroutine
    router.delete('/subroutines/:characterName/:chatName', async (req, res) => {
        try {
            const { characterName, chatName } = req.params;
            
            const chatDir = getCharacterChatDir(characterName, req.user?.directories);
            const chatFilePath = path.join(chatDir, `${chatName}.jsonl`);
            
            // Verify it's a subroutine before deleting
            const { metadata } = await readChatFile(chatFilePath);
            
            if (!isSubroutine(metadata)) {
                return res.status(400).json({ 
                    error: 'Cannot delete: this chat is not a subroutine' 
                });
            }
            
            await fs.unlink(chatFilePath);
            
            res.json({ success: true });
        } catch (error) {
            if (error.code === 'ENOENT') {
                return res.status(404).json({ error: 'Subroutine not found' });
            }
            console.error('[SillyAgents] Error deleting subroutine:', error);
            res.status(500).json({ error: error.message });
        }
    });
}

/**
 * Register skill management routes
 * @param {import('express').Router} router
 */
function registerSkillRoutes(router) {
    const AdmZip = require('adm-zip');
    
    // Import a skill from ZIP
    router.post('/skills/import', async (req, res) => {
        try {
            // TODO: Handle multipart/form-data upload
            // For now, expect base64 encoded ZIP in body
            const { zipData, filename } = req.body;
            
            if (!zipData) {
                return res.status(400).json({ error: 'No ZIP data provided' });
            }
            
            // Decode base64
            const buffer = Buffer.from(zipData, 'base64');
            const zip = new AdmZip(buffer);
            
            // Check for SKILL.md
            const entries = zip.getEntries();
            const skillMdEntry = entries.find(e => 
                e.entryName.endsWith('SKILL.md') || e.entryName.endsWith('SKILL.MD')
            );
            
            if (!skillMdEntry) {
                return res.status(400).json({ 
                    error: 'Invalid skill ZIP: SKILL.md not found' 
                });
            }
            
            // Extract skill name from SKILL.md or filename
            const skillName = filename?.replace('.zip', '') || 
                             path.basename(skillMdEntry.entryName, '.md');
            const skillId = generateId();
            const skillDir = path.join(SKILLS_DIR, skillId);
            
            // Extract ZIP to skill directory
            await fs.mkdir(skillDir, { recursive: true });
            zip.extractAllTo(skillDir, true);
            
            // Parse SKILL.md for metadata
            const skillMdContent = zip.readAsText(skillMdEntry);
            const metadata = parseSkillMetadata(skillMdContent);
            
            // Save skill info
            const skillInfo = {
                id: skillId,
                name: metadata.name || skillName,
                description: metadata.description || '',
                path: skillDir,
                importedAt: new Date().toISOString(),
            };
            
            const infoPath = path.join(skillDir, 'skill-info.json');
            await fs.writeFile(infoPath, JSON.stringify(skillInfo, null, 2));
            
            res.json({ success: true, skill: skillInfo });
        } catch (error) {
            console.error('[SillyAgents] Error importing skill:', error);
            res.status(500).json({ error: error.message });
        }
    });
    
    // List all skills
    router.get('/skills', async (req, res) => {
        try {
            const dirs = await fs.readdir(SKILLS_DIR);
            const skills = [];
            
            for (const dir of dirs) {
                const infoPath = path.join(SKILLS_DIR, dir, 'skill-info.json');
                try {
                    const content = await fs.readFile(infoPath, 'utf-8');
                    skills.push(JSON.parse(content));
                } catch {
                    // Skip directories without skill-info.json
                }
            }
            
            res.json({ skills });
        } catch (error) {
            console.error('[SillyAgents] Error listing skills:', error);
            res.status(500).json({ error: error.message });
        }
    });
    
    // Get skill details
    router.get('/skills/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const skillDir = path.join(SKILLS_DIR, id);
            const infoPath = path.join(skillDir, 'skill-info.json');
            
            const content = await fs.readFile(infoPath, 'utf-8');
            const skillInfo = JSON.parse(content);
            
            // Also read SKILL.md content
            const skillMdPath = path.join(skillDir, 'SKILL.md');
            const skillMdContent = await fs.readFile(skillMdPath, 'utf-8');
            
            res.json({ 
                skill: {
                    ...skillInfo,
                    content: skillMdContent,
                }
            });
        } catch (error) {
            console.error('[SillyAgents] Error getting skill:', error);
            res.status(500).json({ error: error.message });
        }
    });
    
    // Delete a skill
    router.delete('/skills/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const skillDir = path.join(SKILLS_DIR, id);
            
            // Recursively delete directory
            await fs.rm(skillDir, { recursive: true, force: true });
            
            res.json({ success: true });
        } catch (error) {
            console.error('[SillyAgents] Error deleting skill:', error);
            res.status(500).json({ error: error.message });
        }
    });
}

/**
 * Register trigger management routes
 * @param {import('express').Router} router
 */
function registerTriggerRoutes(router) {
    // Start a trigger
    router.post('/triggers/:characterName/:chatName/start', async (req, res) => {
        try {
            const { characterName, chatName } = req.params;
            const key = `${characterName}|${chatName}`;
            
            const chatDir = getCharacterChatDir(characterName, req.user?.directories);
            const chatFilePath = path.join(chatDir, `${chatName}.jsonl`);
            
            const { metadata } = await readChatFile(chatFilePath);
            const cfg = metadata.chat_metadata.subroutine_config;
            
            if (activeTriggers.has(key)) {
                return res.status(409).json({ error: 'Trigger already running' });
            }
            
            if (!cfg.active) {
                cfg.active = true;
                metadata.chat_metadata.subroutine_config = cfg; // Update in memory
                await writeChatFile(chatFilePath, metadata, []); // Persist active state
            }
            
            if (cfg.triggerType === 'time-based') {
                const intervalMs = cfg.interval * 1000;
                const timer = setInterval(async () => {
                    try {
                        await fireSubroutineTrigger(characterName, chatName, cfg, chatFilePath, metadata);
                    } catch (err) {
                        console.error(`[SillyAgents] Trigger error for ${key}:`, err);
                    }
                }, intervalMs);
                
                activeTriggers.set(key, { timer, type: 'interval' });
            } else if (cfg.triggerType === 'tool-based') {
                // TODO: Implement tool polling
                // Similar to time-based, but check toolCondition first
                return res.status(501).json({ error: 'tool-based triggers not yet implemented' });
            } else if (cfg.triggerType === 'api-based') {
                // TODO: Mark active for webhook handling
                activeTriggers.set(key, { type: 'api' });
            }
            
            res.json({ success: true, status: 'started' });
        } catch (error) {
            console.error('[SillyAgents] Error starting trigger:', error);
            res.status(500).json({ error: error.message });
        }
    });
    
    // Stop a trigger
    router.post('/triggers/:characterName/:chatName/stop', async (req, res) => {
        try {
            const { characterName, chatName } = req.params;
            const key = `${characterName}|${chatName}`;
            
            const job = activeTriggers.get(key);
            if (job) {
                if (job.type === 'interval') {
                    clearInterval(job.timer);
                }
                activeTriggers.delete(key);
            }
            
            // Optionally set active=false and persist
            const chatDir = getCharacterChatDir(characterName, req.user?.directories);
            const chatFilePath = path.join(chatDir, `${chatName}.jsonl`);
            const { metadata, messages } = await readChatFile(chatFilePath);
            metadata.chat_metadata.subroutine_config.active = false;
            await writeChatFile(chatFilePath, metadata, messages);
            
            res.json({ success: true, status: 'stopped' });
        } catch (error) {
            console.error('[SillyAgents] Error stopping trigger:', error);
            res.status(500).json({ error: error.message });
        }
    });
    
    // TODO: Add webhook route for api-based, e.g., POST /triggers/api/:characterName/:chatName
}

/**
 * Fire the subroutine trigger: append user message, generate response, handle auto-queue
 * @param {string} characterName
 * @param {string} chatName
 * @param {Object} cfg - subroutine_config
 * @param {string} chatFilePath
 * @param {Object} metadata
 */
async function fireSubroutineTrigger(characterName, chatName, cfg, chatFilePath, metadata) {
    // Note: Requires SillyTavern internal modules for generation
    // Adjust paths as needed; assuming plugin can require them
    const { getStatusAsync } = require('../server/openai'); // Example: to check backend
    const { generateOpenAIResponse } = require('../server/openai-stream'); // Or equivalent generator
    const { getRequestPrompt } = require('../server/prompts'); // Prompt builder
    
    // Load current messages
    let { messages } = await readChatFile(chatFilePath);
    
    // Append trigger as user message
    const triggerMsg = {
        name: metadata.user_name,
        mes: cfg.triggerText || cfg.fallbackTriggerText || '(Trigger activated)',
        is_user: true,
        is_system: cfg.triggerRole === 'system',
        sendDate: new Date().toISOString(),
    };
    messages.push(triggerMsg);
    
    // Build full prompt (respect configs)
    // TODO: Fetch character card/system prompt from SillyTavern storage
    const characterSystemPrompt = 'You are an autonomous agent.'; // Placeholder
    
    const promptData = {
        messages, // Full history
        system_prompt: characterSystemPrompt,
        // Apply configs
        use_lorebooks: cfg.useLorebooks,
        use_examples: cfg.useExampleMessages,
        // TODO: Implement summarization if useSummary
        // e.g., if (cfg.useSummary) messages = await summarizeMessages(messages);
    };
    const fullPrompt = getRequestPrompt(promptData); // Assumes this builds {role, content} array
    
    // Check if backend supports tools/chat completions
    const status = await getStatusAsync();
    if (!status || !status.toolSupport) {
        console.warn('[SillyAgents] Backend may not support tools');
        // TODO: Warn via event or log
    }
    
    // Generate response
    const generationOptions = {
        // User settings: max_tokens, temperature, etc. - fetch from global or user
        tools: true, // Enable tool calling
    };
    const response = await generateOpenAIResponse(fullPrompt, generationOptions);
    
    // Parse response (assume OpenAI-like format)
    const aiContent = response.choices[0].message.content;
    const toolCalls = response.choices[0].message.tool_calls || [];
    
    // Append AI message
    const aiMsg = {
        name: metadata.character_name,
        mes: aiContent,
        is_user: false,
        sendDate: new Date().toISOString(),
    };
    messages.push(aiMsg);
    
    // Handle tools
    if (toolCalls.length > 0) {
        // TODO: Execute tools (integrate with SillyTavern's tool system or custom)
        const toolResults = await executeTools(toolCalls); // Placeholder
        const toolResponseMsg = {
            name: metadata.user_name,
            mes: JSON.stringify(toolResults), // Or formatted
            is_user: true,
            sendDate: new Date().toISOString(),
        };
        messages.push(toolResponseMsg);
        // Recurse to generate next response
        return fireSubroutineTrigger(characterName, chatName, cfg, chatFilePath, metadata);
    } else if (cfg.autoQueue) {
        // Auto-queue if no tools called
        const queueMsg = {
            name: metadata.user_name,
            mes: cfg.autoQueuePrompt || 'Continue your reasoning and take the next action.',
            is_user: true,
            sendDate: new Date().toISOString(),
        };
        messages.push(queueMsg);
        // Recurse
        return fireSubroutineTrigger(characterName, chatName, cfg, chatFilePath, metadata);
    }
    
    // Save updated chat
    await writeChatFile(chatFilePath, metadata, messages);
}

/**
 * Placeholder for tool execution
 * @param {Array} toolCalls
 * @returns {Promise<Object>} Results
 */
async function executeTools(toolCalls) {
    // TODO: Implement tool calling integration
    // e.g., Call SillyTavern extensions or custom skills
    return {}; // Stub
}

/**
 * Parse metadata from SKILL.md content
 * @param {string} content - SKILL.md content
 * @returns {Object} Parsed metadata
 */
function parseSkillMetadata(content) {
    const metadata = {};
    
    // Extract name from front matter or first heading
    const nameMatch = content.match(/^#\s+(.+)$/m);
    if (nameMatch) {
        metadata.name = nameMatch[1].trim();
    }
    
    // Extract description (first paragraph after metadata)
    const descMatch = content.match(/^(?:---[\s\S]*?---\s*)?(?:#[^\n]*\n+)?(.+?)(?:\n\n|\n#|$)/m);
    if (descMatch) {
        metadata.description = descMatch[1].trim();
    }
    
    return metadata;
}

/**
 * Generate a unique ID
 * @returns {string}
 */
function generateId() {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Placeholder for macro routes if needed
function registerMacroRoutes(router) {
    // TODO: If server-side macro support is required
}

module.exports = {
    init,
    exit,
    info,
};
