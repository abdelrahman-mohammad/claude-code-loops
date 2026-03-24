When working on any file operation:
- NEVER edit or delete .env, .env.*, or any file containing secrets
- NEVER edit files inside .git/ directory
- NEVER edit lockfiles (package-lock.json, yarn.lock, pnpm-lock.yaml, Gemfile.lock, poetry.lock, composer.lock)
- NEVER edit files inside node_modules/, target/, dist/, build/, or .gradle/
- NEVER edit .gitignore without explicit user instruction
- If you need to modify environment variables, create or edit .env.example instead
