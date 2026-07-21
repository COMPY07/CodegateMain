# Upstream

- Repository: `https://github.com/vibegate07/secure_agent.git`
- Branch: `analysis`
- Imported commit: `5015c6e82ba1dfbf06e66830c23a5b5bd508b67f`

The source is vendored so the local studio can build and launch the MCP server without
cloning code at runtime. Generated `dist` files and `node_modules` remain ignored; the
studio development launcher installs dependencies when needed and builds the engine
from the checked-in TypeScript source before starting the local runtime.

The integration additionally constrains the public MCP surface to the six audit tools
used by the completion protocol and advertises `proof` as an object at the MCP boundary.
The generated JSON Schema and Ajv remain the semantic source of truth for Proof input.
