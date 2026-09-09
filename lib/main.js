const { CompositeDisposable } = require('atom')
const AiPanelItem = require('./ai-panel')

const PANEL_URI = 'atom-ai://panel'

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
          this.withPanel(panel => panel.applyDiffs())
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
