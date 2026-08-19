pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const getElement = (id) => document.getElementById(id);

let printMode = "bw";
let uploadedFileInformation = null;
let numberOfCopies = 1;

function selectPrintMode(selectedMode) {
  printMode = selectedMode;

  getElement("bwMode").classList.toggle(
    "active",
    printMode === "bw"
  );

  getElement("colourMode").classList.toggle(
    "active",
    printMode === "colour"
  );

  getElement("summaryMode").textContent =
    printMode === "bw"
      ? "Black & white"
      : "Colour";

  getElement("coverageRow").classList.toggle(
    "hidden",
    printMode !== "colour"
  );

  getElement("colourNote").classList.toggle(
    "hidden",
    printMode !== "colour"
  );

  calculateTotal();
}

function calculateTotal() {
  let priceForOneCopy = 0;

  if (uploadedFileInformation) {
    if (printMode === "bw") {
      priceForOneCopy =
        uploadedFileInformation.pages * 2;
    } else {
      priceForOneCopy =
        uploadedFileInformation.pages *
        uploadedFileInformation.coverage *
        35;
    }
  }

  const finalPrice =
    priceForOneCopy * numberOfCopies;

  getElement("total").textContent =
    finalPrice.toFixed(2);

  getElement("summaryCopies").textContent =
    numberOfCopies;
}

function calculateCanvasCoverage(canvas) {
  const context = canvas.getContext("2d", {
    willReadFrequently: true
  });

  if (!context) {
    return 0;
  }

  const imageData = context.getImageData(
    0,
    0,
    canvas.width,
    canvas.height
  );

  const pixels = imageData.data;

  let totalInk = 0;
  let pixelCount = 0;

  for (
    let pixel = 0;
    pixel < pixels.length;
    pixel += 4
  ) {
    const red = pixels[pixel];
    const green = pixels[pixel + 1];
    const blue = pixels[pixel + 2];
    const transparency = pixels[pixel + 3] / 255;

    const brightness =
      (red + green + blue) / 3;

    const inkAmount =
      (1 - brightness / 255) * transparency;

    totalInk += inkAmount;
    pixelCount++;
  }

  if (pixelCount === 0) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(1, totalInk / pixelCount)
  );
}

function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const temporaryURL = URL.createObjectURL(file);

    image.onload = function () {
      const maximumSize = 720;

      const scale = Math.min(
        1,
        maximumSize /
          Math.max(image.width, image.height)
      );

      const canvas =
        document.createElement("canvas");

      canvas.width = Math.max(
        1,
        Math.round(image.width * scale)
      );

      canvas.height = Math.max(
        1,
        Math.round(image.height * scale)
      );

      const context = canvas.getContext("2d");

      context.fillStyle = "white";

      context.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
      );

      context.drawImage(
        image,
        0,
        0,
        canvas.width,
        canvas.height
      );

      const coverage =
        calculateCanvasCoverage(canvas);

      URL.revokeObjectURL(temporaryURL);

      resolve({
        pages: 1,
        coverage: coverage
      });
    };

    image.onerror = function () {
      URL.revokeObjectURL(temporaryURL);
      reject(new Error("Image could not be read."));
    };

    image.src = temporaryURL;
  });
}

async function loadPdfFile(file) {
  const fileData = await file.arrayBuffer();

  const loadingTask = pdfjsLib.getDocument({
    data: fileData
  });

  const pdfDocument = await loadingTask.promise;

  let combinedCoverage = 0;

  for (
    let pageNumber = 1;
    pageNumber <= pdfDocument.numPages;
    pageNumber++
  ) {
    const page =
      await pdfDocument.getPage(pageNumber);

    const viewport = page.getViewport({
      scale: 0.5
    });

    const canvas =
      document.createElement("canvas");

    const context = canvas.getContext("2d");

    canvas.width = Math.max(
      1,
      Math.floor(viewport.width)
    );

    canvas.height = Math.max(
      1,
      Math.floor(viewport.height)
    );

    context.fillStyle = "white";

    context.fillRect(
      0,
      0,
      canvas.width,
      canvas.height
    );

    await page.render({
      canvasContext: context,
      viewport: viewport
    }).promise;

    combinedCoverage +=
      calculateCanvasCoverage(canvas);
  }

  return {
    pages: pdfDocument.numPages,

    coverage:
      pdfDocument.numPages > 0
        ? combinedCoverage /
          pdfDocument.numPages
        : 0
  };
}

async function processUploadedFile(file) {
  if (!file) {
    return;
  }

  const fileName = file.name.toLowerCase();

  const isPdf =
    file.type === "application/pdf" ||
    fileName.endsWith(".pdf");

  const isImage =
    file.type.startsWith("image/") ||
    fileName.endsWith(".jpg") ||
    fileName.endsWith(".jpeg") ||
    fileName.endsWith(".png");

  if (!isPdf && !isImage) {
    showError(
      "Please upload a PDF, JPG or PNG file."
    );

    return;
  }

  showError("");

  uploadedFileInformation = null;

  getElement("payButton").disabled = true;

  getElement("dropzone").classList.remove(
    "has-file"
  );

  getElement("dropzone").innerHTML = `
    <span class="spinner"></span>
    <b>Reading your file…</b>
    <small>
      Calculating pages and colour use
    </small>
  `;

  try {
    if (isPdf) {
      uploadedFileInformation =
        await loadPdfFile(file);
    } else {
      uploadedFileInformation =
        await loadImageFile(file);
    }

    getElement("dropzone").classList.add(
      "has-file"
    );

    getElement("dropzone").innerHTML = `
      <span class="file-check">✓</span>
      <b>${makeTextSafe(file.name)}</b>
      <small>
        ${uploadedFileInformation.pages}
        ${
          uploadedFileInformation.pages === 1
            ? "page"
            : "pages"
        }
        detected · Click to replace
      </small>
    `;

    getElement("summaryPages").textContent =
      uploadedFileInformation.pages;

    getElement(
      "summaryCoverage"
    ).textContent =
      Math.round(
        uploadedFileInformation.coverage * 100
      ) + "%";

    getElement("payButton").disabled = false;

    calculateTotal();
  } catch (error) {
    console.error(error);

    showError(
      "The file could not be read. Please try another PDF, JPG or PNG."
    );

    resetUploadArea();
  }
}

function makeTextSafe(text) {
  const temporaryElement =
    document.createElement("div");

  temporaryElement.textContent = text;

  return temporaryElement.innerHTML;
}

function showError(message) {
  const errorMessage = getElement("error");

  errorMessage.textContent = message;

  errorMessage.classList.toggle(
    "hidden",
    message.length === 0
  );
}

function resetUploadArea() {
  uploadedFileInformation = null;

  getElement("summaryPages").textContent = "—";
  getElement("summaryCoverage").textContent = "—";
  getElement("payButton").disabled = true;

  getElement("dropzone").classList.remove(
    "has-file"
  );

  getElement("dropzone").innerHTML = `
    <span class="upload-icon">↑</span>
    <b>Choose a file</b>
    <small>or drag and drop it here</small>
  `;

  calculateTotal();
function calculateTotal() {
  let priceForOneCopy = 0;

  if (uploadedFileInformation) {
    if (printMode === "bw") {
      priceForOneCopy =
        uploadedFileInformation.pages * 2;
    } else {
      const basicPrintingCharge = 2;

      const maximumExtraColourCharge =
        35 - basicPrintingCharge;

      const pricePerPage =
        basicPrintingCharge +
        uploadedFileInformation.coverage *
        maximumExtraColourCharge;

      priceForOneCopy =
        uploadedFileInformation.pages *
        pricePerPage;
    }
  }

  const finalPrice =
    Math.round(
      priceForOneCopy * numberOfCopies
    );

  getElement("total").textContent =
    finalPrice.toString();

  getElement("summaryCopies").textContent =
    numberOfCopies;
}

    calculateTotal();
  }
);

getElement("plus").addEventListener(
  "click",
  function () {
    numberOfCopies = Math.min(
      99,
      numberOfCopies + 1
    );

    getElement("copies").textContent =
      numberOfCopies;

    calculateTotal();
  }
);

getElement("payButton").addEventListener(
  "click",
  function () {
    alert(
      "BML payment will work after the FazaaPrint merchant gateway is connected."
    );
  }
);

selectPrintMode("bw");
