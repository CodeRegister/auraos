import path from 'path'

export const ROOT =
  process.env.HOME && process.env.HOME.startsWith('/home') ? process.env.HOME : '/home/z'

export function safeResolve(input: string): string | null {
  if (!input) return ROOT
  const resolved = path.resolve(input.startsWith('~') ? path.join(ROOT, input.slice(1)) : input)
  if (resolved === ROOT || resolved.startsWith(ROOT + path.sep)) return resolved
  return null
}

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'])
const TEXT_EXTS = new Set([
  'txt', 'md', 'markdown', 'json', 'js', 'jsx', 'ts', 'tsx', 'css', 'scss', 'html', 'htm', 'xml', 'yml',
  'yaml', 'sh', 'bash', 'zsh', 'env', 'ini', 'conf', 'cfg', 'toml', 'py', 'rb', 'go', 'rs', 'java', 'c',
  'h', 'cpp', 'hpp', 'cs', 'php', 'sql', 'log', 'csv', 'tsv', 'gitignore', 'editorconfig', 'lock', 'prisma',
  'mjs', 'cjs', 'properties', 'gradle', 'dockerfile', 'makefile', 'cmake', 'vim', 'nix', 'npmrc', 'babelrc',
])

export function fileKind(ext: string): 'image' | 'text' | 'binary' {
  if (IMAGE_EXTS.has(ext)) return 'image'
  if (TEXT_EXTS.has(ext)) return 'text'
  return 'binary'
}
