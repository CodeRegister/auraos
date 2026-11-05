import { promises as fs } from 'fs'
import path from 'path'

const ROOT = process.env.HOME && process.env.HOME.startsWith('/home') ? process.env.HOME : '/home/z'
console.log('ROOT =', ROOT)
try {
  const dirents = await fs.readdir(ROOT, { withFileTypes: true })
  console.log('entries:', dirents.length)
  for (const d of dirents.slice(0, 5)) {
    try {
      const st = await fs.stat(path.join(ROOT, d.name))
      console.log(d.name, st.isDirectory() ? 'dir' : 'file', st.size)
    } catch (e) {
      console.log(d.name, 'stat-err', e.code)
    }
  }
} catch (e) {
  console.log('ERR:', e.code, e.message)
}
