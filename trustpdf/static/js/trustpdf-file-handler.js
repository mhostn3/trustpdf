class TrustPDFFileHandler {
  constructor(options) {
    this.dropZone = document.getElementById(options.dropZoneId);
    this.input = document.getElementById(options.inputId);

    this.fileList = options.fileListId
      ? document.getElementById(options.fileListId)
      : null;

    this.totalSizeDisplay = options.totalSizeId
      ? document.getElementById(options.totalSizeId)
      : null;

    this.multiple = options.multiple || false;
    this.sortable = options.sortable || false;
    this.accept = options.accept || ['application/pdf'];

    this.fileMap = new Map();
    this.loadedFile = null;
    this.sortableList = null;

    this.onChange = options.onChange || null;

    this.originalDropZoneHTML = this.dropZone.innerHTML;

    this.bindDropZoneEvents();
    this.bindInputEvent();

    this.initSortable();
  }

  bindDropZoneEvents() {
    window.addEventListener("dragover", e => e.preventDefault());
    window.addEventListener("drop", e => e.preventDefault());

    this.dropZone.addEventListener('click', () => {
      if (this.input) {
        this.input.click();
      }
    });

    this.dropZone.addEventListener('dragover', e => {
      e.preventDefault();
      this.dropZone.classList.add('border-primary');
    });

    this.dropZone.addEventListener('dragleave', () => {
      this.dropZone.classList.remove('border-primary');
    });

    this.dropZone.addEventListener('drop', e => {
      e.preventDefault();
      this.dropZone.classList.remove('border-primary');

      this.handleFiles(e.dataTransfer.files);
    });
  }

  bindInputEvent() {
    if (!this.input) return;

    this.input.addEventListener('change', e => {
      this.handleFiles(e.target.files);
    });
  }

  initSortable() {
    if (
      this.sortable &&
      this.fileList &&
      typeof Sortable !== 'undefined'
    ) {
      this.sortableList = new Sortable(this.fileList, {
        animation: 150
      });
    }
  }

  isAccepted(file) {
    if (!file) return false;

    return this.accept.some(type => {
      if (type.endsWith('/*')) {
        return file.type.startsWith(type.replace('/*', '/'));
      }

      return file.type === type;
    });
  }

  handleFiles(files) {
    if (!files || !files.length) return;

    if (this.multiple) {
      for (let file of files) {
        this.addFile(file);
      }
    } else {
      this.setSingleFile(files[0]);
    }

    this.updateTotalSize();

    if (this.onChange) {
      this.onChange(this.getFiles());
    }
  }

  addFile(file) {
    if (!this.isAccepted(file)) return;

    const key = this.getFileKey(file);

    if (this.fileMap.has(key)) return;

    this.fileMap.set(key, file);

    if (!this.fileList) return;

    const li = document.createElement('li');
    li.className = 'list-group-item';
    li.dataset.filekey = key;

    const fileWrapper = document.createElement('div');
    fileWrapper.className = 'd-flex align-items-center';

    const icon = document.createElement('i');
    icon.className = this.getIconClass(file);

    const span = document.createElement('span');
    const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
    span.textContent = `${file.name} (${sizeMB} MB)`;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn btn-sm btn-outline-danger';
    removeBtn.textContent = 'Remove';

    removeBtn.onclick = event => {
      event.stopPropagation();

      this.fileMap.delete(key);
      li.remove();

      this.updateTotalSize();

      if (this.onChange) {
        this.onChange(this.getFiles());
      }
    };

    fileWrapper.appendChild(icon);
    fileWrapper.appendChild(span);

    li.appendChild(fileWrapper);
    li.appendChild(removeBtn);

    this.fileList.appendChild(li);
  }

  setSingleFile(file) {
    if (!this.isAccepted(file)) return;

    this.loadedFile = file;

    this.dropZone.innerHTML = '';

    const icon = document.createElement('i');
    icon.className = this.getIconClass(file);

    const text = document.createElement('span');
    text.className = 'fw-bold text-success';
    text.textContent = `${file.name} loaded`;

    const wrapper = document.createElement('div');
    wrapper.className = 'd-flex align-items-center justify-content-center';

    wrapper.appendChild(icon);
    wrapper.appendChild(text);

    this.dropZone.appendChild(wrapper);
  }

  getFileKey(file) {
    return `${file.name}_${file.size}_${file.lastModified}`;
  }

  getIconClass(file) {
    if (file.type.startsWith('image/')) {
      return 'bi bi-file-earmark-image-fill text-primary me-2';
    }

    return 'bi bi-file-earmark-pdf-fill text-danger me-2';
  }

  getFiles() {
    if (this.multiple) {
      if (this.fileList) {
        const listItems = this.fileList.querySelectorAll('li');

        return Array.from(listItems)
          .map(li => this.fileMap.get(li.dataset.filekey))
          .filter(Boolean);
      }

      return Array.from(this.fileMap.values());
    }

    return this.loadedFile ? [this.loadedFile] : [];
  }

  getSingleFile() {
    return this.loadedFile;
  }

  updateTotalSize() {
    if (!this.totalSizeDisplay) return;

    const files = this.getFiles();

    if (!files.length) {
      this.totalSizeDisplay.textContent = '';
      return;
    }

    const totalBytes = files.reduce((acc, file) => acc + file.size, 0);
    const totalMB = (totalBytes / (1024 * 1024)).toFixed(2);

    this.totalSizeDisplay.textContent = `Total size: ${totalMB} MB`;
  }

  disableRemoving() {
    if (!this.fileList) return;

    this.fileList
      .querySelectorAll('.btn-outline-danger')
      .forEach(btn => btn.remove());
  }

  disableSorting() {
    if (this.sortableList) {
      this.sortableList.option("disabled", true);
    }
  }

  enableSorting() {
    if (this.sortableList) {
      this.sortableList.option("disabled", false);
    }
  }

  reset() {
    this.fileMap.clear();
    this.loadedFile = null;

    if (this.fileList) {
      this.fileList.innerHTML = '';
    }

    this.dropZone.innerHTML = this.originalDropZoneHTML;

    this.input = this.dropZone.querySelector('input[type="file"]');

    if (this.input) {
      this.input.value = '';
      this.bindInputEvent();
    }

    this.updateTotalSize();

    if (this.sortableList) {
      this.sortableList.destroy();
      this.sortableList = null;
    }

    this.initSortable();

    if (this.onChange) {
      this.onChange(this.getFiles());
    }
  }
}