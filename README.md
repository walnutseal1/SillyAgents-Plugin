SillyAgents Plugin (Backend)
This is the server-side component for SillyAgents. It provides the core logic, file management, and API endpoints required for autonomous agentic loops and skill management within SillyTavern.

Note: To interact with this plugin via a user interface, you must also install the SillyAgents Extension.

## Installation
1. Plugin Placement: 
Copy the sillyagents-plugin folder into your SillyTavern plugins directory.

2. Enable Server Plugins: 
Ensure server-side plugins are enabled in your SillyTavern config.yaml file:

```YAML
enableServerPlugins: true
```

3. Install Dependencies: 
Navigate to the plugin directory and install the required Node.js packages:

```Bash
cd plugins/sillyagents-plugin
npm install
```
4. Restart: 
Restart your SillyTavern server to initialize the plugin.

## Architecture
The plugin manages data in the following directory structure:
```
data/sillyagents/subroutines/: Configuration files for automated loops.
data/sillyagents/skills/: Storage for imported and validated Agent Skills.
```
## Core Responsibilities
Lifecycle Management: Handles the creation, state, and deletion of subroutines.

Trigger Execution: Manages internal timers, tool polling logic, and incoming webhooks.

Skill Validation: Unpacks and validates ZIP files against the agentskills.io specification.

Macro Processing: Intercepts and replaces dynamic placeholders (Hardware, Context, and Tool calls).

## API Reference
Subroutines
```
GET /api/plugins/sillyagents/subroutines Returns a list of all configured subroutines.

POST /api/plugins/sillyagents/subroutines Creates a new subroutine. Body:

JSON
{
  "name": "Email Monitor",
  "triggerType": "tool",
  "config": {
    "interval": 300,
    "color": "#4A90E2",
    "autoQueue": true
  }
}
```
Skills
```
GET /api/plugins/sillyagents/skills Returns all installed skills.
```
```
POST /api/plugins/sillyagents/skills/import Imports a new skill from a base64 encoded ZIP. Body:
```
```JSON
{
  "zipData": "base64-string",
  "filename": "skill-name.zip"
}
```
## Development
Prerequisites:
Node.js 18+
SillyTavern (Latest Release)

Project Structure
```Plaintext
sillyagents-plugin/
├── index.js        # Main entry point and API routes
├── package.json    # Dependencies
└── README.md       # Backend documentation
```
## Testing
Start SillyTavern with the --debug flag.

Monitor the server console for "SillyAgents Plugin Loaded" logs.

Verify API responsiveness using a tool like Postman or cURL.

