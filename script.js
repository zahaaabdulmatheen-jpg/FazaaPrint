import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

const $ = (id) => document.getElementById(id);

let mode = "bw";
let fileInfo = null;
let copies = 1;

function setMode(nextMode) {
  mode = nextMode;

  $("bwMode").classList.toggle("active", mode === "bw");
  $("colourMode").classList.toggle("active", mode === "colour");

  $("summaryMode").textContent =
    mode === "bw" ? "Black & white" : "Colour";

  $("coverageRow").classList.toggle("hidden", mode !== "colour");
  $("colourNote").classList.toggle("hidden", mode !== "colour");

  updateTotal();
}

function updateTotal() {
  let price = 0;

  if (fileInfo) {
    if (mode === "bw") {
      price = fileInfo.pages * 2;
    } else {
      price = fileInfo.pages * fileInfo.coverage * 35;
    }
  }

  const finalTotal = price * copies;

  $("total").textContent = finalTotal.toFixed(2);
  $("summaryCopies").textContent = copies;
}

async function coverageFromCanvas(canvas) {
  const context = canvas.getContext("2d", {
    willReadFrequently: true
  });

  const pixels = context.getImageData(
    0,
    0,
    canvas.width,
    canvas.height
  ).data;

  let inkAmount = 0;

  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];

    inkAmount += 1 - (red + green + blue) / 765;
  }

  const coverage = inkAmount / (pixels.length / 4);

  return Math.max(0, Math.min(1, coverage));
}

async function analyseImage(file) {
  const bitmap = await createImageBitmap(file);

  const scale = Math.min(
    1,
    720 / Math.max(bitmap.width, bitmap.height)
  );

  const canvas = document.createElement("canvas");

  canvas.width = Math.max(
    1,
    Math.round(bitmap.width * scale)
  );

  canvas.height = Math.max(
    1,
    Math.round(bitmap.height * scale)
  );

  const context = canvas.getContext("2d");

  context.drawImage(
    bitmap,
    0,
    0,
    canvas.width,
    canvas.height
  );

  const coverage = await coverageFromCanvas(canvas);

  bitmap.close();

  return {
    pages: 1,
    coverage: coverage
  };
}

async function analysePdf(file) {
  const pdf = await pdfjsLib.getDocument({
    data: await file.arrayBuffer()
  }).promise;

  let totalCoverage = 0;

  for (
    let pageNumber = 1;
    pageNumber <= pdf.numPages;
    pageNumber++
  ) {
    const page = await pdf.getPage(pageNumber);

    const viewport = page.getViewport({
      scale: 0.45
    });

    const canvas = document.createElement("canvas");

    canvas.width = Math.max(
      1,
      Math.round(viewport.width)
    );

    canvas.height = Math.max(
      1,
      Math.round(viewport.height)
    );

    const context = canvas.getContext("2d");

    await page.render({
      canvasContext: context,
      viewport: viewport
    }).promise;

    totalCoverage += await coverageFromCanvas(canvas);
  }

  return {
    pages: pdf.numPages,
    coverage:
      pdf.numPages > 0
        ? totalCoverage / pdf.numPages
        : 0
  };
}

async function acceptFile(file) {
  if (!file) {
    return;
  }

  const isPdf =
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf");

  const isImage = file.type.startsWith("image/");

  if (!isPdf && !isImage) {
    showError("Please upload a PDF, JPG or PNG file.");
    return;
  }

  showError("");

  fileInfo = null;
  $("payButton").disabled = true;

  $("dropzone").innerHTML = `
    <span class="spinner"></span>
    <b>Reading your file…</b>
    <small>Calculating pages and colour use</small>
  `;

  try {
    if (isPdf) {
      fileInfo = await analysePdf(file);
    } else {
      fileInfo = await analyseImage(file);
    }

    $("dropzone").classList.add("has-file");

    $("dropzone").innerHTML = `
      <span class="file-check">✓</span>
      <b>${safeText(file.name)}</b>
      <small>
        ${fileInfo.pages}
        ${fileInfo.pages === 1 ? "page" : "pages"}
        detected · Click to replace
      </small>
    `;

    $("summaryPages").textContent = fileInfo.pages;

    $("summaryCoverage").textContent =
      `${Math.round(fileInfo.coverage * 100)}%`;

    $("payButton").disabled = false;

    updateTotal();
  } catch (error) {
    showError(
      "We could not read this file. Please try another PDF or image."
    );

    resetUpload();
  }
}

function safeText(text) {
  const element = document.createElement("div");

  element.textContent = text;

  return element.innerHTML;
}

function showError(message) {
  $("error").textContent = message;

  $("error").classList.toggle(
    "hidden",
    !message
  );
}

function resetUpload() {
  $("dropzone").classList.remove("has-file");

  $("dropzone").innerHTML = `
    <span class="upload-icon">↑</span>
    <b>Choose a file</b>
    <small>or drag and drop it here</small>
  `;
}

$("bwMode").addEventListener("click", () => {
  setMode("bw");
});

$("colourMode").addEventListener("click", () => {
  setMode("colour");
});

$("dropzone").addEventListener("click", () => {
  $("fileInput").click();
});

$("fileInput").addEventListener("change", (event) => {
  acceptFile(event.target.files[0]);
});

$("dropzone").addEventListener("dragover", (event) => {
  event.preventDefault();
});

$("dropzone").addEventListener("drop", (event) => {
  event.preventDefault();

  acceptFile(event.dataTransfer.files[0]);
});

$("minus").addEventListener("click", () => {
  copies = Math.max(1, copies - 1);

  $("copies").textContent = copies;

  updateTotal();
});

$("plus").addEventListener("click", () => {
  copies = Math.min(99, copies + 1);

  $("copies").textContent = copies;

  updateTotal();
});

$("payButton").addEventListener("click", () => {
  alert(
    "BML payment will work after your FazaaPrint merchant gateway details are connected."
  );
});
