(function () {
  "use strict";
  const T = window.TrustPDF;
  const $ = T.$;

  const list = $("formFieldList");
  const box = $("formFields");
  const flatten = $("flattenForm");
  const flattenDefault = flatten.dataset.default === "on";

  // The fields of the loaded file: [{ name, kind, read() }]. Values are read
  // from the inputs when the user clicks the button, then written into a
  // freshly loaded copy of the PDF.
  let entries = [];
  let fieldCount = 0;
  let inputs = [];

  function kindOf(field) {
    if (field instanceof PDFLib.PDFTextField) return "text";
    if (field instanceof PDFLib.PDFCheckBox) return "checkbox";
    if (field instanceof PDFLib.PDFRadioGroup) return "radio";
    if (field instanceof PDFLib.PDFDropdown) return "dropdown";
    if (field instanceof PDFLib.PDFOptionList) return "list";
    return null; // push buttons and signature fields have nothing to type
  }

  /** "form1[0].page1[0].First_Name[0]" -> "First Name" */
  function prettyName(name) {
    const last = name.split(".").pop().replace(/\[\d+\]$/, "");
    const words = last.replace(/[_]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim();
    return words ? words.charAt(0).toUpperCase() + words.slice(1) : name;
  }

  /** The tooltip (/TU) a form designer gave the field, which is usually the question. */
  function fieldLabel(field) {
    try {
      const tu = field.acroField.dict.lookup(PDFLib.PDFName.of("TU"));
      if (tu && typeof tu.decodeText === "function") {
        const text = tu.decodeText().trim();
        if (text) return text.length > 140 ? `${text.slice(0, 137)}…` : text;
      }
    } catch (_) { /* no tooltip */ }
    return prettyName(field.getName());
  }

  /** Page number and position of a field's first widget, for ordering. */
  function placeOf(field, pageOfAnnot) {
    const widget = field.acroField.getWidgets()[0];
    if (!widget) return { page: 0, y: 0, x: 0 };
    const ref = field.doc.context.getObjectRef(widget.dict);
    const page = ref ? pageOfAnnot.get(ref.toString()) || 0 : 0;
    let rect = { x: 0, y: 0 };
    try { rect = widget.getRectangle(); } catch (_) { /* no /Rect */ }
    return { page, y: rect.y, x: rect.x };
  }

  function pageMap(doc) {
    const map = new Map();
    doc.getPages().forEach((page, i) => {
      const annots = page.node.Annots();
      if (!annots) return;
      for (let k = 0; k < annots.size(); k++) {
        const ref = annots.get(k);
        if (ref instanceof PDFLib.PDFRef) map.set(ref.toString(), i + 1);
      }
    });
    return map;
  }

  let uid = 0;
  function makeId() {
    uid += 1;
    return `ff${uid}`;
  }

  function el(tag, attrs = {}, text) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (value === true) node.setAttribute(key, "");
      else if (value !== false && value !== null && value !== undefined) node.setAttribute(key, value);
    });
    if (text !== undefined) node.textContent = text;
    return node;
  }

  /** Build the input for one field; returns { row, read } or null. */
  function buildInput(field, kind) {
    const id = makeId();
    const label = fieldLabel(field);
    const readOnly = field.isReadOnly();
    const row = el("div", { class: "mb-3" });

    if (kind === "checkbox") {
      const wrap = el("div", { class: "form-check" });
      const input = el("input", { class: "form-check-input", type: "checkbox", id, disabled: readOnly });
      input.checked = field.isChecked();
      wrap.append(input, el("label", { class: "form-check-label", for: id }, label));
      row.append(wrap);
      inputs.push(input);
      return { row, read: () => input.checked };
    }

    row.append(el("label", { class: "form-label", for: id }, label));

    if (kind === "text") {
      const multiline = field.isMultiline();
      const max = field.getMaxLength();
      const input = el(multiline ? "textarea" : "input", {
        class: "form-control",
        id,
        type: multiline ? null : "text",
        rows: multiline ? "3" : null,
        maxlength: max ? String(max) : null,
        autocomplete: "off",
        disabled: readOnly,
      });
      let value = "";
      try { value = field.getText() || ""; } catch (_) { /* rich text */ }
      input.value = value;
      row.append(input);
      inputs.push(input);
      return { row, read: () => input.value };
    }

    // Radio groups, drop-downs and lists all become a <select>.
    const multiple = kind === "list" && field.isMultiselect();
    const select = el("select", { class: "form-select", id, multiple, disabled: readOnly });
    const selected = new Set(field.getSelected ? [].concat(field.getSelected() || []) : []);
    if (!multiple) select.append(el("option", { value: "" }, "(nothing selected)"));
    field.getOptions().forEach((option) => {
      const opt = el("option", { value: option }, option);
      opt.selected = selected.has(option);
      select.append(opt);
    });
    row.append(select);
    inputs.push(select);
    return { row, read: () => (multiple ? Array.from(select.selectedOptions, (o) => o.value) : select.value) };
  }

  function clearFields() {
    entries = [];
    inputs = [];
    fieldCount = 0;
    list.replaceChildren();
    $("formFieldsSummary").textContent = "";
    box.classList.add("d-none");
  }

  async function showFields(file) {
    clearFields();
    const doc = await T.loadPdf(file);
    const hadXfa = hasXfa(doc);
    const form = doc.getForm();
    const pageOfAnnot = pageMap(doc);

    const usable = [];
    let skipped = 0;
    form.getFields().forEach((field) => {
      const kind = kindOf(field);
      if (!kind) { skipped += 1; return; }
      usable.push({ field, kind, place: placeOf(field, pageOfAnnot) });
    });
    fieldCount = usable.length;
    const pages = doc.getPageCount();
    const pageText = `${pages} page${pages === 1 ? "" : "s"}`;

    if (!usable.length) {
      handler.setInfo(`${pageText} · no fillable form fields`);
      T.messages.warn(hadXfa
        ? "This is an Adobe XFA form with no standard fields, which only Adobe Acrobat or Reader can fill in."
        : "This PDF has no fillable form fields. It may be a scan or a flat document; you can still sign it with Sign PDF.");
      return;
    }

    // Top to bottom, left to right, page by page: the order people read the form in.
    usable.sort((a, b) => (a.place.page - b.place.page) || (b.place.y - a.place.y) || (a.place.x - b.place.x));
    let currentPage = -1;
    usable.forEach(({ field, kind, place }) => {
      if (place.page !== currentPage) {
        currentPage = place.page;
        list.append(el("h3", { class: "form-fields-page" }, place.page ? `Page ${place.page}` : "Other fields"));
      }
      const built = buildInput(field, kind);
      list.append(built.row);
      entries.push({ name: field.getName(), kind, read: built.read });
    });

    $("formFieldsSummary").textContent =
      `${usable.length} field${usable.length === 1 ? "" : "s"} found.` +
      (skipped ? ` ${skipped} button or signature field${skipped === 1 ? " is" : "s are"} left as ${skipped === 1 ? "it is" : "they are"}.` : "") +
      (hadXfa ? " This form also has an Adobe XFA layer, which is removed; the standard fields are filled." : "");
    handler.setInfo(`${pageText} · ${usable.length} form field${usable.length === 1 ? "" : "s"}`);
    box.classList.remove("d-none");
  }

  function hasXfa(doc) {
    const acro = doc.catalog.lookup(PDFLib.PDFName.of("AcroForm"));
    return acro instanceof PDFLib.PDFDict && acro.has(PDFLib.PDFName.of("XFA"));
  }

  T.lockables.push({
    lock() { inputs.forEach((input) => { input.dataset.wasDisabled = input.disabled ? "1" : ""; input.disabled = true; }); },
    unlock() { inputs.forEach((input) => { input.disabled = input.dataset.wasDisabled === "1"; }); },
  });

  const handler = T.initTool({
    files: {
      multiple: false,
      accept: "pdf",
      async onChange(files) {
        if (!files.length) { clearFields(); return; }
        T.messages.clear();
        T.busy("Reading the form…");
        try {
          await showFields(files[0]);
        } catch (error) {
          clearFields();
          T.messages.error(T.friendlyMessage(error));
        } finally {
          T.idle();
        }
      },
    },
    busyText: "Filling in the form…",
    reset() {
      clearFields();
      flatten.checked = flattenDefault;
    },

    async process() {
      const file = handler.getSingleFile();
      if (!file) throw new T.ToolError("Please select a PDF file first.");
      if (!fieldCount) throw new T.ToolError("This PDF has no fillable form fields to fill in or flatten.");

      handler.lock();
      T.lockables.forEach((item) => item.lock());

      const doc = await T.loadPdf(file);
      const form = doc.getForm();
      const texts = [];
      let filled = 0;

      for (const entry of entries) {
        let field;
        try { field = form.getField(entry.name); } catch (_) { continue; }
        if (field.isReadOnly()) continue;
        const value = entry.read();
        try {
          if (entry.kind === "text") {
            const old = (() => { try { return field.getText() || ""; } catch (_) { return ""; } })();
            if (value !== old) field.setText(value || undefined);
            if (value) { texts.push(value); filled += 1; }
          } else if (entry.kind === "checkbox") {
            if (value) { field.check(); filled += 1; } else field.uncheck();
          } else if (entry.kind === "list") {
            const values = [].concat(value).filter(Boolean);
            if (values.length) { field.select(values); filled += 1; } else field.clear();
            texts.push(...values);
          } else if (value) {
            field.select(value);
            texts.push(value);
            filled += 1;
          } else {
            field.clear();
          }
        } catch (error) {
          throw new T.ToolError(`The field “${prettyName(entry.name)}” could not be filled in: ${error.message || error}`);
        }
      }

      // Plain Western text uses Helvetica; anything else (č, Greek, Cyrillic…) gets Noto Sans.
      const font = await T.textFont(doc, texts.join(" ") || "a");
      form.updateFieldAppearances(font);

      const flat = flatten.checked;
      if (flat) {
        // Fields the user did not touch may have no saved appearance (some forms leave
        // drawing them to the reader), so draw them all before they become page content.
        form.getFields().forEach((field) => { if (kindOf(field)) form.markFieldAsDirty(field.ref); });
        form.updateFieldAppearances(font);
        form.flatten({ updateFieldAppearances: false });
      }
      doc.setModificationDate(new Date());

      const bytes = await doc.save({ updateFieldAppearances: false });
      T.finish(bytes, T.makeFilename(file.name, flat ? "flattened" : "filled"), {
        note: `${filled} of ${entries.length} field${entries.length === 1 ? "" : "s"} filled in.` +
          (flat ? " The form was flattened, so the answers are now part of the page and can no longer be edited." : " The fields can still be edited in any PDF reader."),
      });
    },
  });
})();
