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
let SUBROUTINES_DIR;
let SKILLS_DIR;

/**
 * Initialize the plugin
 * @param {import('express').Router} router - Express router
 * @returns {Promise<void>}
 */
async function init(router) {
    console.log('[SillyAgents] Initializing plugin...');
    
    // Set up storage directories
    PLUGIN_DIR = path.join(process.cwd(), 'data', 'sillyagents');
    SUBROUTINES_DIR = path.join(PLUGIN_DIR, 'subroutines');
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
    // TODO: Stop all active triggers/timers
    return Promise.resolve();
}

/**
 * Ensure all required directories exist
 */
async function ensureDirectories() {
    const dirs = [PLUGIN_DIR, SUBROUTINES_DIR, SKILLS_DIR];
    
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
 * Register subroutine management routes
 * @param {import('express').Router} router
 */
function registerSubroutineRoutes(router) {
    // Create a new subroutine
    router.post('/subroutines', async (req, res) => {
        try {
            const { name, triggerType, config } = req.body;
            
            // Validate required fields
            if (!name || !triggerType) {
                return res.status(400).json({ 
                    error: 'Missing required fields: name, triggerType' 
                });
            }
            
            // TODO: Create subroutine
            const subroutine = {
                id: generateId(),
                name,
                triggerType,
                config: config || {},
                createdAt: new Date().toISOString(),
                active: false,
            };
            
            // Save to disk
            const filePath = path.join(SUBROUTINES_DIR, `${subroutine.id}.json`);
            await fs.writeFile(filePath, JSON.stringify(subroutine, null, 2));
            
            res.json({ success: true, subroutine });
        } catch (error) {
            console.error('[SillyAgents] Error creating subroutine:', error);
            res.status(500).json({ error: error.message });
        }
    });
    
    // List all subroutines
    router.get('/subroutines', async (req, res) => {
        try {
            const files = await fs.readdir(SUBROUTINES_DIR);
            const subroutines = [];
            
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const content = await fs.readFile(
                        path.join(SUBROUTINES_DIR, file), 
                        'utf-8'
                    );
                    subroutines.push(JSON.parse(content));
                }
            }
            
            res.json({ subroutines });
        } catch (error) {
            console.error('[SillyAgents] Error listing subroutines:', error);
            res.status(500).json({ error: error.message });
        }
    });
    
    // Get a specific subroutine
    router.get('/subroutines/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const filePath = path.join(SUBROUTINES_DIR, `${id}.json`);
            const content = await fs.readFile(filePath, 'utf-8');
            
            res.json({ subroutine: JSON.parse(content) });
        } catch (error) {
            if (error.code === 'ENOENT') {
                return res.status(404).json({ error: 'Subroutine not found' });
            }
            console.error('[SillyAgents] Error getting subroutine:', error);
            res.status(500).json({ error: error.message });
        }
    });
    
    // Update a subroutine
    router.put('/subroutines/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const updates = req.body;
            const filePath = path.join(SUBROUTINES_DIR, `${id}.json`);
            
            // Read existing subroutine
            const content = await fs.readFile(filePath, 'utf-8');
            const subroutine = JSON.parse(content);
            
            // Update fields
            Object.assign(subroutine, updates);
            subroutine.updatedAt = new Date().toISOString();
            
            // Save back to disk
            await fs.writeFile(filePath, JSON.stringify(subroutine, null, 2));
            
            res.json({ success: true, subroutine });
        } catch (error) {
            console.error('[SillyAgents] Error updating subroutine:', error);
            res.status(500).json({ error: error.message });
        }
    });
    
    // Delete a subroutine
    router.delete('/subroutines/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const filePath = path.join(SUBROUTINES_DIR, `${id}.json`);
            
            await fs.unlink(filePath);
            
            res.json({ success: true });
        } catch (error) {
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
 * Register macro-related routes
 * @param {import('express').Router} router
 */
function registerMacroRoutes(router) {
    // Process macros in text
    router.post('/macros/process', async (req, res) => {
        try {
            const { text, context } = req.body;
            
            // TODO: Implement macro processing
            const processed = text; // Placeholder
            
            res.json({ processed });
        } catch (error) {
            console.error('[SillyAgents] Error processing macros:', error);
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
    router.post('/triggers/:id/start', async (req, res) => {
        try {
            const { id } = req.params;
            
            // TODO: Start the trigger based on type
            
            res.json({ success: true });
        } catch (error) {
            console.error('[SillyAgents] Error starting trigger:', error);
            res.status(500).json({ error: error.message });
        }
    });
    
    // Stop a trigger
    router.post('/triggers/:id/stop', async (req, res) => {
        try {
            const { id } = req.params;
            
            // TODO: Stop the trigger
            
            res.json({ success: true });
        } catch (error) {
            console.error('[SillyAgents] Error stopping trigger:', error);
            res.status(500).json({ error: error.message });
        }
    });
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

module.exports = {
    init,
    exit,
    info,
};
