const getElement = (id) =>
  document.getElementById(id);

let printMode = "bw";
let selectedFiles = [];
let nextFileId = 1;

const prices = {
  A5: {
    normal: {
      blackAndWhite: 1,
      fullColour: 19
    }
  },

  A4: {
    normal: {
      blackAndWhite: 2,
      fullColour: 35
    },

    sticker: {
      blackAndWhite: 10,
      fullColour: 45
    }
  },

  A3: {
    normal: {
      blackAndWhite: 8,
      fullColour: 45
    }
  }
};

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

  getElement("colourNote").classList.toggle(
    "hidden",
    printMode !== "colour"
  );

  renderSelectedFiles();
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

    const transparency =
      pixels[pixel + 3] / 255;

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
    Math.min(
      1,
      totalColour / pixelCount
    )
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
        Math.round(
          image.width * scale
        )
      );

      canvas.height = Math.max(
        1,
        Math.round(
          image.height * scale
        )
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
        new Error(
          "The image could not be read."
        )
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
      await pdfDocument.getPage(
        pageNumber
      );

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

async function analyseFile(file) {
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
    throw new Error(
      "Please upload PDF, JPG or PNG files."
    );
  }

  if (isPdf) {
    return await loadPdfFile(file);
  }

  return await loadImageFile(file);
}

async function processUploadedFiles(fileList) {
  const files = Array.from(fileList);

  if (files.length === 0) {
    return;
  }

  showError("");

  showUploadLoading(files.length);

  let successfulFiles = 0;

  for (const file of files) {
    try {
      const information =
        await analyseFile(file);

      selectedFiles.push({
        id: nextFileId++,
        name: file.name,
        pages: information.pages,
        colourCoverage:
          information.colourCoverage,
        size: "A4",
        paper: "normal",
        copies: 1
      });

      successfulFiles++;
    } catch (error) {
      console.error(error);

      showError(
        `${file.name} could not be read.`
      );
    }
  }

  resetDropzone();

  if (successfulFiles > 0) {
    renderSelectedFiles();
  }
}

function showUploadLoading(fileCount) {
  getElement("dropzone").innerHTML = `
    <span class="spinner"></span>

    <b>
      Reading ${fileCount}
      ${fileCount === 1 ? "file" : "files"}…
    </b>

    <small>
      Calculating pages and colour use
    </small>
  `;
}

function resetDropzone() {
  getElement("dropzone").innerHTML = `
    <span class="upload-icon">+</span>

    <b>Add more files</b>

    <small>
      Select PDF, JPG or PNG files
    </small>
  `;
}

function getFilePrice(file) {
  const selectedPaper =
    file.size === "A4"
      ? file.paper
      : "normal";

  const selectedPrice =
    prices[file.size][selectedPaper];

  let pricePerPage =
    selectedPrice.blackAndWhite;

  if (printMode === "colour") {
    const colourUsageCharge =
      file.colourCoverage *
      selectedPrice.fullColour;

    pricePerPage +=
      colourUsageCharge;
  }

  const unroundedPrice =
    file.pages *
    file.copies *
    pricePerPage;

  return Math.ceil(unroundedPrice);
}

function getOrderTotal() {
  return selectedFiles.reduce(
    (total, file) =>
      total + getFilePrice(file),
    0
  );
}

function getTotalPrintedPages() {
  return selectedFiles.reduce(
    (total, file) =>
      total +
      file.pages * file.copies,
    0
  );
}

function renderSelectedFiles() {
  const selectedFilesSection =
    getElement("selectedFilesSection");

  const filesList =
    getElement("filesList");

  if (selectedFiles.length === 0) {
    selectedFilesSection.classList.add(
      "hidden"
    );

    filesList.innerHTML = "";

    updateOrderSummary();

    return;
  }

  selectedFilesSection.classList.remove(
    "hidden"
  );

  filesList.innerHTML =
    selectedFiles
      .map((file) => {
        const paperChoice =
          file.size === "A4"
            ? `
              <div class="file-setting">
                <label>
                  Paper type
                </label>

                <select
                  data-action="paper"
                  data-file-id="${file.id}"
                >
                  <option
                    value="normal"
                    ${
                      file.paper === "normal"
                        ? "selected"
                        : ""
                    }
                  >
                    Normal paper
                  </option>

                  <option
                    value="sticker"
                    ${
                      file.paper === "sticker"
                        ? "selected"
                        : ""
                    }
                  >
                    Sticker paper
                  </option>
                </select>
              </div>
            `
            : "";

        const colourDetails =
          printMode === "colour"
            ? `
              <span>
                ${Math.round(
                  file.colourCoverage * 100
                )}% colour
              </span>
            `
            : "";

        return `
          <article
            class="file-card"
            data-file-id="${file.id}"
          >
            <div class="file-card-header">
              <div class="file-information">
                <span class="file-symbol">
                  ✓
                </span>

                <div>
                  <b>
                    ${makeTextSafe(file.name)}
                  </b>

                  <small>
                    ${file.pages}
                    ${
                      file.pages === 1
                        ? "page"
                        : "pages"
                    }

                    ${colourDetails}
                  </small>
                </div>
              </div>

              <button
                class="remove-file"
                type="button"
                data-action="remove"
                data-file-id="${file.id}"
              >
                Remove
              </button>
            </div>

            <div class="file-settings">
              <div class="file-setting">
                <label>
                  Paper size
                </label>

                <select
                  data-action="size"
                  data-file-id="${file.id}"
                >
                  <option
                    value="A5"
                    ${
                      file.size === "A5"
                        ? "selected"
                        : ""
                    }
                  >
                    A5
                  </option>

                  <option
                    value="A4"
                    ${
                      file.size === "A4"
                        ? "selected"
                        : ""
                    }
                  >
                    A4
                  </option>

                  <option
                    value="A3"
                    ${
                      file.size === "A3"
                        ? "selected"
                        : ""
                    }
                  >
                    A3
                  </option>
                </select>
              </div>

              ${paperChoice}

              <div class="file-setting">
                <label>
                  Copies
                </label>

                <div class="file-counter">
                  <button
                    type="button"
                    data-action="decrease"
                    data-file-id="${file.id}"
                  >
                    −
                  </button>

                  <span>${file.copies}</span>

                  <button
                    type="button"
                    data-action="increase"
                    data-file-id="${file.id}"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <div class="file-price">
              <span>File total</span>

              <b>
                MVR ${getFilePrice(file)}
              </b>
            </div>
          </article>
        `;
      })
      .join("");

  updateOrderSummary();
}

function updateOrderSummary() {
  getElement("summaryFiles").textContent =
    selectedFiles.length;

  getElement("summaryPages").textContent =
    getTotalPrintedPages();

  getElement("total").textContent =
    getOrderTotal();

  function getPaperDescription(file) {
  if (file.size === "A4") {
    return file.paper === "sticker"
      ? "A4 Sticker Paper"
      : "A4 Normal Paper";
  }

  return `${file.size} Normal Paper`;
}

function createInvoice() {
  if (selectedFiles.length === 0) {
    return;
  }

  const invoiceNumber =
    "FP-" +
    Date.now()
      .toString()
      .slice(-8);

  const invoiceDate =
    new Date().toLocaleDateString(
      "en-GB",
      {
        day: "2-digit",
        month: "short",
        year: "numeric"
      }
    );

  const invoiceRows = selectedFiles
    .map((file, index) => {
      return `
        <tr>
          <td>
            ${index + 1}
          </td>

          <td>
            ${makeTextSafe(file.name)}
          </td>

          <td>
            ${getPaperDescription(file)}
          </td>

          <td>
            ${
              printMode === "bw"
                ? "Black & white"
                : "Colour"
            }
          </td>

          <td>
            ${file.pages}
          </td>

          <td>
            ${file.copies}
          </td>

          <td class="amount">
            MVR ${getFilePrice(file)}
          </td>
        </tr>
      `;
    })
    .join("");

  const invoiceWindow = window.open(
    "",
    "_blank",
    "width=900,height=750"
  );

  if (!invoiceWindow) {
    alert(
      "Please allow pop-ups to view your invoice."
    );

    return;
  }

  invoiceWindow.document.write(`
    <!doctype html>

    <html lang="en">
    <head>
      <meta charset="UTF-8">

      <meta
        name="viewport"
        content="width=device-width, initial-scale=1"
      >

      <title>
        FazaaPrint Invoice ${invoiceNumber}
      </title>

      <style>
        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          padding: 40px;
          background: #f8f4f5;
          color: #2d1720;
          font-family: Arial, Helvetica, sans-serif;
        }

        .invoice {
          max-width: 900px;
          margin: auto;
          padding: 42px;
          background: white;
          border-radius: 18px;
          box-shadow:
            0 15px 45px rgba(45, 23, 32, 0.12);
        }

        .invoice-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 30px;
          padding-bottom: 25px;
          border-bottom: 2px solid #f4dbe2;
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 24px;
          font-weight: 900;
        }

        .logo {
          display: grid;
          place-items: center;
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: #ef4778;
          color: white;
          font-size: 25px;
          font-weight: 900;
        }

        .invoice-title {
          text-align: right;
        }

        .invoice-title h1 {
          margin: 0 0 7px;
          color: #ef4778;
          font-size: 28px;
        }

        .invoice-title p {
          margin: 3px 0;
          color: #7d6c72;
          font-size: 13px;
        }

        .status {
          display: inline-block;
          margin-top: 14px;
          padding: 7px 12px;
          border-radius: 20px;
          background: #fff1c9;
          color: #77580e;
          font-size: 12px;
          font-weight: 900;
        }

        .invoice-information {
          margin: 28px 0;
          color: #7d6c72;
          line-height: 1.7;
        }

        .invoice-information b {
          color: #2d1720;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 25px;
          font-size: 13px;
        }

        th {
          padding: 12px 9px;
          background: #fff4f7;
          color: #7d6c72;
          text-align: left;
        }

        td {
          padding: 14px 9px;
          border-bottom: 1px solid #eee2e5;
          vertical-align: top;
        }

        .amount {
          white-space: nowrap;
          font-weight: 800;
        }

        .invoice-total {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 30px;
          margin-top: 30px;
          padding-top: 22px;
          border-top: 2px solid #f4dbe2;
        }

        .invoice-total span {
          font-size: 16px;
          font-weight: 800;
        }

        .invoice-total strong {
          color: #ef4778;
          font-size: 30px;
        }

        .invoice-note {
          margin-top: 35px;
          padding: 16px;
          border-radius: 10px;
          background: #fff8e6;
          color: #725a20;
          font-size: 12px;
          line-height: 1.6;
        }

        .actions {
          display: flex;
          justify-content: center;
          margin-top: 28px;
        }

        .actions button {
          border: 0;
          border-radius: 11px;
          padding: 13px 22px;
          background: #ef4778;
          color: white;
          font-size: 14px;
          font-weight: 900;
          cursor: pointer;
        }

        @media print {
          body {
            padding: 0;
            background: white;
          }

          .invoice {
            box-shadow: none;
          }

          .actions {
            display: none;
          }
        }
      </style>
    </head>

    <body>
      <main class="invoice">
        <header class="invoice-header">
          <div class="brand">
            <span class="logo">F</span>
            <span>FazaaPrint</span>
          </div>

          <div class="invoice-title">
            <h1>ORDER INVOICE</h1>

            <p>
              Invoice: ${invoiceNumber}
            </p>

            <p>
              Date: ${invoiceDate}
            </p>

            <span class="status">
              AMOUNT DUE
            </span>
          </div>
        </header>

        <section class="invoice-information">
          <b>Printing order</b><br>

          ${selectedFiles.length}
          ${
            selectedFiles.length === 1
              ? "file"
              : "files"
          }

          · ${getTotalPrintedPages()}
          printed pages
        </section>

        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>File</th>
              <th>Paper</th>
              <th>Printing</th>
              <th>Pages</th>
              <th>Copies</th>
              <th>Amount</th>
            </tr>
          </thead>

          <tbody>
            ${invoiceRows}
          </tbody>
        </table>

        <div class="invoice-total">
          <span>Total amount due</span>

          <strong>
            MVR ${getOrderTotal()}
          </strong>
        </div>

        <p class="invoice-note">
          This invoice shows the amount due before
          payment. A paid invoice will be issued after
          payment is successfully confirmed.
        </p>

        <div class="actions">
          <button onclick="window.print()">
            Print or save invoice
          </button>
        </div>
      </main>
    </body>
    </html>
  `);

  invoiceWindow.document.close();
}
  
  getElement("payButton").disabled =
    selectedFiles.length === 0;
  
  getElement("invoiceButton").disabled =
  selectedFiles.length === 0;
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

getElement("fileInput").addEventListener(
  "change",
  function (event) {
    processUploadedFiles(
      event.target.files
    );

    event.target.value = "";
  }
);

getElement("dropzone").addEventListener(
  "dragover",
  function (event) {
    event.preventDefault();
  }
);

getElement("dropzone").addEventListener(
  "drop",
  function (event) {
    event.preventDefault();

    processUploadedFiles(
      event.dataTransfer.files
    );
  }
);

getElement("filesList").addEventListener(
  "change",
  function (event) {
    const action =
      event.target.dataset.action;

    const fileId = Number(
      event.target.dataset.fileId
    );

    const file = selectedFiles.find(
      (item) => item.id === fileId
    );

    if (!file) {
      return;
    }

    if (action === "size") {
      file.size = event.target.value;

      if (file.size !== "A4") {
        file.paper = "normal";
      }
    }

    if (action === "paper") {
      file.paper = event.target.value;
    }

    renderSelectedFiles();
  }
);

getElement("filesList").addEventListener(
  "click",
  function (event) {
    const button = event.target.closest(
      "button[data-action]"
    );

    if (!button) {
      return;
    }

    const action =
      button.dataset.action;

    const fileId = Number(
      button.dataset.fileId
    );

    const file = selectedFiles.find(
      (item) => item.id === fileId
    );

    if (action === "remove") {
      selectedFiles =
        selectedFiles.filter(
          (item) => item.id !== fileId
        );
    }

    if (
      action === "decrease" &&
      file
    ) {
      file.copies = Math.max(
        1,
        file.copies - 1
      );
    }

    if (
      action === "increase" &&
      file
    ) {
      file.copies = Math.min(
        99,
        file.copies + 1
      );
    }

    renderSelectedFiles();
  }
);

getElement("clearFiles").addEventListener(
  "click",
  function () {
    selectedFiles = [];

    renderSelectedFiles();

    getElement("dropzone").innerHTML = `
      <span class="upload-icon">↑</span>

      <b>Choose your files</b>

      <small>
        Select one or several files
      </small>
    `;
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
