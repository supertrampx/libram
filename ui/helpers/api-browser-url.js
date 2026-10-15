'use strict'

module.exports = (siteUrl) => {
  if (!siteUrl) return '/'
  try {
    const path = new URL(siteUrl).pathname
    if (!path || path === '/') return '/'
    return path.endsWith('/') ? path : `${path}/`
  } catch {
    return '/'
  }
}
