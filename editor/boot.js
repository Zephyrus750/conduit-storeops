// pdf.js reads floor-plan PDFs for the underlay; its worker is self-hosted.
if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
