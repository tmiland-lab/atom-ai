const { Range } = require('atom')

function extractDiffBlocks(text) {
  const blocks = []
  const fence = /```(?:diff)?\n([\s\S]*?)```/g
  let match
  while ((match = fence.exec(text))) {
    if (/^(diff --git|--- a\/)/m.test(match[1])) {
      blocks.push(match[1])
    }
  }
  if (!blocks.length && /^(diff --git|--- a\/)/m.test(text)) {
    blocks.push(text)
  }
  return blocks
}

// Minimal unified-diff parser: [{file, hunks: [{oldLines, newLines}]}]
function parseDiff(block) {
  const files = []
  let current = null
  let hunk = null
  for (const line of block.split('\n')) {
    if (line.startsWith('--- ')) {
      current = { file: line.slice(4).replace(/^a\//, '').trim(), hunks: [] }
    } else if (line.startsWith('+++ ')) {
      if (current) {
        current.file = line.slice(4).replace(/^b\//, '').trim() || current.file
      }
    } else if (line.startsWith('diff --git')) {
      // header only
    } else if (line.startsWith('@@')) {
      if (current && hunk) {
        current.hunks.push(hunk)
      }
      hunk = { oldLines: [], newLines: [] }
    } else if (line.startsWith('\\')) {
      // "\ No newline at end of file"
    } else if (hunk) {
      if (line.startsWith('+')) {
        hunk.newLines.push(line.slice(1))
      } else if (line.startsWith('-')) {
        hunk.oldLines.push(line.slice(1))
      } else {
        hunk.oldLines.push(line.slice(1))
        hunk.newLines.push(line.slice(1))
      }
    }
  }
  if (current && hunk) {
    current.hunks.push(hunk)
  }
  return files.filter(f => f.file && f.hunks.length)
}

function locateOldBlock(bufferText, oldLines) {
  if (!oldLines.length) {
    return null
  }
  const block = oldLines.join('\n')
  let index = bufferText.indexOf(block)
  if (index !== -1) {
    return { start: index, end: index + block.length }
  }
  const lines = bufferText.split('\n')
  if (lines.length >= oldLines.length) {
    for (let start = 0; start <= lines.length - oldLines.length; start++) {
      let ok = true
      for (let i = 0; i < oldLines.length; i++) {
        if (lines[start + i].trim() !== oldLines[i].trim()) {
          ok = false
          break
        }
      }
      if (ok) {
        const before = lines.slice(0, start).join('\n').length + (start ? 1 : 0)
        return { start: before, end: before + lines.slice(start, start + oldLines.length).join('\n').length }
      }
    }
  }
  return null
}

function resolvePath(rel, projectRoots) {
  for (const root of projectRoots) {
    const candidate = require('path').join(root, rel)
    if (require('fs').existsSync(candidate)) {
      return candidate
    }
  }
  return null
}

// Entry: parse all diffs in the output text and apply them to project files.
// Returns {applied, failed: [messages]}.
function applyDiffsFromOutput(outputText, projectRoots) {
  const blocks = extractDiffBlocks(outputText)
  if (!blocks.length) {
    return { applied: 0, failed: ['no unified diff found in output'] }
  }
  let applied = 0
  const failed = []
  for (const block of blocks) {
    for (const parsed of parseDiff(block)) {
      const target = resolvePath(parsed.file, projectRoots)
      if (!target) {
        failed.push(parsed.file + ': not found under project roots')
        continue
      }
      // resolve async load, apply synchronously once loaded
      const buffer = atom.project.getBuffers().find(b => b.getPath() === target)
      if (!buffer) {
        failed.push(parsed.file + ': not open; open the file and retry')
        continue
      }
      const text = buffer.getText()
      let ok = true
      // apply hunks bottom-up so earlier offsets stay valid
      for (let i = parsed.hunks.length - 1; i >= 0; i--) {
        const hunk = parsed.hunks[i]
        const located = locateOldBlock(text, hunk.oldLines)
        if (!located) {
          failed.push(parsed.file + ': hunk ' + (i + 1) + ' does not match file contents')
          ok = false
          break
        }
        buffer.setTextInRange(
          new Range(
            buffer.positionForCharacterIndex(located.start),
            buffer.positionForCharacterIndex(located.end)
          ),
          hunk.newLines.join('\n')
        )
      }
      if (ok) {
        applied++
      }
    }
  }
  return { applied: applied, failed: failed }
}

module.exports = { applyDiffsFromOutput, extractDiffBlocks, parseDiff }
