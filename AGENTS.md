# Tractor Project Memory

## Repo Cleanliness Policy

**WHITELIST.md** defines the only files that should be tracked in this repo:
- `webapp/` - Frontend React app
- `webapi/` - Web API routes
- `src/` - Core game engine
- `tests/` - Test files
- `run-multi-round-logs.ts` - Log runner script
- `web-deal-service.ts` - Main web service
- `README.md`, `package.json`, `bun.lock`, `tsconfig.json`
- `WHITELIST.md` - This whitelist document
- `AGENTS.md` - This file

## Important Rules
- **DO NOT** add new AI summary files (CLAUDE.md, AI_*.md, etc.) to git
- **DO NOT** add debug files (cli.ts, debug*.ts) to git
- **DO NOT** add game log directories (game-logs-*/) to git
- Keep the repo clean - only whitelisted files should be tracked

## Key Fixes to Remember
- Game log level display bug was fixed in `web-deal-service.ts` (saveGameLog function)
- The issue was showing next game's level instead of current game's level
