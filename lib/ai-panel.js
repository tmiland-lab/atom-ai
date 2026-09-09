const { CompositeDisposable, TextEditor } = require('atom')
const path = require('path')
const { buildAgentProcess } = require('./agent-bridge')
const { applyDiffsFromOutput } = require('./apply-diff')

module.exports = class AiPanelItem {
  constructor(state) {
    this.context = (state && state.context) || { files: [] }
    this.busy = false
    this.disposables = new CompositeDisposable()
    this.element = this.buildDom()
    this.renderContext()
  }

  getURI() {
    return 'atom-ai://panel'
  }

  getTitle() {
    return 'Atom AI'
  }

  getIconName() {
    return 'zap'
  }

  getDefaultLocation() {
    return { line: 'bottom' }
  }

  getAllowedLocations() {
    return ['bottom', 'left', 'right']
  }

  serialize() {
    return { deserializer: 'AtomAiPanel', context: this.context }
  }

  getElement() {
    return this.element
  }

  buildDom() {
    const root = document.createElement('div')
    root.className = 'atom-ai'

    const contextBar = document.createElement('div')
    contextBar.className = 'atom-ai-context-bar'
    this.contextLabel = document.createElement('span')
    this.contextLabel.className = 'atom-ai-context-label icon-file-directory'
    const clearButton = document.createElement('button')
    clearButton.className = 'btn btn-xs'
    clearButton.textContent = 'Clear context'
    clearButton.addEventListener('click', () => this.clearContext())
    contextBar.appendChild(this.contextLabel)
    contextBar.appendChild(clearButton)

    this.output = document.createElement('pre')
    this.output.className = 'atom-ai-output'

    const inputRow = document.createElement('div')
    inputRow.className = 'atom-ai-input-row'

    this.promptEditor = atom.workspace.buildTextEditor({
      mini: true,
      placeholderText: 'Ask the agent… (enter to send)'
    })
    this.promptEditorElement = this.promptEditor.getElement()
    this.promptEditorElement.classList.add('atom-ai-prompt')
    this.promptEditorElement.setAttribute('tabindex', '-1')
    inputRow.appendChild(this.promptEditorElement)

    this.runButton = document.createElement('button')
    this.runButton.className = 'btn btn-primary atom-ai-run'
    this.runButton.textContent = 'Run'
    this.runButton.addEventListener('click', () => this.run())
    inputRow.appendChild(this.runButton)

    const diffButton = document.createElement('button')
    diffButton.className = 'btn atom-ai-apply'
    diffButton.textContent = 'Apply diff'
    diffButton.title = 'Apply unified diffs from the output to project files'
    diffButton.addEventListener('click', () => this.applyDiffs())
    inputRow.appendChild(diffButton)

    root.appendChild(contextBar)
    root.appendChild(this.output)
    root.appendChild(inputRow)

    this.disposables.add(
      atom.commands.add(this.promptEditorElement, {
        'core:confirm': () => this.run()
      })
    )
    this.disposables.add(
      this.promptEditor.onDidChange(() => this.autoGrow())
    )
    this.autoGrow()
    return root
  }

  autoGrow() {
    const lines = Math.max(1, this.promptEditor.getLineCount())
    this.promptEditorElement.style.height = lines * this.promptEditor.getLineHeightInPixels() + 'px'
  }

  focusPrompt() {
    this.promptEditorElement.focus()
  }

  attachContext(editor) {
    const filePath = editor.getPath()
    const files = filePath ? [filePath] : []
    const selection = editor.getSelectedText()
    const context = { files: files, selection: selection || null }
    if (filePath && !selection) {
      context.note = 'no selection — the agent receives the file path only'
    }
    this.context = context
    this.renderContext()
  }

  clearContext() {
    this.context = { files: [] }
    this.renderContext()
  }

  renderContext() {
    const cwd = this.projectRoot()
    const names = this.context.files.map(f =>
      cwd ? path.relative(cwd, f) || f : path.basename(f || '')
    )
    const bits = []
    if (names.length) {
      bits.push('files: ' + names.join(', '))
    }
    if (this.context.selection) {
      bits.push('selection: ' + this.context.selection.length + ' chars')
    }
    if (this.context.note) {
      bits.push(this.context.note)
    }
    this.contextLabel.textContent = bits.length ? bits.join('  ·  ') : 'no context attached'
  }

  projectRoot() {
    const dirs = atom.project.getPaths()
    if (dirs.length) {
      return dirs[0]
    }
    if (this.context.files.length) {
      return path.dirname(this.context.files[0])
    }
    return null
  }

  appendChunk(text) {
    this.output.textContent += text
    this.output.scrollTop = this.output.scrollHeight
  }

  run() {
    if (this.busy) {
      return
    }
    const prompt = this.promptEditor.getText().trim()
    if (!prompt) {
      this.focusPrompt()
      return
    }
    const agent = atom.config.get('atom-ai.agent')
    const customCommand = atom.config.get('atom-ai.customCommand')
    const extraPath = atom.config.get('atom-ai.extraPath')
    const cwd = this.projectRoot() || process.cwd()

    const header =
      '> ' + agent + ' · ' + new Date().toLocaleTimeString() + '\n'
    this.appendChunk(header)
    this.setBusy(true)

    const started = Date.now()
    const result = buildAgentProcess({
      agent: agent,
      customCommand: customCommand,
      extraPath: extraPath,
      prompt: prompt,
      files: this.context.files,
      cwd: cwd
    })

    if (result.error) {
      this.appendChunk(result.error + '\n')
      this.setBusy(false)
      return
    }

    const child = result.child
    child.stdout.on('data', chunk => this.appendChunk(chunk.toString()))
    child.stderr.on('data', chunk => this.appendChunk(chunk.toString()))
    child.on('error', error => {
      this.appendChunk(
        '\n[atom-ai] could not run "' + result.command + '": ' +
          error.message +
          '\n[atom-ai] hint: set Extra PATH in settings if the agent is not on the desktop-launch PATH\n'
      )
      this.setBusy(false)
    })
    child.on('close', code => {
      const seconds = ((Date.now() - started) / 1000).toFixed(1)
      this.appendChunk('\n[atom-ai] exited with code ' + code + ' after ' + seconds + 's\n\n')
      this.colorizeDiffs()
      this.setBusy(false)
    })
  }

  colorizeDiffs() {
    const lines = this.output.textContent.split('\n')
    const fragment = document.createDocumentFragment()
    for (const line of lines) {
      const span = document.createElement('span')
      if (/^\+(?!\+\+)/.test(line)) {
        span.className = 'atom-ai-diff-add'
      } else if (/^-(?!-)/.test(line)) {
        span.className = 'atom-ai-diff-del'
      } else if (/^@@/.test(line)) {
        span.className = 'atom-ai-diff-hunk'
      }
      span.textContent = line + '\n'
      fragment.appendChild(span)
    }
    this.output.textContent = ''
    this.output.appendChild(fragment)
    this.output.scrollTop = this.output.scrollHeight
  }

  applyDiffs() {
    const cwd = this.projectRoot()
    if (!cwd) {
      this.appendChunk('[atom-ai] no project open — cannot resolve diff paths\n')
      return
    }
    const report = applyDiffsFromOutput(this.output.textContent, [cwd])
    this.appendChunk(
      '[atom-ai] diff apply: ' + report.applied + ' applied, ' +
        report.failed.length + ' failed\n' +
        report.failed.map(f => '  - ' + f).join('\n') + '\n'
    )
  }

  setBusy(busy) {
    this.busy = busy
    this.runButton.textContent = busy ? 'Running…' : 'Run'
    this.runButton.disabled = busy
  }

  dispose() {
    this.disposables.dispose()
    if (this.promptEditor && !this.promptEditor.isDestroyed()) {
      this.promptEditor.destroy()
    }
  }
}
