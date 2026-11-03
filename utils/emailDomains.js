/**
 * File:      (web) utils/emailDomains.js
 * Repo path: apps/web/utils/emailDomains.js  (srcDir-relative)           NEW FILE (organisation email domains)
 *
 * Client-side helpers for an organisation's allowed email domains. Only for
 * hints and early warnings in the forms: the CMS checks every add, import,
 * extension and reactivation itself (cms src/utils/org-email-domains.js),
 * with the same exact-match rule. Imported explicitly by pages/organisation/*.vue.
 */

/** "newvision.co.ug, @visiongroup.co.ug" -> ['newvision.co.ug', 'visiongroup.co.ug'] */
export function splitDomains(text) {
  const parts = Array.isArray(text) ? text : String(text || '').split(/[\s,;]+/)
  const out = []
  for (const raw of parts) {
    let d = String(raw || '').trim().toLowerCase()
    if (!d) continue
    if (d.includes('@')) d = d.slice(d.lastIndexOf('@') + 1)
    d = d.replace(/^\.+|\.+$/g, '')
    if (d && !out.includes(d)) out.push(d)
  }
  return out
}

/** True when the list is empty (any email) or the email's domain is on it. */
export function emailFitsDomains(email, domains) {
  const list = splitDomains(domains)
  if (!list.length) return true
  const e = String(email || '').trim().toLowerCase()
  const at = e.lastIndexOf('@')
  return at > 0 && list.includes(e.slice(at + 1))
}

/** "@a.co.ug" or "@a.co.ug or @b.go.ug" */
export function describeDomains(domains) {
  const at = splitDomains(domains).map((d) => `@${d}`)
  if (at.length <= 1) return at[0] || ''
  return `${at.slice(0, -1).join(', ')} or ${at[at.length - 1]}`
}