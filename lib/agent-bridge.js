const { spawn } = require('child_process')

function withFiles(prompt, files) {
  if (!files.length) {
    return prompt
  }
  return prompt + '\n\n[Files]\n' + files.join('\n')
}

const AGENTS = {
  opencode: (prompt, files) => ({
    command: 'opencode',
    args: ['run', withFiles(prompt, files)]
  }),
  aider: (prompt, files) => ({
    command: 'aider',
    args: ['--yes-always', '--message', prompt].concat(files)
  }),
  claude: (prompt, files) => ({
    command: 'claude',
    args: ['-p', withFiles(prompt, files)]
  }),
  custom: (prompt, files, template) => {
    const parts = (template || '').trim().split(/\s+/).filter(Boolean)
    if (!parts.length) {
      return null
    }
    return {
      command: parts[0],
      args: parts.slice(1).concat([withFiles(prompt, files)])
    }
  }
}

function buildAgentProcess(options) {
  const { agent, customCommand, extraPath, prompt, files, cwd } = options
  const builder = AGENTS[agent] || AGENTS.custom
  const spec = builder(prompt, files || [], customCommand)
  if (!spec) {
    return { error: 'No command configured for agent "' + agent + '"' }
  }
  const env = Object.assign({}, process.env)
  if (extraPath) {
    env.PATH = extraPath + ':' + (env.PATH || '')
  }
  try {
    const child = spawn(spec.command, spec.args, { cwd: cwd, env: env })
    return { child: child, command: spec.command }
  } catch (error) {
    return { error: error.message }
  }
}

module.exports = { buildAgentProcess, withFiles }
