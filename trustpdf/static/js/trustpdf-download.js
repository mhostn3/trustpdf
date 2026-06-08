class TrustPDFDownload {
  constructor() {
    this.blobUrl = null;
    this.filename = null;
  }

  prepare(blob, filename) {
    this.clear();

    this.blobUrl = URL.createObjectURL(blob);
    this.filename = filename;
  }

  download(event) {
    if (event) {
      event.preventDefault();
    }

    if (!this.blobUrl || !this.filename) {
      alert("Please process the file first.");
      return;
    }

    const tempLink = document.createElement('a');
    tempLink.href = this.blobUrl;
    tempLink.download = this.filename;
    tempLink.style.display = 'none';

    document.body.appendChild(tempLink);
    tempLink.click();
    document.body.removeChild(tempLink);
  }

  clear() {
    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl);
    }

    this.blobUrl = null;
    this.filename = null;
  }
}


function makeTrustPDFFilename(originalName, fallbackPrefix = "file") {
  const now = new Date();

  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');

  const dateStr = `${yyyy}-${mm}-${dd}`;

  const baseName = originalName || fallbackPrefix;

  const shortName = baseName
    .slice(0, 5)
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase() || fallbackPrefix;

  return `TrustPDF_${shortName}_${dateStr}.pdf`;
}


function downloadProcessedFile(event) {
  if (!window.downloadManager) {
    alert("Download manager is not initialized.");
    return;
  }

  window.downloadManager.download(event);
}