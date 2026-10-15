'use strict'

module.exports = (componentVersion, page) => {
  const current = componentVersion && componentVersion.url
  if (!current) return '#missing-version'
  return current.replace(/[^/]*$/, page)
}
