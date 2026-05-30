const express = require('express');
const { URL } = require('url');
const got = require('got').default || require('got');
const httpProxy = require('http-proxy');
const zlib = require('zlib');
const cheerio = require('cheerio');
const { CookieJar } = require('tough-cookie');

const router = express.Router();
const PROXY_PATH = '/service';
const PROXY_QUERY = '?target=';
const PROXY_PREFIX = `${PROXY_PATH}/${PROXY_QUERY}`.replace('//', '/');

const wsProxy = httpProxy.createProxyServer({ ws: true, xfwd: true, secure: false, changeOrigin: true });

const PROXY_RUNTIME = `
(function(){
  const proxyPrefix = location.origin + '/service/?target=';
  const specialSchemes = /^(data|blob|javascript|mailto|tel|about|filesystem):/i;
  const currentTarget = new URLSearchParams(location.search).get('target') || '';
  const currentTargetUrl = currentTarget ? new URL(currentTarget) : null;

  function shouldProxy(value){
    if(!value || typeof value !== 'string') return false;
    if(value.startsWith(proxyPrefix)) return false;
    if(value === '/service' || value === '/service/' || value.startsWith('/service/?target=')) return false;
    if(specialSchemes.test(value)) return false;
    return true;
  }

  function proxify(value){
    if(!shouldProxy(value)) return value;
    try{
      const absolute = new URL(value, currentTargetUrl || location.href).href;
      return proxyPrefix + encodeURIComponent(absolute);
    }catch(e){
      return value;
    }
  }

  const originalFetch = window.fetch;
  window.fetch = function(input, init){
    if(typeof input === 'string') input = proxify(input);
    else if(input instanceof Request) input = new Request(proxify(input.url), input);
    return originalFetch.call(this, input, init);
  };

  const OriginalXHR = window.XMLHttpRequest;
  function ProxyXHR(){
    const xhr = new OriginalXHR();
    const open = xhr.open;
    xhr.open = function(method, url){
      if(typeof url === 'string') url = proxify(url);
      return open.apply(this, arguments);
    };
    return xhr;
  }
  window.XMLHttpRequest = ProxyXHR;

  const OriginalWebSocket = window.WebSocket;
  if(OriginalWebSocket){
    window.WebSocket = function(url, protocols){
      if(typeof url === 'string') url = proxify(url);
      return new OriginalWebSocket(url, protocols);
    };
  }

  const OriginalEventSource = window.EventSource;
  if(OriginalEventSource){
    window.EventSource = function(url, opts){
      if(typeof url === 'string') url = proxify(url);
      return new OriginalEventSource(url, opts);
    };
  }

  const originalSendBeacon = navigator.sendBeacon.bind(navigator);
  navigator.sendBeacon = function(url, data){
    if(typeof url === 'string') url = proxify(url);
    return originalSendBeacon(url, data);
  };

  const originalOpen = window.open.bind(window);
  window.open = function(url, name, specs){
    if(typeof url === 'string') url = proxify(url);
    return originalOpen(url, name, specs);
  };

  const originalAssign = window.location.assign.bind(window.location);
  window.location.assign = function(url){
    if(typeof url === 'string') url = proxify(url);
    return originalAssign(url);
  };

  const originalReplace = window.location.replace.bind(window.location);
  window.location.replace = function(url){
    if(typeof url === 'string') url = proxify(url);
    return originalReplace(url);
  };

  const originalPushState = history.pushState.bind(history);
  history.pushState = function(state, title, url){
    if(typeof url === 'string') url = proxify(url);
    return originalPushState(state, title, url);
  };

  const originalReplaceState = history.replaceState.bind(history);
  history.replaceState = function(state, title, url){
    if(typeof url === 'string') url = proxify(url);
    return originalReplaceState(state, title, url);
  };

  const originalSetAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function(name, value){
    if(typeof name === 'string' && typeof value === 'string'){
      const attr = name.toLowerCase();
      if(['src','href','action','poster','data','manifest'].includes(attr)){
        value = proxify(value);
      }
    }
    return originalSetAttribute.call(this, name, value);
  };

  // Intercept form submissions to ensure GET parameters are encoded inside the proxied target.
  document.addEventListener('submit', function(ev){
    try{
      const form = ev.target;
      if(!form || form.__proxy_submitting) return;
      const method = (form.method || 'GET').toUpperCase();
      const actionAttr = form.getAttribute('action') || location.href;
      const absolute = new URL(actionAttr, currentTargetUrl || location.href);

      if(method === 'GET'){
        ev.preventDefault();
        const fd = new FormData(form);
        const params = new URLSearchParams(absolute.search);
        for(const [k,v] of fd.entries()){
          params.append(k, v);
        }
        absolute.search = params.toString();
        location.assign(proxyPrefix + encodeURIComponent(absolute.href));
        return;
      }

      // For POST (and others), rewrite the action to a proxied absolute target and submit normally.
      const proxied = proxyPrefix + encodeURIComponent(absolute.href);
      form.__proxy_submitting = true;
      form.setAttribute('action', proxied);
      // Allow native submit to continue; defer actual submit to avoid re-entrant listener
      setTimeout(() => { try{ form.submit(); }catch(e){} }, 0);
      ev.preventDefault();
    }catch(e){/* ignore */}
  }, true);

  if(navigator.serviceWorker){
    const register = navigator.serviceWorker.register.bind(navigator.serviceWorker);
    navigator.serviceWorker.register = function(scriptURL, options){
      if(typeof scriptURL === 'string') scriptURL = proxify(scriptURL);
      return register(scriptURL, options);
    };
  }

  if(window.Worker){
    const NativeWorker = window.Worker;
    window.Worker = function(scriptURL, options){
      if(typeof scriptURL === 'string') scriptURL = proxify(scriptURL);
      return new NativeWorker(scriptURL, options);
    };
  }

  if(window.SharedWorker){
    const NativeSharedWorker = window.SharedWorker;
    window.SharedWorker = function(scriptURL, name){
      if(typeof scriptURL === 'string') scriptURL = proxify(scriptURL);
      return new NativeSharedWorker(scriptURL, name);
    };
  }
})();
`;

function stripSecurityHeaders(headers, res){
  const blacklist = [
    'content-security-policy',
    'content-security-policy-report-only',
    'x-frame-options',
    'x-content-type-options',
    'x-xss-protection',
    'permissions-policy',
    'permission-policy',
    'cross-origin-opener-policy',
    'cross-origin-embedder-policy',
    'cross-origin-resource-policy',
    'referrer-policy',
  ];
  blacklist.forEach((name) => {
    if(Object.prototype.hasOwnProperty.call(headers, name)) delete headers[name];
    if(res && typeof res.removeHeader === 'function') res.removeHeader(name);
  });
}

function isDataOrSpecialScheme(value){
  return /^data:|^blob:|^javascript:|^mailto:|^tel:|^about:|^filesystem:/i.test(value);
}

function makeAbsolute(base, relative){
  try {
    if(typeof relative === 'string'){
      // Preserve proxy-relative links so our own /service/?target=... URLs do not
      // get resolved against the upstream origin and become invalid.
      if(relative.startsWith(PROXY_PATH)) return relative;
      if(relative.startsWith('/')){
        return new URL(relative, new URL(base).origin).href;
      }
    }
    return new URL(relative, base).href;
  } catch (err) { return relative; }
}

function buildProxyUrl(target){
  return `${PROXY_PATH}/${PROXY_QUERY}${encodeURIComponent(target)}`;
}

function normalizeTarget(raw){
  const cleaned = raw.trim();
  let target = cleaned;
  if(/^(?:\/\/)/.test(cleaned)) target = `https:${cleaned}`;
  else if(/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(cleaned)) target = cleaned;
  else target = `https://${cleaned}`;

  try{
    const url = new URL(target);
    if(url.hostname === 'google.com'){
      url.hostname = 'www.google.com';
      return url.href;
    }
    return url.href;
  }catch(e){
    return target;
  }
}

function rewriteAttribute($, element, attr, baseUrl){
  let value = $(element).attr(attr);
  if(!value || isDataOrSpecialScheme(value) || value.startsWith('#')) return;

  const extractInnerTarget = (candidate) => {
    try{
      const u = new URL(candidate, baseUrl);
      const inner = u.searchParams.get('target') || u.searchParams.get('url');
      return inner || null;
    }catch(e){ return null; }
  };

  // If the attribute already references our proxy (relative or absolute),
  // try to extract the inner target and rewrite to a single proxied target
  if(value.startsWith(PROXY_PATH) || value.includes(`${PROXY_PATH}/?target=`) || value.includes(`${PROXY_PATH}/${PROXY_QUERY}`)){
    const absoluteCandidate = makeAbsolute(baseUrl, value);
    const inner = extractInnerTarget(absoluteCandidate);
    if(inner){
      try{
        const decoded = decodeURIComponent(inner);
        const newUrl = buildProxyUrl(normalizeTarget(decoded));
        // Log rewrites that involve Google targets for tracing
        try{ if(String(decoded).includes('google.')) console.info('[Proxy][rewrite] tag=', element.tagName, 'attr=', attr, 'before=', value, 'after=', newUrl, 'base=', baseUrl); }catch(e){}
        $(element).attr(attr, newUrl);
        return;
      }catch(e){}
    }

    // If we couldn't extract an inner target, fix bare proxy paths instead of leaving malformed /service/ values.
    if(value === PROXY_PATH || value === `${PROXY_PATH}/`){
      const fallback = buildProxyUrl(baseUrl);
      console.warn('[Proxy][rewrite] malformed proxy path corrected', { tag: element.tagName, attr, before: value, after: fallback, base: baseUrl });
      $(element).attr(attr, fallback);
      return;
    }

    // If this was a proxied path but we couldn't recover a valid inner target,
    // leave it alone to avoid double wrap, but log the bad path for investigation.
    console.warn('[Proxy][rewrite] unresolved proxy path left unchanged', { tag: element.tagName, attr, value, base: baseUrl });
    return;
  }

  // Log and trace server-side rewrites for Google-internal relative paths
  try{
    if(/^\/(?:async|search|complete|gen_204|client_204|xjs)/i.test(value)){
      console.info('[Proxy][rewrite-debug] found-relative', { tag: element.tagName, attr, before: value, base: baseUrl });
    }
  }catch(e){}

  // Compute absolute URL (resolves relative URLs), and if that absolute
  // itself contains a proxied inner target, unwrap it first to avoid nesting.
  let absolute = makeAbsolute(baseUrl, value);
  const innerFromAbs = extractInnerTarget(absolute);
  if(innerFromAbs){
    try{ absolute = normalizeTarget(decodeURIComponent(innerFromAbs)); }
    catch(e){}
  }

  // Finally set attribute to proxied absolute (including any existing query)
  const proxied = buildProxyUrl(absolute);
  if(proxied === `${PROXY_PATH}/${PROXY_QUERY}` || proxied === `${PROXY_PATH}/?target=`){
    console.error('[Proxy][rewrite] Proxy generated empty target URL', { tag: element.tagName, attr, before: value, absolute, proxied, base: baseUrl });
  }
  try{
    if(/^\/(?:async|search|complete|gen_204|client_204|xjs)/i.test(value) || String(absolute).includes('google.')){
      console.info('[Proxy][rewrite-debug] resolved', { tag: element.tagName, attr, before: value, absolute, proxied, base: baseUrl });
    }
  }catch(e){}
  $(element).attr(attr, proxied);
}

function rewriteSrcSet(value, baseUrl){
  if(!value) return value;
  return value
    .split(',')
    .map((item) => {
      const parts = item.trim().split(/\s+/);
      const url = parts[0];
      if(isDataOrSpecialScheme(url)) return item;
      // unwrap nested proxied targets if present
      let absolute = makeAbsolute(baseUrl, url);
      try{
        const u = new URL(absolute);
        const inner = u.searchParams.get('target') || u.searchParams.get('url');
        if(inner) absolute = normalizeTarget(decodeURIComponent(inner));
      }catch(e){}
      return [buildProxyUrl(absolute), parts.slice(1).join(' ')].filter(Boolean).join(' ');
    })
    .join(', ');
}

function rewriteInlineScript(text, baseUrl){
  if(!text) return text;

  let rewritten = text;
  rewritten = rewritten.replace(/import\(\s*(['"])([^'"\)]+)\1\s*\)/g, (match, quote, url) => {
    if(isDataOrSpecialScheme(url) || url.startsWith(PROXY_PATH)) return match;
    return `import(${quote}${buildProxyUrl(makeAbsolute(baseUrl, url))}${quote})`;
  });
  rewritten = rewritten.replace(/(?:from|import)\s+(['"])([^'"\)]+)\1/g, (match, quote, url) => {
    if(isDataOrSpecialScheme(url) || url.startsWith(PROXY_PATH)) return match;
    return match.replace(url, buildProxyUrl(makeAbsolute(baseUrl, url)));
  });
  rewritten = rewritten.replace(/navigator\.serviceWorker\.register\(\s*(['"])([^'"\)]+)\1/g, (match, quote, url) => {
    if(isDataOrSpecialScheme(url) || url.startsWith(PROXY_PATH)) return match;
    return `navigator.serviceWorker.register(${quote}${buildProxyUrl(makeAbsolute(baseUrl, url))}${quote}`;
  });
  rewritten = rewritten.replace(/new\s+Worker\(\s*(['"])([^'"\)]+)\1/g, (match, quote, url) => {
    if(isDataOrSpecialScheme(url) || url.startsWith(PROXY_PATH)) return match;
    return `new Worker(${quote}${buildProxyUrl(makeAbsolute(baseUrl, url))}${quote}`;
  });
  rewritten = rewritten.replace(/new\s+SharedWorker\(\s*(['"])([^'"\)]+)\1/g, (match, quote, url) => {
    if(isDataOrSpecialScheme(url) || url.startsWith(PROXY_PATH)) return match;
    return `new SharedWorker(${quote}${buildProxyUrl(makeAbsolute(baseUrl, url))}${quote}`;
  });
  rewritten = rewritten.replace(/window\.open\(\s*(['"])([^'"\)]+)\1/g, (match, quote, url) => {
    if(isDataOrSpecialScheme(url) || url.startsWith(PROXY_PATH)) return match;
    return `window.open(${quote}${buildProxyUrl(makeAbsolute(baseUrl, url))}${quote}`;
  });
  return rewritten;
}

function rewriteJsonManifest(text, baseUrl){
  try{
    const data = JSON.parse(text);
    const rewriteValue = (value) => {
      if(typeof value !== 'string') return value;
      if(isDataOrSpecialScheme(value) || value.startsWith(PROXY_PATH)) return value;
      return buildProxyUrl(makeAbsolute(baseUrl, value));
    };

    if(data.start_url) data.start_url = rewriteValue(data.start_url);
    if(data.scope) data.scope = rewriteValue(data.scope);
    if(Array.isArray(data.icons)){
      data.icons = data.icons.map((icon) => {
        if(icon && icon.src) icon.src = rewriteValue(icon.src);
        return icon;
      });
    }
    return JSON.stringify(data);
  }catch(e){
    return text;
  }
}

function rewriteCSS(css, baseUrl){
  if(!css) return css;
  return css
    .replace(/url\(([^)]+)\)/g, (match, raw) => {
      const value = raw.trim().replace(/^['"]|['"]$/g, '');
      if(isDataOrSpecialScheme(value)) return `url(${value})`;
      const absolute = makeAbsolute(baseUrl, value);
      return `url(${buildProxyUrl(absolute)})`;
    })
    .replace(/@import\s+(?:url\()?['"]?([^'"\)]+)['"]?\)?/g, (match, url) => {
      if(isDataOrSpecialScheme(url) || url.startsWith(PROXY_PATH)) return match;
      return `@import url('${buildProxyUrl(makeAbsolute(baseUrl, url))}')`;
    });
}

function rewriteHTML(html, originUrl){
  const $ = cheerio.load(html, { decodeEntities: false });
  const baseUrl = originUrl;

  // Inject a base href that points to the upstream origin (not the proxied URL).
  // This ensures root-relative URLs (e.g. `/async/hpba`) resolve against the
  // upstream host (https://google.com) before we proxify them server-side.
  try{
    const originBase = new URL(baseUrl).origin + '/';
    if(String(baseUrl).includes('google.')) console.info('[Proxy][base] set upstream-origin-base=', originBase, 'origUrl=', baseUrl);
    if($('base').length){
      $('base').attr('href', originBase);
    } else {
      $('head').prepend(`<base href="${originBase}">`);
    }
  }catch(e){
    // fallback to proxied base if origin parse fails
    const baseHref = buildProxyUrl(baseUrl);
    try{ if(String(baseUrl).includes('google.')) console.info('[Proxy][base] fallback base href=', baseHref, 'origin=', baseUrl); }catch(e){}
    if($('base').length) $('base').attr('href', baseHref);
    else $('head').prepend(`<base href="${baseHref}">`);
  }

  const rewrites = [
    ['a', 'href'],
    ['area', 'href'],
    ['link', 'href'],
    ['img', 'src'],
    ['script', 'src'],
    ['iframe', 'src'],
    ['embed', 'src'],
    ['source', 'src'],
    ['track', 'src'],
    ['audio', 'src'],
    ['video', 'src'],
    ['input', 'src'],
    ['form', 'action'],
    ['object', 'data'],
    ['html', 'manifest'],
    ['blockquote', 'cite'],
    ['del', 'cite'],
    ['ins', 'cite'],
    ['q', 'cite'],
  ];

  rewrites.forEach(([tag, attr]) => {
    $(tag).each((_, element) => rewriteAttribute($, element, attr, baseUrl));
  });

  $('link[href]').each((_, element) => {
    const rel = ($(element).attr('rel') || '').toLowerCase();
    if(['dns-prefetch', 'preconnect'].includes(rel)) return;
    rewriteAttribute($, element, 'href', baseUrl);
  });

  $('img[srcset], source[srcset]').each((_, element) => {
    const value = $(element).attr('srcset');
    $(element).attr('srcset', rewriteSrcSet(value, baseUrl));
  });

  $('[style]').each((_, element) => {
    const value = $(element).attr('style');
    if(value) $(element).attr('style', rewriteCSS(value, baseUrl));
  });

  $('style').each((_, element) => {
    const value = $(element).html();
    if(value) $(element).html(rewriteCSS(value, baseUrl));
  });

  $('meta[http-equiv="refresh"]').each((_, element) => {
    const content = $(element).attr('content');
    if(content){
      const match = content.match(/url=(.+)$/i);
      if(match){
        const absolute = makeAbsolute(baseUrl, match[1].trim());
        $(element).attr('content', `0; url=${buildProxyUrl(absolute)}`);
      }
    }
  });

  $('script').each((_, element) => {
    if($(element).attr('src')) return;
    const type = ($(element).attr('type') || 'text/javascript').toLowerCase();
    if(type.includes('ld+json') || type.includes('json')) return;
    const text = $(element).html();
    if(text) $(element).html(rewriteInlineScript(text, baseUrl));
  });

  $('script[type="importmap"]').each((_, element) => {
    const text = $(element).html();
    if(!text) return;
    try{
      const importmap = JSON.parse(text);
      const rewriteEntry = (value) => {
        if(typeof value !== 'string') return value;
        if(isDataOrSpecialScheme(value) || value.startsWith(PROXY_PATH)) return value;
        return buildProxyUrl(makeAbsolute(baseUrl, value));
      };
      if(importmap.imports){
        Object.keys(importmap.imports).forEach((key) => {
          importmap.imports[key] = rewriteEntry(importmap.imports[key]);
        });
      }
      if(importmap.scopes){
        Object.keys(importmap.scopes).forEach((scope) => {
          const scopeDef = importmap.scopes[scope];
          Object.keys(scopeDef).forEach((key) => {
            scopeDef[key] = rewriteEntry(scopeDef[key]);
          });
        });
      }
      $(element).html(JSON.stringify(importmap));
    }catch(e){}
  });

  $('link[rel="manifest"]').each((_, element) => rewriteAttribute($, element, 'href', baseUrl));

  const head = $('head');
  if(head.length){
    head.prepend(`<script>${PROXY_RUNTIME}</script>`);
  } else {
    $('body').prepend(`<script>${PROXY_RUNTIME}</script>`);
  }

  return $.html();
}

async function getCookieJar(req){
  const raw = req.session && req.session.cookieJarJson;
  if(raw){
    try{ return CookieJar.fromJSON(raw); } catch (err) {}
  }
  return new CookieJar();
}

async function saveCookieJar(req, jar){
  try{
    const json = await new Promise((resolve, reject) => jar.serialize((err, serialized) => err ? reject(err) : resolve(serialized)));
    req.session.cookieJarJson = json;
  }catch(e){}
}

function rewriteSetCookie(cookieStr, proxySecure){
  return cookieStr
    .split(';')
    .map((part) => part.trim())
    .filter((part) => !/^domain=/i.test(part))
    .filter((part) => proxySecure || !/^secure$/i.test(part))
    .filter((part) => !/^samesite=/i.test(part))
    .join('; ');
}

async function parseTarget(req){
  const incoming = new URL(req.url, `${req.protocol}://${req.get('host')}`);
  const rawTarget = incoming.searchParams.get('target') || incoming.searchParams.get('url') || req.path.replace(/^\/service\/?/i, '');
  // Log parsed incoming URL and query params for investigation
  try{
    const params = {};
    for(const [k,v] of incoming.searchParams.entries()) params[k] = v;
    console.info('[Proxy][parseTarget] incomingUrl=', incoming.href, 'searchParams=', params, 'rawTarget=', rawTarget);
  }catch(e){}
  if(!rawTarget) return null;
  // If rawTarget is just a leading slash or path (e.g. '/'), treat as no target
  if(rawTarget === '/' || rawTarget.trim() === '' || rawTarget.startsWith('/')){
    console.info('[Proxy][parseTarget] rawTarget is empty or a path; attempting referer/cookie fallback', rawTarget);
    // Try to recover target from Referer (browser may submit to /service/?q=... losing target)
    try{
      const ref = req.get('referer') || req.headers.referer || '';
      if(ref){
        const refUrl = new URL(ref);
        const refTargetRaw = refUrl.searchParams.get('target') || refUrl.searchParams.get('url');
        if(refTargetRaw){
          const refDecoded = decodeURIComponent(refTargetRaw);
          let refNormalized = normalizeTarget(refDecoded);
          // merge outer params (incoming) into refNormalized
          try{
            const outerParams = incoming.searchParams;
            const t = new URL(refNormalized);
            let merged = false;
            for(const [k,v] of outerParams.entries()){
              if(k === 'target' || k === 'url') continue;
              if(!t.searchParams.has(k)){
                t.searchParams.append(k, v);
                merged = true;
              }
            }
            if(merged){
              console.info('[Proxy][parseTarget] refererFallback mergedOuterParams', { before: refNormalized, after: t.href });
              refNormalized = t.href;
            }
          }catch(e){ console.error('[Proxy][parseTarget] referer merge failed', e && e.stack); }
          console.info('[Proxy][parseTarget] refererFallback decoded=', refDecoded, 'normalized=', refNormalized);
          return refNormalized;
        }
      }
    }catch(e){ console.error('[Proxy][parseTarget] referer fallback failed', e && e.stack); }
    // Try cookie fallback: look for proxy_target cookie set on previous HTML responses
    try{
      const cookieHeader = req.headers && req.headers.cookie;
      if(cookieHeader){
        const match = cookieHeader.match(/(?:^|;\s*)proxy_target=([^;]+)/);
        if(match && match[1]){
          try{
            const decoded = decodeURIComponent(match[1]);
            const normalized = normalizeTarget(decoded);
            console.info('[Proxy][parseTarget] cookieFallback found proxy_target=', normalized);
            // merge outer params into normalized as earlier
            try{
              const outerParams = incoming.searchParams;
              const t = new URL(normalized);
              let merged = false;
              for(const [k,v] of outerParams.entries()){
                if(k === 'target' || k === 'url') continue;
                if(!t.searchParams.has(k)){
                  t.searchParams.append(k, v);
                  merged = true;
                }
              }
              if(merged){
                console.info('[Proxy][parseTarget] cookieFallback mergedOuterParams', { before: normalized, after: t.href });
                return t.href;
              }
            }catch(e){ /* ignore merge errors */ }
            return normalized;
          }catch(e){}
        }
      }
    }catch(e){ console.error('[Proxy][parseTarget] cookie fallback failed', e && e.stack); }
    return null;
  }
  let decoded;
  try{
    decoded = decodeURIComponent(rawTarget);
  }catch(e){
    decoded = rawTarget;
  }
  // If decoding yields a path-only value like '/', treat as no target
  if(decoded === '/' || decoded.trim() === '' || decoded.startsWith('/')){
    console.info('[Proxy][parseTarget] decoded rawTarget is path-only; returning null', decoded);
    return null;
  }
  let normalized = normalizeTarget(decoded);

  // If there are additional query params on the outer proxied URL (e.g. &q=cats),
  // merge them into the decoded target's query string so browser-applied params
  // don't get lost outside the encoded `target` parameter.
  try{
    const outerParams = new URL(req.url, `${req.protocol}://${req.get('host')}`).searchParams;
    const t = new URL(normalized);
    let merged = false;
    for(const [k,v] of outerParams.entries()){
      if(k === 'target' || k === 'url') continue;
      // Append only if upstream doesn't already have the param
      if(!t.searchParams.has(k)){
        t.searchParams.append(k, v);
        merged = true;
      }
    }
    if(merged){
      const before = normalized;
      normalized = t.href;
      console.info('[Proxy][parseTarget] mergedOuterParams into target', { before, after: normalized });
    }
  }catch(e){
    console.error('[Proxy][parseTarget] merge outer params failed', e && e.stack);
  }

  console.info('[Proxy][parseTarget] decodedTarget=', decoded, 'normalizedTarget=', normalized);
  return normalized;
}

router.all('/*', async (req, res) => {
  try{
    const targetHref = await parseTarget(req);
    if(!targetHref) return res.status(400).send('No target specified');
    const targetUrl = new URL(targetHref);
    const isSecureProxy = req.secure || req.headers['x-forwarded-proto'] === 'https';

    const headers = Object.assign({}, req.headers);
    delete headers.cookie;
    delete headers.host;
    delete headers.connection;
    delete headers['content-length'];

    headers.host = targetUrl.host;
    if(headers.referer && headers.referer.includes(req.hostname)) headers.referer = targetUrl.origin;
    if(headers.origin && headers.origin.includes(req.hostname)) headers.origin = targetUrl.origin;
    headers['accept-language'] = headers['accept-language'] || 'en-US,en;q=0.9';
    headers['user-agent'] = headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';

        
    let jar = await getCookieJar(req);
    let cookieHeader = '';
    try{
      cookieHeader = await new Promise((resolve) => jar.getCookieString(targetUrl.href, {}, (err, cookie) => resolve(cookie || '')));
    }catch(e){
      try{
        jar = await getCookieJar(req);
        cookieHeader = await new Promise((resolve) => jar.getCookieString(targetUrl.href, {}, (err, cookie) => resolve(cookie || '')));
      }catch(e2){}
    }
    if(cookieHeader) headers.cookie = cookieHeader;

    const gotOptions = {
      headers,
      method: req.method,
      throwHttpErrors: false,
      decompress: false,
      isStream: true,
      retry: { limit: 0 },
    };
    if(req.method !== 'GET' && req.method !== 'HEAD' && req.body === undefined){
      gotOptions.body = req;
    }

    const upstream = got.stream(targetUrl.href, gotOptions);

    upstream.on('error', (error) => {
      console.error('[Proxy][upstream error]', {
        message: error && error.message,
        target: targetUrl.href,
        rewritten: buildProxyUrl(targetUrl.href),
        stack: error && error.stack,
      });
      if(!res.headersSent) {
        try{
          res.status(502).send(`Upstream request failed for target=${targetUrl.href}`);
        }catch(e){}
      }
      upstream.destroy();
    });

    upstream.on('response', async (proxRes) => {
      try{
        const responseHeaders = Object.assign({}, proxRes.headers);
        stripSecurityHeaders(responseHeaders, res);

        if(responseHeaders.location){
          try{
            // Log original redirect from upstream
            console.info('[Proxy][redirect] original-location=', responseHeaders.location, 'for target=', targetUrl.href);
            const absoluteLocation = new URL(responseHeaders.location, targetUrl.href).href;
            const rewrittenLocation = buildProxyUrl(absoluteLocation);
            responseHeaders.location = rewrittenLocation;
            console.info('[Proxy][redirect] rewritten-location=', rewrittenLocation, 'absolute=', absoluteLocation);
          }catch(e){
            console.error('[Proxy][redirect] location rewrite failed', { target: targetUrl.href, location: responseHeaders.location, error: e && e.stack });
          }
        }

        const setCookies = proxRes.headers['set-cookie'];
        if(setCookies){
          const cookies = Array.isArray(setCookies) ? setCookies : [setCookies];
          responseHeaders['set-cookie'] = cookies.map((cookieStr) => rewriteSetCookie(cookieStr, isSecureProxy));
          for(const cookieStr of cookies){
            try{
              await new Promise((resolve, reject) => jar.setCookie(cookieStr, targetUrl.href, {}, (err) => err ? reject(err) : resolve()));
            }catch(e){}
          }
        }
        // Ensure downstream clients receive a cookie storing the proxy's current target
        // Only set this cookie for HTML navigational responses to avoid API/XHR endpoints
        try{
          const upstreamContentType = (proxRes.headers['content-type'] || '').toLowerCase();
          if(/text\/html/i.test(upstreamContentType)){
            const proxyCookie = `proxy_target=${encodeURIComponent(targetUrl.href)}; Path=/; SameSite=Lax`;
            if(responseHeaders['set-cookie']){
              if(Array.isArray(responseHeaders['set-cookie'])) responseHeaders['set-cookie'].push(proxyCookie);
              else responseHeaders['set-cookie'] = [responseHeaders['set-cookie'], proxyCookie];
            } else {
              responseHeaders['set-cookie'] = [proxyCookie];
            }
          }
        }catch(e){ console.error('[Proxy] set proxy_target cookie failed', e && e.stack); }

        const contentEncoding = (proxRes.headers['content-encoding'] || '').toLowerCase().trim();
        const contentType = proxRes.headers['content-type'] || '';
        const isText = /text\/html|text\/css|javascript|json/i.test(contentType);
        const isHTML = /text\/html/i.test(contentType);
        const isJS = /javascript|ecmascript|module/i.test(contentType);
        const isCSS = /text\/css/i.test(contentType);
        const isJSON = /application\/json|application\/manifest\+json|text\/json/i.test(contentType);
        const shouldRewrite = isText;

        console.info('[Proxy] response', {
          target: targetUrl.href,
          contentType,
          contentEncoding,
          shouldRewrite,
          statusCode: proxRes.statusCode,
        });

        if (!shouldRewrite) {
          ['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailers','transfer-encoding','upgrade'].forEach((name) => delete responseHeaders[name]);
          responseHeaders['x-proxied-by'] = 'CustomProxy';
          console.info('[Proxy] binary pass-through', { target: targetUrl.href, contentType, contentEncoding });
          res.writeHead(proxRes.statusCode, responseHeaders);
          upstream.pipe(res);
          return;
        }

        const chunks = [];
        upstream.on('data', (chunk) => chunks.push(chunk));
        upstream.on('end', async () => {
          try {
            const rawBuffer = Buffer.concat(chunks);
            let decodedBuffer = rawBuffer;
            let decompressed = false;
            let decompressionError = false;

            if (contentEncoding.includes('br')) {
              try {
                decodedBuffer = zlib.brotliDecompressSync(rawBuffer);
                decompressed = true;
              } catch (err) {
                decompressionError = true;
                console.error('[Proxy] Brotli decompression failed', { target: targetUrl.href, error: err.message });
              }
            } else if (contentEncoding.includes('gzip')) {
              decodedBuffer = zlib.gunzipSync(rawBuffer);
              decompressed = true;
            } else if (contentEncoding.includes('deflate')) {
              decodedBuffer = zlib.inflateSync(rawBuffer);
              decompressed = true;
            }

            console.info('[Proxy] decompression', {
              target: targetUrl.href,
              contentEncoding,
              decompressed,
              decompressionError,
            });

            if (decompressionError) {
              ['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailers','transfer-encoding','upgrade'].forEach((name) => delete responseHeaders[name]);
              responseHeaders['x-proxied-by'] = 'CustomProxy';
              res.writeHead(proxRes.statusCode, responseHeaders);
              res.end(rawBuffer);
              return;
            }

            const text = decodedBuffer.toString('utf8');
            // Detect Google suggestion responses which begin with a strange prefix like ")]}'"
            try{
              const trimmed = text.trimStart();
              if(/^\)\]\}'/.test(trimmed)){
                console.info('[Proxy][suggestion-detected]', {
                  incomingUrl: req.url,
                  method: req.method,
                  target: targetUrl.href,
                  statusCode: proxRes.statusCode,
                  contentType: proxRes.headers['content-type'],
                  contentDisposition: proxRes.headers['content-disposition'],
                  accept: req.headers['accept'],
                  secFetchMode: req.headers['sec-fetch-mode'],
                  xRequestedWith: req.headers['x-requested-with'],
                });
              }
            }catch(e){}

            let rewritten = text;
            if (isHTML) rewritten = rewriteHTML(text, targetUrl.href);
            else if (isJS) rewritten = PROXY_RUNTIME + '\n' + rewriteInlineScript(text, targetUrl.href);
            else if (isCSS) rewritten = rewriteCSS(text, targetUrl.href);
            else if (isJSON) rewritten = rewriteJsonManifest(text, targetUrl.href);

            const acceptEncoding = req.headers['accept-encoding'] || '';
            let outputBuffer = Buffer.from(rewritten, 'utf8');
            if (/br/.test(acceptEncoding)) {
              outputBuffer = zlib.brotliCompressSync(outputBuffer);
              responseHeaders['content-encoding'] = 'br';
            } else if (/gzip/.test(acceptEncoding)) {
              outputBuffer = zlib.gzipSync(outputBuffer);
              responseHeaders['content-encoding'] = 'gzip';
            } else {
              delete responseHeaders['content-encoding'];
            }

            delete responseHeaders['transfer-encoding'];
            responseHeaders['content-length'] = Buffer.byteLength(outputBuffer).toString();
            responseHeaders['x-proxied-by'] = 'CustomProxy';
            ['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailers','upgrade'].forEach((name) => delete responseHeaders[name]);

            console.info('[Proxy] rewritten and recompressed', {
              target: targetUrl.href,
              newEncoding: responseHeaders['content-encoding'] || 'identity',
              length: responseHeaders['content-length'],
            });

            res.writeHead(proxRes.statusCode, responseHeaders);
            res.end(outputBuffer);
            await saveCookieJar(req, jar);
          } catch (e) {
            console.error('[Proxy] text rewrite failed', e);
            if (!res.headersSent) res.status(500).send('Proxy rewrite failed');
          }
        });
        return;
      } catch (e) {
        console.error('Proxy response handling error', e);
        if (!res.headersSent) res.status(500).send('Proxy processing error');
      }
    });
  }catch(error){
    console.error('Proxy handler error', error);
    res.status(500).send('Proxy error');
  }
});

function attachUpgrade(server){
  server.on('upgrade', (req, socket, head) => {
    try{
      const incoming = new URL(req.url, `http://${req.headers.host}`);
      const rawTarget = incoming.searchParams.get('target') || incoming.searchParams.get('url') || req.url.replace(/^\/service\/?/i, '');
      if(!rawTarget) return socket.destroy();
      const target = normalizeTarget(decodeURIComponent(rawTarget));
      const targetUrl = new URL(target);
      const wsProtocol = targetUrl.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsTarget = targetUrl.href.replace(/^https?:/, wsProtocol);
      wsProxy.ws(req, socket, head, { target: wsTarget, changeOrigin: true }, (err) => {
        if(err) socket.end();
      });
    }catch(e){
      socket.destroy();
    }
  });
}

module.exports = router;
module.exports.attachUpgrade = attachUpgrade;
