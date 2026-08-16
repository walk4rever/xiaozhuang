export const renderSimpleMarkdown = (text: string): string => {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n(\d+)\.\s/g, '<br/><b>$1.</b> ')
    .replace(/^\n/, '')
}
