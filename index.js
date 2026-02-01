/**
 * SillyAgents Server Plugin – main entry point
 * Brings autonomous agentic loops and agent skills to SillyTavern
 */

const path = require('path');

const { initializeDirectories, PLUGIN_DIR, SKILLS_DIR } = require('./lib/paths');
const { initSubroutineRoutes } = require('./routes/subroutines');
const { initSkillRoutes } = require('./routes/skills');
const { initTriggerRoutes, shutdownTriggers } = require('./routes/triggers');

const info = {
    id: 'sillyagents',
    name: 'SillyAgents',
    description: 'Autonomous agentic loops and agent skills for SillyTavern',
};

/**
 * @param {import('express').Router} router
 */
async function init(router) {
    console.log('[SillyAgents] Initializing plugin...');

    await initializeDirectories();

    // Register route groups
    initSubroutineRoutes(router);
    initSkillRoutes(router, SKILLS_DIR);
    initTriggerRoutes(router);

    console.log('[SillyAgents] Plugin initialized successfully!');
}

/**
 * Clean up plugin resources
 */
async function exit() {
    console.log('[SillyAgents] Shutting down...');
    await shutdownTriggers();
    console.log('[SillyAgents] Shutdown complete.');
}

module.exports = {
    init,
    exit,
    info,
};
