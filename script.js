const getElement = (id) => document.getElementById(id);

let printMode = "bw";
let selectedFiles = [];
let nextFileId = 1;

const prices = {
  A5: {
    normal: { blackAndWhite: 1, fullColour: 19 }
  },
  A4: {
    normal: { blackAndWhite: 2, fullColour: 35 },
    sticker: { blackAndWhite: 10, fullColour: 45 }
  },
  A3: {
    normal: { blackAndWhite: 8, fullColour: 45 }
  }
};

if (typeof pdfjsLib !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

function makeTextSafe(text) {
  const element = document.createElement("div");
  element.textContent = text || "";
  return element.innerHTML;
}

function showError(message) {
  const errorMessage = getElement("error");
  if (!errorMessage) return;

  errorMessage.textContent = message;
  errorMessage.classList.toggle("hidden", message.length === 0);
}

function selectPrintMode(selectedMode) {
  printMode = selectedMode;

  getElement("bwMode").classList.toggle("active", printMode === "bw");
  getElement("colourMode").classList.toggle("active", printMode === "colour");
  getElement("summaryMode").textContent =
    printMode === "bw" ? "Black & white" : "Colour";

  const colourNote = getElement("colourNote");
  if (colourNote) {
    colourNote.classList.toggle("hidden", printMode !== "colour");
  }

  renderSelectedFiles();
}

function calculateColourCoverage(canvas) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return 0;

  const pixels = context.getImageData(
    0,
    0,
    canvas.width,
    canvas.height
  ).data;

  let totalColour = 0;
  let pixelCount = 0;

  for (let pixel = 0; pixel < pixels.length; pixel += 4) {
    const red = pixels[pixel];
    const green = pixels[pixel + 1];
    const blue = pixels[pixel + 2];
    const transparency = pixels[pixel + 3] / 255;
    const highestColour = Math.max(red, green, blue);
    const lowestColour = Math.min(red, green, blue);

    totalColour +=
      ((highestColour - lowestColour) / 255) * transparency;
    pixelCount += 1;
  }

  if (pixelCount === 0) return 0;
  return Math.max(0, Math.min(1, totalColour / pixelCount));
}

function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const temporaryURL = URL.createObjectURL(file);

    image.onload = function () {
      const scale = Math.min(
        1,
        720 / Math.max(image.width, image.height)
      );
      const canvas = document.createElement("canvas");

      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));

      const context = canvas.getContext("2d");
      context.fillStyle = "white";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      const colourCoverage = calculateColourCoverage(canvas);
      URL.revokeObjectURL(temporaryURL);
      resolve({ pages: 1, colourCoverage });
    };

    image.onerror = function () {
      URL.revokeObjectURL(temporaryURL);
      reject(new Error("The image could not be read."));
    };

    image.src = temporaryURL;
  });
}

async function loadPdfFile(file) {
  if (typeof pdfjsLib === "undefined") {
    throw new Error("The PDF reader did not load.");
  }

  const fileData = await file.arrayBuffer();
  const pdfDocument = await pdfjsLib.getDocument({ data: fileData }).promise;
  let combinedColourCoverage = 0;

  for (
    let pageNumber = 1;
    pageNumber <= pdfDocument.numPages;
    pageNumber += 1
  ) {
    const page = await pdfDocument.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 0.5 });
    const canvas = document.createElement("canvas");

    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));

    const context = canvas.getContext("2d");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: context, viewport }).promise;
    combinedColourCoverage += calculateColourCoverage(canvas);
  }

  return {
    pages: pdfDocument.numPages,
    colourCoverage:
      pdfDocument.numPages > 0
        ? combinedColourCoverage / pdfDocument.numPages
        : 0
  };
}

async function analyseFile(file) {
  const fileName = file.name.toLowerCase();
  const isPdf =
    file.type === "application/pdf" || fileName.endsWith(".pdf");
  const isImage =
    file.type.startsWith("image/") ||
    fileName.endsWith(".jpg") ||
    fileName.endsWith(".jpeg") ||
    fileName.endsWith(".png");

  if (!isPdf && !isImage) {
    throw new Error("Please upload PDF, JPG or PNG files.");
  }

  return isPdf ? loadPdfFile(file) : loadImageFile(file);
}

async function processUploadedFiles(fileList) {
  const files = Array.from(fileList);
  if (files.length === 0) return;

  showError("");
  showUploadLoading(files.length);
  let successfulFiles = 0;

  for (const file of files) {
    try {
      const information = await analyseFile(file);

      selectedFiles.push({
        id: nextFileId++,
        name: file.name,
        pages: information.pages,
        colourCoverage: information.colourCoverage,
        size: "A4",
        paper: "normal",
        copies: 1
      });

      successfulFiles += 1;
    } catch (error) {
      console.error(error);
      showError(`${file.name} could not be read.`);
    }
  }

  resetDropzone();
  if (successfulFiles > 0) renderSelectedFiles();
}

function showUploadLoading(fileCount) {
  getElement("dropzone").innerHTML = `
    <span class="spinner"></span>
    <b>Reading ${fileCount} ${fileCount === 1 ? "file" : "files"}…</b>
    <small>Calculating pages and colour use</small>
  `;
}

function resetDropzone() {
  getElement("dropzone").innerHTML = `
    <span class="upload-icon">+</span>
    <b>Add more files</b>
    <small>Select PDF, JPG or PNG files</small>
  `;
}

function getSelectedPrice(file) {
  const selectedPaper = file.size === "A4" ? file.paper : "normal";
  return prices[file.size][selectedPaper];
}

// Rate means the rounded price for one full copy of this file.
function getFileRate(file) {
  const selectedPrice = getSelectedPrice(file);
  let pricePerPage = selectedPrice.blackAndWhite;

  if (printMode === "colour") {
    pricePerPage += file.colourCoverage * selectedPrice.fullColour;
  }

  return Math.ceil(file.pages * pricePerPage);
}

function getFilePrice(file) {
  return getFileRate(file) * file.copies;
}

function getOrderTotal() {
  return selectedFiles.reduce(
    (total, file) => total + getFilePrice(file),
    0
  );
}

function getTotalPrintedPages() {
  return selectedFiles.reduce(
    (total, file) => total + file.pages * file.copies,
    0
  );
}

function getPaperDescription(file) {
  if (file.size === "A4" && file.paper === "sticker") {
    return "A4 Sticker Paper";
  }
  return `${file.size} Normal Paper`;
}

function renderSelectedFiles() {
  const selectedFilesSection = getElement("selectedFilesSection");
  const filesList = getElement("filesList");

  if (selectedFiles.length === 0) {
    selectedFilesSection.classList.add("hidden");
    filesList.innerHTML = "";
    updateOrderSummary();
    return;
  }

  selectedFilesSection.classList.remove("hidden");
  filesList.innerHTML = selectedFiles
    .map((file) => {
      const paperChoice =
        file.size === "A4"
          ? `
            <div class="file-setting">
              <label>Paper type</label>
              <select data-action="paper" data-file-id="${file.id}">
                <option value="normal" ${
                  file.paper === "normal" ? "selected" : ""
                }>Normal paper</option>
                <option value="sticker" ${
                  file.paper === "sticker" ? "selected" : ""
                }>Sticker paper</option>
              </select>
            </div>
          `
          : "";

      const colourDetails =
        printMode === "colour"
          ? `<span>${Math.round(file.colourCoverage * 100)}% colour</span>`
          : "";

      return `
        <article class="file-card" data-file-id="${file.id}">
          <div class="file-card-header">
            <div class="file-information">
              <span class="file-symbol">✓</span>
              <div>
                <b>${makeTextSafe(file.name)}</b>
                <small>
                  ${file.pages} ${file.pages === 1 ? "page" : "pages"}
                  ${colourDetails}
                </small>
              </div>
            </div>

            <button
              class="remove-file"
              type="button"
              data-action="remove"
              data-file-id="${file.id}"
            >Remove</button>
          </div>

          <div class="file-settings">
            <div class="file-setting">
              <label>Paper size</label>
              <select data-action="size" data-file-id="${file.id}">
                <option value="A5" ${
                  file.size === "A5" ? "selected" : ""
                }>A5</option>
                <option value="A4" ${
                  file.size === "A4" ? "selected" : ""
                }>A4</option>
                <option value="A3" ${
                  file.size === "A3" ? "selected" : ""
                }>A3</option>
              </select>
            </div>

            ${paperChoice}

            <div class="file-setting">
              <label>Copies</label>
              <div class="file-counter">
                <button type="button" data-action="decrease" data-file-id="${file.id}">−</button>
                <span>${file.copies}</span>
                <button type="button" data-action="increase" data-file-id="${file.id}">+</button>
              </div>
            </div>
          </div>

          <div class="file-price">
            <span>File total</span>
            <b>MVR ${getFilePrice(file)}</b>
          </div>
        </article>
      `;
    })
    .join("");

  updateOrderSummary();
}

function updateOrderSummary() {
  getElement("summaryFiles").textContent = selectedFiles.length;
  getElement("summaryPages").textContent = getTotalPrintedPages();
  getElement("total").textContent = getOrderTotal();
  getElement("payButton").disabled = selectedFiles.length === 0;

  const invoiceButton = getElement("invoiceButton");
  if (invoiceButton) invoiceButton.disabled = selectedFiles.length === 0;
}

function getCustomerInformation() {
  return {
    name: getElement("customerName")?.value.trim() || "",
    phone: getElement("customerPhone")?.value.trim() || "",
    email: getElement("customerEmail")?.value.trim() || "",
    contactMethod: getElement("contactMethod")?.value || "WhatsApp",
    notes: getElement("customerNotes")?.value.trim() || ""
  };
}

function validateCustomerInformation() {
  const customerError = getElement("customerError");

  if (!getElement("customerName") || !getElement("customerPhone")) {
    alert("Please add the customer information section to order.html first.");
    return false;
  }

  const customer = getCustomerInformation();

  if (customer.name.length < 2) {
    if (customerError) {
      customerError.textContent = "Please enter the customer’s full name.";
      customerError.classList.remove("hidden");
    }
    getElement("customerName").focus();
    return false;
  }

  const phoneDigits = customer.phone.replace(/\D/g, "");
  if (phoneDigits.length < 7) {
    if (customerError) {
      customerError.textContent = "Please enter a valid phone number.";
      customerError.classList.remove("hidden");
    }
    getElement("customerPhone").focus();
    return false;
  }

  if (customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
    if (customerError) {
      customerError.textContent = "Please enter a valid email address or leave it blank.";
      customerError.classList.remove("hidden");
    }
    getElement("customerEmail").focus();
    return false;
  }

  if (customerError) {
    customerError.textContent = "";
    customerError.classList.add("hidden");
  }

  return true;
}

function showInvoice() {
  if (selectedFiles.length === 0 || !validateCustomerInformation()) return;

  const modal = getElement("invoiceModal");
  const content = getElement("invoiceContent");

  if (!modal || !content) {
    alert("The invoice panel is missing from order.html.");
    return;
  }

  const customer = getCustomerInformation();
  const invoiceNumber = `FP-${Date.now().toString().slice(-8)}`;
  const invoiceDate = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });

  const invoiceRows = selectedFiles
    .map((file, index) => {
      const printDescription =
        printMode === "bw" ? "Black & white" : "Colour";

      return `
        <tr>
          <td>${index + 1}</td>
          <td class="invoice-file-name">
            <b>${makeTextSafe(file.name)}</b>
            <small>${printDescription} · ${getPaperDescription(file)}</small>
          </td>
          <td>${file.pages}</td>
          <td>${file.copies}</td>
          <td class="invoice-amount">MVR ${getFileRate(file)}</td>
          <td class="invoice-amount">MVR ${getFilePrice(file)}</td>
        </tr>
      `;
    })
    .join("");

  content.innerHTML = `
    <header class="invoice-header">
      <div class="invoice-brand">
        <span class="invoice-logo">F</span>
        <div>
          <h2>FazaaPrint</h2>
          <p>Printing made easier in Maldives</p>
        </div>
      </div>

      <div class="invoice-heading">
        <h1>INVOICE</h1>
        <p><b>Invoice:</b> ${invoiceNumber}</p>
        <p><b>Date:</b> ${invoiceDate}</p>
        <span class="invoice-status">AMOUNT DUE</span>
      </div>
    </header>

    <section class="invoice-customer">
      <div>
        <small>BILL TO</small>
        <h3>${makeTextSafe(customer.name)}</h3>
        <p>${makeTextSafe(customer.phone)}</p>
        ${customer.email ? `<p>${makeTextSafe(customer.email)}</p>` : ""}
      </div>

      <div>
        <small>PREFERRED CONTACT</small>
        <h3>${makeTextSafe(customer.contactMethod)}</h3>
        <p>${printMode === "bw" ? "Black & white" : "Colour"} printing</p>
      </div>
    </section>

    <section class="invoice-order-information">
      <div><small>FILES</small><b>${selectedFiles.length}</b></div>
      <div><small>PRINTED PAGES</small><b>${getTotalPrintedPages()}</b></div>
      <div><small>ORDER STATUS</small><b>Awaiting payment</b></div>
    </section>

    <div class="invoice-table-container">
      <table class="invoice-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Item &amp; Description</th>
            <th>Pages</th>
            <th>Qty</th>
            <th>Rate</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>${invoiceRows}</tbody>
      </table>
    </div>

    <section class="invoice-payment-summary">
      <div class="invoice-notes">
        <small>ORDER NOTES</small>
        <p>${
          customer.notes
            ? makeTextSafe(customer.notes)
            : "No additional order notes."
        }</p>
      </div>

      <div class="invoice-totals">
        <p><span>Subtotal</span><b>MVR ${getOrderTotal()}</b></p>
        <p><span>Total</span><b>MVR ${getOrderTotal()}</b></p>
        <p class="invoice-balance"><span>Balance due</span><strong>MVR ${getOrderTotal()}</strong></p>
      </div>
    </section>

    <p class="invoice-message">
      This invoice shows the amount due before payment. A paid invoice can be
      issued after payment has been successfully confirmed.
    </p>
  `;

  modal.classList.remove("hidden");
  document.body.classList.add("invoice-open");
}

function closeInvoice() {
  const modal = getElement("invoiceModal");
  if (modal) modal.classList.add("hidden");
  document.body.classList.remove("invoice-open");
}

getElement("bwMode").addEventListener("click", () => selectPrintMode("bw"));
getElement("colourMode").addEventListener("click", () => selectPrintMode("colour"));

getElement("fileInput").addEventListener("change", function (event) {
  processUploadedFiles(event.target.files);
  event.target.value = "";
});

getElement("dropzone").addEventListener("dragover", function (event) {
  event.preventDefault();
});

getElement("dropzone").addEventListener("drop", function (event) {
  event.preventDefault();
  processUploadedFiles(event.dataTransfer.files);
});

getElement("filesList").addEventListener("change", function (event) {
  const action = event.target.dataset.action;
  const fileId = Number(event.target.dataset.fileId);
  const file = selectedFiles.find((item) => item.id === fileId);
  if (!file) return;

  if (action === "size") {
    file.size = event.target.value;
    if (file.size !== "A4") file.paper = "normal";
  }

  if (action === "paper") file.paper = event.target.value;
  renderSelectedFiles();
});

getElement("filesList").addEventListener("click", function (event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const action = button.dataset.action;
  const fileId = Number(button.dataset.fileId);
  const file = selectedFiles.find((item) => item.id === fileId);

  if (action === "remove") {
    selectedFiles = selectedFiles.filter((item) => item.id !== fileId);
  }

  if (action === "decrease" && file) {
    file.copies = Math.max(1, file.copies - 1);
  }

  if (action === "increase" && file) {
    file.copies = Math.min(99, file.copies + 1);
  }

  renderSelectedFiles();
});

getElement("clearFiles").addEventListener("click", function () {
  selectedFiles = [];
  renderSelectedFiles();
  getElement("dropzone").innerHTML = `
    <span class="upload-icon">↑</span>
    <b>Choose your files</b>
    <small>Select one or several files</small>
  `;
});

const invoiceButton = getElement("invoiceButton");
if (invoiceButton) invoiceButton.addEventListener("click", showInvoice);

const closeInvoiceButton = getElement("closeInvoice");
if (closeInvoiceButton) closeInvoiceButton.addEventListener("click", closeInvoice);

const cancelInvoiceButton = getElement("cancelInvoice");
if (cancelInvoiceButton) cancelInvoiceButton.addEventListener("click", closeInvoice);

const invoiceBackdrop = getElement("invoiceBackdrop");
if (invoiceBackdrop) invoiceBackdrop.addEventListener("click", closeInvoice);

const printInvoiceButton = getElement("printInvoice");
if (printInvoiceButton) {
  printInvoiceButton.addEventListener("click", () => window.print());
}

document.addEventListener("keydown", function (event) {
  if (event.key === "Escape") closeInvoice();
});

getElement("payButton").addEventListener("click", function () {
  if (!validateCustomerInformation()) return;

  alert(
    "BML payment will work after the FazaaPrint merchant gateway is connected."
  );
});

selectPrintMode("bw");
