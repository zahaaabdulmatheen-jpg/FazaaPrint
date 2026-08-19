const getElement = (id) => document.getElementById(id);

let printMode = "bw";
let uploadedFileInformation = null;
let numberOfCopies = 1;

if (typeof pdfjsLib !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

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
    const numberOfPages =
      uploadedFileInformation.pages;

    const blackAndWhiteCharge =
      numberOfPages * 2;

    if (printMode === "bw") {
      priceForOneCopy =
        blackAndWhiteCharge;
    } else {
      const colourCharge =
        numberOfPages *
        uploadedFileInformation.colourCoverage *
        35;

      priceForOneCopy =
        blackAndWhiteCharge +
        colourCharge;
    }
  }

  const finalPrice = Math.ceil(
    priceForOneCopy * numberOfCopies
  );

  getElement("total").textContent =
    finalPrice.toString();

  getElement("summaryCopies").textContent =
    numberOfCopies;
}

function calculateColourCoverage(canvas) {
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

  let totalColour = 0;
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

    const highestColour = Math.max(
      red,
      green,
      blue
    );

    const lowestColour = Math.min(
      red,
      green,
      blue
    );

    const colourAmount =
      ((highestColour - lowestColour) / 255) *
      transparency;

    totalColour += colourAmount;
    pixelCount++;
  }

  if (pixelCount === 0) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(1, totalColour / pixelCount)
  );
}

function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const temporaryURL =
      URL.createObjectURL(file);

    image.onload = function () {
      const maximumSize = 720;

      const scale = Math.min(
        1,
        maximumSize /
          Math.max(
            image.width,
            image.height
          )
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

      const context =
        canvas.getContext("2d");

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

      const colourCoverage =
        calculateColourCoverage(canvas);

      URL.revokeObjectURL(temporaryURL);

      resolve({
        pages: 1,
        colourCoverage: colourCoverage
      });
    };

    image.onerror = function () {
      URL.revokeObjectURL(temporaryURL);

      reject(
        new Error("Image could not be read.")
      );
    };

    image.src = temporaryURL;
  });
}

async function loadPdfFile(file) {
  if (typeof pdfjsLib === "undefined") {
    throw new Error(
      "The PDF reader did not load."
    );
  }

  const fileData =
    await file.arrayBuffer();

  const loadingTask =
    pdfjsLib.getDocument({
      data: fileData
    });

  const pdfDocument =
    await loadingTask.promise;

  let combinedColourCoverage = 0;

  for (
    let pageNumber = 1;
    pageNumber <= pdfDocument.numPages;
    pageNumber++
  ) {
    const page =
      await pdfDocument.getPage(pageNumber);

    const viewport =
      page.getViewport({
        scale: 0.5
      });

    const canvas =
      document.createElement("canvas");

    canvas.width = Math.max(
      1,
      Math.floor(viewport.width)
    );

    canvas.height = Math.max(
      1,
      Math.floor(viewport.height)
    );

    const context =
      canvas.getContext("2d");

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

    combinedColourCoverage +=
      calculateColourCoverage(canvas);
  }

  return {
    pages: pdfDocument.numPages,

    colourCoverage:
      pdfDocument.numPages > 0
        ? combinedColourCoverage /
          pdfDocument.numPages
        : 0
  };
}

async function processUploadedFile(file) {
  if (!file) {
    return;
  }

  const fileName =
    file.name.toLowerCase();

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
        uploadedFileInformation
          .colourCoverage * 100
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
  const errorMessage =
    getElement("error");

  errorMessage.textContent = message;

  errorMessage.classList.toggle(
    "hidden",
    message.length === 0
  );
}

function resetUploadArea() {
  uploadedFileInformation = null;

  getElement("summaryPages").textContent =
    "—";

  getElement(
    "summaryCoverage"
  ).textContent = "—";

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
}

getElement("bwMode").addEventListener(
  "click",
  function () {
    selectPrintMode("bw");
  }
);

getElement("colourMode").addEventListener(
  "click",
  function () {
    selectPrintMode("colour");
  }
);

const dropzone = getElement("dropzone");

if (
  dropzone.tagName.toLowerCase() !== "label"
) {
  dropzone.addEventListener(
    "click",
    function () {
      getElement("fileInput").click();
    }
  );
}

getElement("fileInput").addEventListener(
  "change",
  function (event) {
    processUploadedFile(
      event.target.files[0]
    );

    event.target.value = "";
  }
);

dropzone.addEventListener(
  "dragover",
  function (event) {
    event.preventDefault();
  }
);

dropzone.addEventListener(
  "drop",
  function (event) {
    event.preventDefault();

    processUploadedFile(
      event.dataTransfer.files[0]
    );
  }
);

getElement("minus").addEventListener(
  "click",
  function () {
    numberOfCopies = Math.max(
      1,
      numberOfCopies - 1
    );

    getElement("copies").textContent =
      numberOfCopies;

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
