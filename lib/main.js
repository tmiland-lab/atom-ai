const { CompositeDisposable } = require('atom')
const AiPanelItem = require('./ai-panel')

const PANEL_URI = 'atom-ai://panel'
const ISSUES_URL = 'https://github.com/tmiland-lab/atom-ai/issues'

function openExternal(url) {
  const electron = require('electron')
  const shell = electron.shell || (electron.remote && electron.remote.shell)
  if (shell) {
    shell.openExternal(url)
  }
}

function reportIssue() {
  const title = encodeURIComponent('atom-ai bug report')
  const body = encodeURIComponent(
    '**Atom version:** ' + atom.getVersion() +
    '\n**What happened:**\n\n\n**Steps to reproduce:**\n1. \n\n' +
    '**Panel output (if any):**\n```\n\n```\n'
  )
  openExternal(ISSUES_URL + '/new?title=' + title + '&body=' + body)
}

atom.deserializers.add({
  name: 'AtomAiPanel',
  deserialize: state => new AiPanelItem(state)
})

module.exports = {
  activate(state) {
    this.disposables = new CompositeDisposable()
    this.disposables.add(
      atom.workspace.addOpener(uri => {
        if (uri === PANEL_URI) {
          return new AiPanelItem(state && state.panel)
        }
      })
    )
    this.disposables.add(
      atom.commands.add('atom-workspace', {
        'atom-ai:toggle': () => atom.workspace.toggle(PANEL_URI),
        'atom-ai:send-selection': () => this.sendSelection(),
        'atom-ai:clear-context': () =>
          this.withPanel(panel => panel.clearContext()),
        'atom-ai:apply-diff': () =>
          this.withPanel(panel => panel.applyDiffs()),
        'atom-ai:report-issue': () => reportIssue()
      })
    )
  },

  deactivate() {
    this.disposables.dispose()
  },

  openPanel() {
    return atom.workspace.open(PANEL_URI, { searchAllPanes: true })
  },

  withPanel(fn) {
    return this.openPanel().then(fn)
  },

  sendSelection() {
    const editor = atom.workspace.getActiveTextEditor()
    if (!editor) {
      return
    }
    return this.openPanel().then(panel => {
      panel.attachContext(editor)
      panel.focusPrompt()
    })
  }
}
