import { NextRequest, NextResponse } from 'next/server'
import dns from 'node:dns/promises'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BYTES = 8 * 1024 * 1024
const TIMEOUT_MS = 15_000

// block loopback / private / link-local targets (SSRF guard)
const PRIVATE =
  /^(localhost$|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|::1$|f[cd][0-9a-f]{2}:|fe80:)/i

const SKIP = /^(data:|javascript:|about:|blob:|mailto:|tel:|sms:|#|\{)/i

function parseTarget(raw: string | null): URL | null {
  if (!raw) return null
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  if (PRIVATE.test(u.hostname) || PRIVATE.test(u.host)) return null
  return u
}

async function hostIsSafe(hostname: string): Promise<boolean> {
  if (PRIVATE.test(hostname)) return false
  try {
    const addrs = await dns.lookup(hostname, { all: true })
    if (!addrs.length) return false
    return addrs.every((a) => !PRIVATE.test(a.address))
  } catch {
    return false
  }
}

function proxied(absUrl: string): string {
  return `/api/proxy?url=${encodeURIComponent(absUrl)}`
}

function resolveUrl(base: URL, href: string): string | null {
  try {
    const u = new URL(href, base)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.toString()
  } catch {
    return null
  }
}

function rewriteCssUrls(css: string, base: URL): string {
  return css
    .replace(/url\(\s*(['"]?)([^'")]+?)\1\s*\)/gi, (m, q: string, u: string) => {
      const t = u.trim()
      if (SKIP.test(t) || t.startsWith('/api/proxy')) return m
      const a = resolveUrl(base, t)
      return a ? `url(${q}${proxied(a)}${q})` : m
    })
    .replace(/@import\s+(['"])([^'"]+)\1/gi, (m, q: string, u: string) => {
      if (SKIP.test(u)) return m
      const a = resolveUrl(base, u)
      return a ? `@import ${q}${proxied(a)}${q}` : m
    })
}

// runs inside every proxied document: syncs title/URL to the shell,
// keeps link navigation inside AuraOS, stubs storage that throws when sandboxed
const HELPER = `<script>(function(){
var post=function(m){try{parent.postMessage(m,'*')}catch(e){}}
var sync=function(){post({type:'auros-meta',title:document.title||'',url:location.href})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync);else setTimeout(sync,0)
window.addEventListener('load',sync)
function shim(name){try{window[name].getItem('__probe__')}catch(e){try{var s={};Object.defineProperty(window,name,{configurable:true,value:{getItem:function(k){return Object.prototype.hasOwnProperty.call(s,k)?s[k]:null},setItem:function(k,v){s[k]=String(v)},removeItem:function(k){delete s[k]},clear:function(){s={}},key:function(i){return Object.keys(s)[i]||null},get length(){return Object.keys(s).length}}})}catch(_){}}}
shim('localStorage');shim('sessionStorage')
try{if(window.top!==window)Object.defineProperty(window,'top',{get:function(){return window},configurable:true})}catch(e){}
document.addEventListener('click',function(e){
var el=e.target;while(el&&el.nodeType===1&&el.tagName!=='A')el=el.parentNode
if(!el||el.nodeType!==1)return
var href=el.getAttribute('href')||''
if(!href||/^(javascript:|mailto:|tel:|blob:|#)/i.test(href))return
try{var u=new URL(href,location.href)
if(u.origin===location.origin&&u.pathname==='/api/proxy'){e.preventDefault();post({type:'auros-nav',url:u.searchParams.get('url')||''})}
else if(/^https?:$/.test(u.protocol)){e.preventDefault();post({type:'auros-nav',url:u.href})}
}catch(err){}},true)
})()</script>`

function rewriteHtml(html: string, base: URL): string {
  html = html
    .replace(/<base\b[^>]*>/gi, '')
    .replace(/<meta\s+[^>]*http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/gi, '')
    .replace(/\sintegrity\s*=\s*("[^"]*"|'[^']*')/gi, '')
    .replace(/\snonce\s*=\s*("[^"]*"|'[^']*')/gi, '')

  html = html.replace(
    /(\s(?:src|href|action|poster)\s*=\s*)("([^"]*)"|'([^']*)')/gi,
    (m: string, pre: string, _q: string, dq: string, sq: string) => {
      const val = (dq ?? sq ?? '').trim()
      if (!val || SKIP.test(val) || val.startsWith('/api/proxy')) return m
      const a = resolveUrl(base, val)
      return a ? `${pre}"${proxied(a)}"` : m
    },
  )

  // unquoted attribute values (src=/js/app.js)
  html = html.replace(
    /(\s(?:src|href|action|poster)\s*=\s*)([^\s"'>]+)/gi,
    (m: string, pre: string, val: string) => {
      if (SKIP.test(val) || val.startsWith('/api/proxy')) return m
      const a = resolveUrl(base, val)
      return a ? `${pre}"${proxied(a)}"` : m
    },
  )

  html = html.replace(/\ssrcset\s*=\s*"([^"]*)"/gi, (m: string, v: string) => {
    const parts = v
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const seg = p.split(/\s+/)
        const a = resolveUrl(base, seg[0])
        return a ? `${proxied(a)}${seg[1] ? ' ' + seg.slice(1).join(' ') : ''}` : p
      })
    return ` srcset="${parts.join(', ')}"`
  })

  html = rewriteCssUrls(html, base)

  if (/<head[^>]*>/i.test(html)) html = html.replace(/<head[^>]*>/i, (m) => m + HELPER)
  else html = HELPER + html
  return html
}

function errorPage(title: string, detail: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="margin:0;font-family:ui-sans-serif,system-ui;background:#0d1117;color:#e4e4e7;display:flex;min-height:100vh;align-items:center;justify-content:center">
<div style="max-width:420px;padding:32px;text-align:center">
<div style="font-size:40px;margin-bottom:12px">🌐</div>
<h1 style="font-size:16px;margin:0 0 8px">${title}</h1>
<p style="font-size:12px;color:#a1a1aa;line-height:1.6;margin:0 0 20px">${detail}</p>
<p style="font-size:11px;color:#71717a">AuraOS Browser · proxy mode</p>
</div></body></html>`
}

async function proxyResponse(req: NextRequest): Promise<NextResponse> {
  const target = parseTarget(req.nextUrl.searchParams.get('url'))
  if (!target || !(await hostIsSafe(target.hostname))) {
    return new NextResponse(errorPage('Blocked URL', 'That address is not allowed or could not be resolved.'), {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const upstream = await fetch(target, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': req.headers.get('user-agent') || 'Mozilla/5.0 (compatible; AuraOS-Browser/1.0)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': req.headers.get('accept-language') || 'en-US,en;q=0.9',
      },
    })

    const ctype = upstream.headers.get('content-type') || 'application/octet-stream'
    const len = Number(upstream.headers.get('content-length') || '0')
    if (len > MAX_BYTES) {
      return new NextResponse(errorPage('Too large', 'The response exceeded the 8 MB proxy limit.'), {
        status: 502,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    const base = new URL(upstream.url || target.toString())
    const isHtml = /text\/html|application\/xhtml/i.test(ctype)
    const isCss = /text\/css/i.test(ctype)

    if (!isHtml && !isCss) {
      return new NextResponse(upstream.body, {
        status: upstream.status,
        headers: { 'Content-Type': ctype, 'Cache-Control': 'no-store' },
      })
    }

    const buf = await upstream.arrayBuffer()
    if (buf.byteLength > MAX_BYTES) {
      return new NextResponse(errorPage('Too large', 'The response exceeded the 8 MB proxy limit.'), {
        status: 502,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    // decode with the upstream charset, re-serve as utf-8
    let charset = /charset=([\w-]+)/i.exec(ctype)?.[1] ?? 'utf-8'
    let text = new TextDecoder(charset).decode(buf)
    if (isHtml) {
      const metaCharset = /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(text.slice(0, 2048))?.[1]
      if (metaCharset && metaCharset.toLowerCase() !== charset.toLowerCase()) {
        try {
          text = new TextDecoder(metaCharset).decode(buf)
        } catch {
          /* keep first decode */
        }
      }
      charset = 'utf-8'
    }

    const out = isCss ? rewriteCssUrls(text, base) : rewriteHtml(text, base)
    return new NextResponse(out, {
      status: upstream.status,
      headers: {
        'Content-Type': `${isCss ? 'text/css' : 'text/html'}; charset=${charset}`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    const detail =
      e instanceof Error && e.name === 'AbortError'
        ? 'The site took too long to respond (15 s timeout).'
        : 'The site could not be reached from the sandbox.'
    return new NextResponse(errorPage(`Can't reach ${target.hostname}`, detail), {
      status: 504,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } finally {
    clearTimeout(timer)
  }
}

export async function GET(req: NextRequest) {
  return proxyResponse(req)
}

export async function POST(req: NextRequest) {
  return proxyResponse(req)
}
