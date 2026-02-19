export function stableKey(text, sourceDate, prefix = 'rem') {
  const normalized = (text || '').toLowerCase().trim().slice(0, 80)
  const date = sourceDate || ''
  let hash = 0
  const str = normalized + '|' + date
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return prefix + '-' + Math.abs(hash).toString(36)
}
