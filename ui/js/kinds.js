function codeKind(raw) {
  var text = String(raw || "").trim()
  if (!text || text.length > 180) return ""
  var head = text.split("(")[0].trim()
  if (!head || /[\s#%]/.test(head) || /^SLASH_/.test(head)) return ""
  if (/\.(?:lua|toc|txt|ya?ml|html|adoc|css|js|json)$/i.test(head)) return ""
  if (/^[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+$/.test(head)) return "event"
  if (/^Enum\./.test(head)) return "enum"
  if (/^C_[A-Z][A-Za-z0-9]+$/.test(head)) return "system"
  if (/^[A-Z][A-Za-z0-9]*(?:Info|Details|Key|Time|Data)\.[A-Za-z_]/.test(head)) return "table"
  if (/^[A-Z][A-Za-z0-9]*\.[A-Z][A-Za-z0-9]*$/.test(head) && !/^C_/.test(head)) return "enum"
  if (/^C_[A-Za-z0-9]+\.[A-Za-z_]/.test(head)) return "function"
  if (/^(?:string|table|math|bit|os|io|coroutine|debug|package|utf8)\.[A-Za-z_]/.test(head)) return "function"
  if (/^[A-Za-z_][\w]*:[A-Za-z_]/.test(head)) return "function"
  if (/^[A-Za-z_][\w]*\(/.test(text)) return "function"
  if (/^(?:Get|Set|Is|Has|Send|Make|Create|Add|Remove|Can|Are|In|Unit|Show|Hide|Toggle|Enable|Disable|Clear|Reset|Update|Load|Save|Open|Close|Find|Check|Use|Start|Stop|Request|Calculate|Register|Unregister|Replicate|Query|Sell|Buy|Post|Place|Cancel|Accept|Complete|Select|Pickup|Equip|Cast|Play)[A-Z][A-Za-z0-9]*$/.test(head) && head !== "AddOnMessageLockdown") return "function"
  if (/^[A-Z][A-Za-z0-9]*(?:Info|Details|Key|Time|Data|Mixin|Result|Results)$/.test(head) || /^(?:BigUInteger|WOWMONEY|time_t)$/.test(head)) return "table"
  return ""
}

function navKind(href, text) {
  var path = href || ""
  var label = (text || "").replace(/\s+/g, " ").trim()
  if (/tables\.html(?:$|[?#])/.test(path) || label === "Tables") return "table"
  if (/functions\.html(?:$|[?#])/.test(path) || label === "Functions and methods") return "function"
  if (/events\.html(?:$|[?#])/.test(path) || label === "Frames and events") return "event"
  return ""
}

function markKind(item, link, kind) {
  item.classList.add("kind-" + kind)
  link.classList.add("kind-" + kind)
}

function applyKinds(doc) {
  doc.querySelectorAll(".nav-item").forEach(function (item) {
    var link = item.querySelector(":scope > .nav-link, :scope > .nav-text")
    if (!link) return
    var kind = navKind(link.getAttribute("href") || "", link.textContent)
    if (!kind) return
    markKind(item, link, kind)
    if (link.classList.contains("nav-text")) {
      item.querySelectorAll(":scope > .nav-list > .nav-item").forEach(function (child) {
        var childLink = child.querySelector(":scope > .nav-link, :scope > .nav-text")
        if (!childLink || child.className.indexOf("kind-") >= 0) return
        var childKind = navKind(childLink.getAttribute("href") || "", childLink.textContent)
        markKind(child, childLink, childKind || kind)
      })
    }
  })
  doc.querySelectorAll("article.doc p code, article.doc li code, article.doc td code, article.doc h1 code, article.doc h2 code, article.doc h3 code, article.doc dd code").forEach(function (node) {
    if (node.closest("pre")) return
    var kind = codeKind(node.textContent)
    if (kind) node.classList.add("kind-" + kind)
  })
}

if (typeof document !== "undefined") applyKinds(document)
