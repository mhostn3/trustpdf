/*
  TrustPDF page copying without leftovers, for the tools that save only some
  pages of a PDF (Remove pages, Extract pages, Split, Redact).

  pdf-lib's copyPages() copies a page together with everything it refers to.
  In real files that is often more than the page itself:
    - a link (a table of contents entry, say) points at another page, and that
      page comes along, content and all, invisible but still in the file;
    - a form field's widget points at its field, whose other widgets point at
      their pages;
    - one resource dictionary is shared by every page (often inherited from
      the page tree), so the forms, images and fonts of all pages come along.
  So a page the visitor removed could still be read out of the saved file.

  prepare() gives each page to be copied resource dictionaries of its own that
  hold only the names its content uses; clean() then drops the references to
  pages that are not in the new file and deletes every object nothing points
  to any more. Used on the page (window) and in trustpdf-worker.js (self).
*/
(function (root) {
  "use strict";
  const L = () => root.PDFLib;
  const N = (name) => L().PDFName.of(name);

  const RESOURCE_KINDS = ["XObject", "Font", "ExtGState", "Pattern", "Shading", "ColorSpace", "Properties"];
  const NAME_TOKEN = /\/([^\s/[\]()<>{}%]+)/g;

  class CannotPrune extends Error {}

  function streamBytes(stream) {
    if (stream instanceof L().PDFRawStream) return L().decodePDFRawStream(stream).decode();
    if (typeof stream.getContents === "function") return stream.getContents();
    throw new CannotPrune("unknown stream type");
  }

  /** Every /Name written in the given content streams (a superset of the names the operators use). */
  function namesIn(streams) {
    const names = new Set();
    for (const stream of streams) {
      let text = "";
      const bytes = streamBytes(stream);
      for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      for (const m of text.matchAll(NAME_TOKEN)) {
        names.add(m[1].replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))));
      }
    }
    return names;
  }

  function pageStreams(node) {
    const contents = node.lookup(N("Contents"));
    if (!contents) return [];
    if (contents instanceof L().PDFArray) {
      return contents.asArray().map((_, i) => contents.lookup(i)).filter((s) => s instanceof L().PDFStream);
    }
    if (contents instanceof L().PDFStream) return [contents];
    throw new CannotPrune("unreadable page contents");
  }

  /**
   * Old files have forms, tiling patterns and Type 3 fonts without a resource dictionary:
   * they draw with the resources of the page that uses them. The names they use are
   * therefore counted as names of the page, or their images and fonts would be dropped.
   */
  function withBorrowedNames(resources, used) {
    const all = new Set(used);
    const done = new Set();
    const borrow = (stream) => { for (const n of namesIn([stream])) all.add(n); };
    for (let before = -1; before !== all.size;) {
      before = all.size;
      for (const kind of ["XObject", "Pattern", "Font"]) {
        const group = resources.lookup(N(kind));
        if (!(group instanceof L().PDFDict)) continue;
        for (const [name] of group.entries()) {
          const id = `${kind}/${name.decodeText()}`;
          if (!all.has(name.decodeText()) || done.has(id)) continue;
          done.add(id);
          const obj = group.lookup(name);
          if (obj instanceof L().PDFStream) {
            const drawn = obj.dict.get(N("Subtype")) === N("Form") || obj.dict.has(N("PatternType"));
            if (drawn && !obj.dict.has(N("Resources"))) borrow(obj);
          } else if (kind === "Font" && obj instanceof L().PDFDict && obj.get(N("Subtype")) === N("Type3") && !obj.has(N("Resources"))) {
            const procs = obj.lookup(N("CharProcs"));
            if (procs instanceof L().PDFDict) {
              for (const [glyph] of procs.entries()) {
                const proc = procs.lookup(glyph);
                if (proc instanceof L().PDFStream) borrow(proc);
              }
            }
          }
        }
      }
    }
    return all;
  }

  /** A copy of `resources` with only the used names; nested content is pruned in place. */
  function prunedResources(context, resources, used, seen) {
    const out = L().PDFDict.withContext(context);
    if (!(resources instanceof L().PDFDict)) return out;
    used = withBorrowedNames(resources, used);
    for (const [key, value] of resources.entries()) {
      const kind = key.decodeText();
      if (!RESOURCE_KINDS.includes(kind)) { out.set(key, value); continue; } // e.g. /ProcSet
      const group = resources.lookup(key);
      if (!(group instanceof L().PDFDict)) continue;
      const kept = L().PDFDict.withContext(context);
      for (const [name, entry] of group.entries()) {
        if (!used.has(name.decodeText())) continue;
        kept.set(name, entry);
        pruneNested(context, kind, group.lookup(name), seen);
      }
      out.set(key, kept);
    }
    return out;
  }

  /** Content that has resources of its own: forms, tiling patterns, soft masks, Type 3 fonts. */
  function pruneNested(context, kind, obj, seen) {
    if (!obj || seen.has(obj)) return;
    seen.add(obj);
    if (obj instanceof L().PDFStream && obj.dict.has(N("Resources"))) {
      const resources = obj.dict.lookup(N("Resources")); // form XObject or tiling pattern
      obj.dict.set(N("Resources"), prunedResources(context, resources, namesIn([obj]), seen));
    } else if (kind === "ExtGState" && obj instanceof L().PDFDict) {
      const mask = obj.lookup(N("SMask"));
      const group = mask instanceof L().PDFDict ? mask.lookup(N("G")) : null;
      if (group instanceof L().PDFStream) pruneNested(context, "XObject", group, seen);
    } else if (kind === "Font" && obj instanceof L().PDFDict && obj.has(N("Resources"))) {
      throw new CannotPrune("Type 3 font with resources");
    }
  }

  /** Give one page (and its annotations' appearances) resources that hold only what it draws. */
  function prunePage(page) {
    const node = page.node;
    const context = node.context;
    const seen = new Set();
    // Resources may be inherited from the page tree; the page gets its own pruned copy.
    const resources = node.Resources();
    node.set(N("Resources"), prunedResources(context, resources, namesIn(pageStreams(node)), seen));
    const annots = node.lookup(N("Annots"));
    if (!(annots instanceof L().PDFArray)) return;
    for (let i = 0; i < annots.size(); i++) {
      const annot = annots.lookup(i);
      const ap = annot instanceof L().PDFDict ? annot.lookup(N("AP")) : null;
      if (!(ap instanceof L().PDFDict)) continue;
      for (const [key] of ap.entries()) {
        const look = ap.lookup(key);
        const states = look instanceof L().PDFStream ? [look]
          : look instanceof L().PDFDict ? look.entries().map(([k]) => look.lookup(k)) : [];
        states.forEach((s) => { if (s instanceof L().PDFStream) pruneNested(context, "XObject", s, seen); });
      }
    }
  }

  /**
   * Prune the resources of source pages (0-based indices) before copyPages().
   * Returns the indices whose resources could not be separated (an unusual
   * structure): Redact rebuilds those pages as images, the other tools copy
   * them with their resources as they are.
   */
  function prepare(source, indices) {
    const pages = source.getPages();
    const failed = new Set();
    for (const i of indices) {
      try {
        prunePage(pages[i]);
      } catch (error) {
        console.warn(`Page ${i + 1}: resources could not be separated`, error);
        failed.add(i);
      }
    }
    return failed;
  }

  /**
   * copyPages() gives a link target its own copy of the page, outside the page tree,
   * so even links between two copied pages lead nowhere. Both copies share the copied
   * content stream, which maps such a stray copy to the real page.
   * Returns { pageRefs, alias (stray ref -> real ref), retarget(dest) }.
   */
  function linkMap(doc) {
    const ctx = doc.context;
    const pages = doc.getPages();
    const pageRefs = new Set(pages.map((p) => p.ref.toString()));
    const contentsKey = (dict) => { const c = dict.get(N("Contents")); return c ? c.toString() : null; };
    const byContents = new Map();
    pages.forEach((p) => { const key = contentsKey(p.node); if (key) byContents.set(key, p.ref); });
    const alias = new Map();
    for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
      if (obj instanceof L().PDFDict && obj.get(N("Type")) === N("Page") && !pageRefs.has(ref.toString())) {
        const real = byContents.get(contentsKey(obj));
        if (real) alias.set(ref.toString(), real);
      }
    }
    /** Point an explicit destination ([page /XYZ ...]) at a page of this file; false when it has none. */
    const retarget = (dest) => {
      if (!(dest instanceof L().PDFArray)) { // a named destination has nothing to follow
        return dest instanceof L().PDFName || dest instanceof L().PDFString || dest instanceof L().PDFHexString;
      }
      const target = dest.get(0);
      if (!(target instanceof L().PDFRef)) return true;
      if (pageRefs.has(target.toString())) return true;
      const real = alias.get(target.toString());
      if (real) dest.set(0, real);
      return Boolean(real);
    };
    return { pageRefs, alias, retarget };
  }

  /**
   * For Merge, where every page of every file is kept: make the links between
   * pages work again (see linkMap) and drop the stray page copies. Nothing else
   * is taken out.
   */
  function relink(doc) {
    const ctx = doc.context;
    const { alias, retarget } = linkMap(doc);
    if (!alias.size) return;
    for (const page of doc.getPages()) {
      const annots = page.node.lookup(N("Annots"));
      if (!(annots instanceof L().PDFArray)) continue;
      for (let i = 0; i < annots.size(); i++) {
        const annot = annots.lookup(i);
        if (!(annot instanceof L().PDFDict)) continue;
        const p = annot.get(N("P"));
        if (p instanceof L().PDFRef && alias.has(p.toString())) annot.set(N("P"), page.ref);
        if (annot.has(N("Dest"))) retarget(annot.lookup(N("Dest")));
        const action = annot.lookup(N("A"));
        if (action instanceof L().PDFDict && action.get(N("S")) === N("GoTo")) retarget(action.lookup(N("D")));
      }
    }
    for (const ref of alias.keys()) {
      const [number, generation] = ref.split(" ");
      ctx.delete(L().PDFRef.of(Number(number), Number(generation)));
    }
    collectGarbage(ctx);
  }

  /**
   * After the pages are added to `doc`: point links at the pages of the new file,
   * drop references to pages that are not in it (links, annotation owners, form
   * field trees, actions that list form fields), then delete every page object
   * outside the page tree, every form field that is not on these pages and every
   * object nothing refers to any more.
   */
  function clean(doc) {
    const ctx = doc.context;
    const pages = doc.getPages();
    const { pageRefs, retarget } = linkMap(doc);

    for (const page of pages) {
      const annots = page.node.lookup(N("Annots"));
      if (!(annots instanceof L().PDFArray)) continue;
      const own = new Set(annots.asArray().map((a) => a.toString()));
      for (let i = 0; i < annots.size(); i++) {
        const annot = annots.lookup(i);
        if (!(annot instanceof L().PDFDict)) continue;
        // The field tree links to widgets on other pages; the widget keeps its appearance.
        annot.delete(N("Parent"));
        const p = annot.get(N("P"));
        if (p && !(p instanceof L().PDFRef && p.toString() === page.ref.toString())) annot.delete(N("P"));
        ["Popup", "IRT"].forEach((key) => {
          const target = annot.get(N(key));
          if (target && !(target instanceof L().PDFRef && own.has(target.toString()))) annot.delete(N(key));
        });
        if (annot.has(N("Dest")) && !retarget(annot.lookup(N("Dest")))) annot.delete(N("Dest"));
        // Only actions that cannot name other objects stay: a web link, a named action,
        // a jump to a page of this file. "Reset form", "Hide" and scripts list form
        // fields, and a field holds the values typed on pages that are not in this file.
        const action = annot.lookup(N("A"));
        if (annot.has(N("A")) && !(action instanceof L().PDFDict && !action.has(N("Next")) && harmless(action, retarget))) {
          annot.delete(N("A"));
        }
        annot.delete(N("AA"));
        annot.delete(N("PA"));
      }
    }
    for (const page of pages) {
      page.node.delete(N("AA")); // page open/close actions: the same kinds of action
      page.node.delete(N("B"));  // article beads chain through the other pages
    }
    // Form fields that are not a widget on one of these pages (reached in a way not listed above).
    const widgets = new Set();
    for (const page of pages) {
      const annots = page.node.lookup(N("Annots"));
      if (annots instanceof L().PDFArray) annots.asArray().forEach((a) => widgets.add(a.toString()));
    }
    for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
      if (!(obj instanceof L().PDFDict) || widgets.has(ref.toString())) continue;
      if (obj.has(N("FT")) || (obj.has(N("T")) && obj.has(N("Kids")))) ctx.delete(ref);
    }

    // Page objects that came along but are not pages of the new file.
    for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
      if (obj instanceof L().PDFDict && obj.get(N("Type")) === N("Page") && !pageRefs.has(ref.toString())) ctx.delete(ref);
    }
    collectGarbage(ctx);
  }

  /** True for an action that refers to nothing but a web address, a menu item or a page of this file. */
  function harmless(action, retarget) {
    const kind = action.get(N("S"));
    if (kind === N("URI") || kind === N("Named")) return true;
    return kind === N("GoTo") && !action.has(N("SD")) && retarget(action.lookup(N("D")));
  }

  /** Delete every indirect object that cannot be reached from the trailer. */
  function collectGarbage(ctx) {
    const reached = new Set();
    const stack = [];
    const info = ctx.trailerInfo || {};
    [info.Root, info.Info, info.Encrypt, info.ID].forEach((v) => { if (v) stack.push(v); });
    while (stack.length) {
      const v = stack.pop();
      if (v instanceof L().PDFRef) {
        const key = v.toString();
        if (reached.has(key)) continue;
        reached.add(key);
        const obj = ctx.lookup(v);
        if (obj) stack.push(obj);
      } else if (v instanceof L().PDFDict) {
        for (const [, value] of v.entries()) stack.push(value);
      } else if (v instanceof L().PDFArray) {
        v.asArray().forEach((value) => stack.push(value));
      } else if (v instanceof L().PDFStream) {
        stack.push(v.dict);
      }
    }
    let removed = 0;
    for (const [ref] of ctx.enumerateIndirectObjects()) {
      if (!reached.has(ref.toString())) { ctx.delete(ref); removed++; }
    }
    return removed;
  }

  root.TrustPDFPageCopy = { prepare, clean, relink, collectGarbage, CannotPrune };
})(typeof self !== "undefined" ? self : window);
