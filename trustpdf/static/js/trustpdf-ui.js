function hideUploadArea() {
  const dropZone = document.getElementById('dropZone');
  const fileInputLabel = document.getElementById('fileInputLabel');

  if (dropZone) {
    dropZone.style.display = 'none';
  }

  if (fileInputLabel) {
    fileInputLabel.style.display = 'none';
  }
}


function showUploadArea() {
  const dropZone = document.getElementById('dropZone');
  const fileInputLabel = document.getElementById('fileInputLabel');

  if (dropZone) {
    dropZone.style.display = 'block';
  }

  if (fileInputLabel) {
    fileInputLabel.style.display = 'block';
  }
}


function showDownloadArea() {
  const downloadArea = document.getElementById('downloadArea');

  if (downloadArea) {
    downloadArea.style.display = 'block';
  }
}


function hideDownloadArea() {
  const downloadArea = document.getElementById('downloadArea');

  if (downloadArea) {
    downloadArea.style.display = 'none';
  }
}


function hideProcessButton() {
  const processBtn = document.getElementById('processBtn');

  if (processBtn) {
    processBtn.style.display = 'none';
  }
}


function showProcessButton() {
  const processBtn = document.getElementById('processBtn');

  if (processBtn) {
    processBtn.style.display = 'inline-block';
  }
}


function prepareDownload(blob, filename) {
  if (!window.downloadManager) {
    window.downloadManager = new TrustPDFDownload();
  }

  window.downloadManager.prepare(blob, filename);

  const downloadLink = document.getElementById('downloadLink');

  if (downloadLink) {
    downloadLink.download = filename;
  }

  showDownloadArea();
}


function startAgain() {
  if (window.downloadManager) {
    window.downloadManager.clear();
  }

  if (window.fileHandler) {
    window.fileHandler.reset();
  }

  hideDownloadArea();
  showProcessButton();
  showUploadArea();

  if (typeof window.resetToolSpecificFields === 'function') {
    window.resetToolSpecificFields();
  }
}