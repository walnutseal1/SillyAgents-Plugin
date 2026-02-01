const fs = require('fs').promises;
const path = require('path');
const AdmZip = require('adm-zip');

/**
 * @param {import('express').Router} router
 * @param {string} SKILLS_DIR
 */
function initSkillRoutes(router, SKILLS_DIR) {
    router.post('/skills/import', async (req, res) => {
        try {
            const { zipData, filename } = req.body;
            if (!zipData) return res.status(400).json({ error: 'No ZIP data' });

            const buffer = Buffer.from(zipData, 'base64');
            const zip = new AdmZip(buffer);

            const entries = zip.getEntries();
            const skillMd = entries.find(e => /SKILL\.(md|MD)$/.test(e.entryName));

            if (!skillMd) {
                return res.status(400).json({ error: 'No SKILL.md found in ZIP' });
            }

            const skillId = Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
            const skillDir = path.join(SKILLS_DIR, skillId);

            await fs.mkdir(skillDir, { recursive: true });
            zip.extractAllTo(skillDir, true);

            const skillMdContent = zip.readAsText(skillMd);
            const name = skillMdContent.match(/^#\s+(.+)$/m)?.[1]?.trim() || filename?.replace('.zip', '') || 'Unnamed Skill';

            const skillInfo = {
                id: skillId,
                name,
                description: '', // can be improved later
                path: skillDir,
                importedAt: new Date().toISOString(),
            };

            await fs.writeFile(
                path.join(skillDir, 'skill-info.json'),
                JSON.stringify(skillInfo, null, 2)
            );

            res.json({ success: true, skill: skillInfo });
        } catch (err) {
            console.error('[SillyAgents] skill import error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ... add GET /skills, GET /skills/:id, DELETE /skills/:id similarly
}

module.exports = { initSkillRoutes };
