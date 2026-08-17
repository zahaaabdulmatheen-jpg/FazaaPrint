document.addEventListener("DOMContentLoaded", () => {
  setupMobileMenu();
  setupOrderCalculator();
  setupFileAnalyzer();
});

/* Mobile navigation */

function setupMobileMenu() {
  const menuButton = document.getElementById("menuButton");
  const navigation = document.getElementById("navigation");

  if (!menuButton || !navigation) return;

  menuButton.addEventListener("click", () => {
    navigation.classList.toggle("open");

    menuButton.textContent = navigation.classList.contains("open")
      ? "✕"
      : "☰";
  });

  navigation.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      navigation.classList.remove("open");
      menuButton.textContent = "☰";
    });
  });
}

/* Order calculator */

function setupOrderCalculator() {
  const orderForm = document.getElementById("orderForm");

  if (!orderForm) return;

  const printMode = document.getElementById("printMode");
  const sides = document.getElementById("sides");
  const pageCount = document.getElementById("pageCount");
  const copies = document.getElementById("copies");

  const binding = document.getElementById("binding");
  const laminate = document.getElementById("laminate");
  const scanning = document.getElementById("scanning");
  const staples = document.getElementById("staples");

  const coverageInput = document.getElementById("coverage");
  const coverageContainer = document.getElementById("coverageContainer");
  const coverageValue = document.getElementById("coverageValue");

  const printingPrice = document.getElementById("printingPrice");
  const extrasPrice = document.getElementById("extrasPrice");
  const totalPrice = document.getElementById("totalPrice");
  const calculationFormula = document.getElementById("calculationFormula");

  const controls = [
    printMode,
    sides,
    pageCount,
    copies,
    binding,
    laminate,
    scanning,
    staples,
    coverageInput
  ];

  controls.forEach((control) => {
    if (!control) return;

    control.addEventListener("input", calculateOrder);
    control.addEventListener("change", calculateOrder);
  });

  function calculateOrder() {
    const mode = printMode.value;
    const selectedSides = Math.max(1, Number(sides.value));
    const pages = Math.max(1, Number(pageCount.value));
    const copyAmount = Math.max(1, Number(copies.value));
    const coverage = Math.max(
      1,
      Math.min(100, Number(coverageInput.value))
    );

    coverageValue.textContent = `${coverage}%`;

    if (mode === "color") {
      coverageContainer.hidden = false;
    } else {
      coverageContainer.hidden = true;
    }

    let printTotal = 0;
    let formula = "";

    if (mode === "bw") {
      printTotal = pages * selectedSides * copyAmount * 2;

      formula =
        `${pages} page(s) × ${selectedSides} printed side(s) × ` +
        `${copyAmount} copy/copies × MVR 2`;
    } else {
      printTotal =
        pages *
        selectedSides *
        copyAmount *
        35 *
        (coverage / 100);

      formula =
        `${pages} page(s) × ${selectedSides} printed side(s) × ` +
        `${copyAmount} copy/copies × MVR 35 × ${coverage}% coverage`;
    }

    let extrasTotal = 0;

    if (binding.checked) {
      extrasTotal += 20;
    }

    if (laminate.checked) {
      extrasTotal += pages * copyAmount * 15;
    }

    if (scanning.checked) {
      extrasTotal += 10;
    }

    if (staples.checked) {
      extrasTotal += 4;
    }

    const finalTotal = printTotal + extrasTotal;

    printingPrice.textContent = formatMoney(printTotal);
    extrasPrice.textContent = formatMoney(extrasTotal);
    totalPrice.textContent = formatMoney(finalTotal);
    calculationFormula.textContent = formula;
  }

  calculateOrder();

  orderForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const customerName =
      document.getElementById("customerName")?.value.trim() || "";

    const customerPhone =
      document.getElementById("customerPhone")?.value.trim() || "";

    const notes =
      document.getElementById("orderNotes")?.value.trim() || "";

    if (!customerName || !customerPhone) {
      showMessage(
        "Please enter your name and phone number.",
        "error"
      );

      return;
    }

    const modeText =
      printMode.value === "bw" ? "B&W printing" : "Color printing";

    const sideText =
      sides.value === "2" ? "Double-sided" : "Single-sided";

    const selectedExtras = [];

    if (binding.checked) selectedExtras.push("Binding");
    if (laminate.checked) selectedExtras.push("Laminate");
    if (scanning.checked) selectedExtras.push("Scanning");
    if (staples.checked) selectedExtras.push("Staples");

    const message = [
      "Hi FazaaPrint, I would like to place an order.",
      "",
      `Name: ${customerName}`,
      `Phone: ${customerPhone}`,
      `Printing: ${modeText}`,
      `Setup: ${sideText}`,
      `Pages: ${pageCount.value}`,
      `Copies: ${copies.value}`,
      printMode.value === "color"
        ? `Estimated color coverage: ${coverageInput.value}%`
        : "",
      `Extras: ${
        selectedExtras.length
          ? selectedExtras.join(", ")
          : "None"
      }`,
      `Estimated total: ${totalPrice.textContent}`,
      notes ? `Notes: ${notes}` : "",
      "",
      "Please confirm the final price before printing."
    ]
      .filter(Boolean)
      .join("\n");

    const whatsappURL =
      "https://wa.me/?text=" + encodeURIComponent(message);

    window.open(whatsappURL, "_blank");
  });
}

/* Image color-coverage estimator */

function setupFileAnalyzer() {
  const fileInput = document.getElementById("printFile");
  const analysisStatus = document.getElementById("analysisStatus");
  const pageBreakdown = document.getElementById("pageBreakdown");
  const pageCount = document.getElementById("pageCount");
  const printMode = document.getElementById("printMode");
  const coverageInput = document.getElementById("coverage");

  if (!fileInput) return;

  fileInput.addEventListener("change", async () => {
    const files = Array.from(fileInput.files || []);

    if (!files.length) return;

    analysisStatus.textContent = "Analyzing your file…";
    pageBreakdown.innerHTML = "";

    const results = [];

    for (const file of files) {
      if (file.type.startsWith("image/")) {
        try {
          const result = await analyzeImage(file);
          results.push(result);
        } catch (error) {
          results.push({
            name: file.name,
            coverage: 30,
            estimatedPrice: 10.5,
            note: "Automatic analysis was unavailable."
          });
        }
      } else if (file.type === "application/pdf") {
        const detectedPages = await estimatePDFPageCount(file);

        for (let page = 1; page <= detectedPages; page++) {
          results.push({
            name: `${file.name} — Page ${page}`,
            coverage: 30,
            estimatedPrice: 10.5,
            note: "Temporary PDF estimate"
          });
        }
      }
    }

    if (!results.length) {
      analysisStatus.textContent =
        "Please upload PDF, JPG, PNG or another image format.";

      return;
    }

    const averageCoverage =
      results.reduce((sum, result) => {
        return sum + result.coverage;
      }, 0) / results.length;

    pageCount.value = results.length;
    printMode.value = "color";
    coverageInput.value = Math.round(averageCoverage);

    coverageInput.dispatchEvent(new Event("input"));

    displayPageBreakdown(results);

    analysisStatus.textContent =
      `${results.length} page(s) analyzed. ` +
      `Average estimated coverage: ${averageCoverage.toFixed(1)}%.`;
  });

  async function analyzeImage(file) {
    const imageURL = URL.createObjectURL(file);
    const image = new Image();

    image.src = imageURL;
    await image.decode();

    const canvas = document.createElement("canvas");

    const maximumSize = 700;
    const scale = Math.min(
      1,
      maximumSize / Math.max(image.width, image.height)
    );

    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));

    const context = canvas.getContext("2d", {
      willReadFrequently: true
    });

    context.drawImage(
      image,
      0,
      0,
      canvas.width,
      canvas.height
    );

    const imageData = context.getImageData(
      0,
      0,
      canvas.width,
      canvas.height
    ).data;

    let totalInk = 0;
    let sampleCount = 0;

    /*
      Sample every fourth pixel for faster analysis.
      White pixels count as little or no coverage.
    */

    for (let index = 0; index < imageData.length; index += 16) {
      const red = imageData[index];
      const green = imageData[index + 1];
      const blue = imageData[index + 2];

      const distanceFromWhite =
        (255 - red) +
        (255 - green) +
        (255 - blue);

      const strongestChannel = Math.max(red, green, blue);
      const weakestChannel = Math.min(red, green, blue);
      const colorDifference = strongestChannel - weakestChannel;

      const darkness = Math.min(1, distanceFromWhite / 360);
      const colorWeight =
        0.72 + Math.min(colorDifference / 160, 0.28);

      totalInk += darkness * colorWeight;
      sampleCount++;
    }

    const coverage = Math.max(
      1,
      Math.min(100, (totalInk / sampleCount) * 100)
    );

    URL.revokeObjectURL(imageURL);

    return {
      name: file.name,
      coverage,
      estimatedPrice: coverage * 0.35,
      note: "Analyzed on this device"
    };
  }

  async function estimatePDFPageCount(file) {
    try {
      const buffer = await file.arrayBuffer();
      const text = new TextDecoder("latin1").decode(buffer);

      const pageMatches =
        text.match(/\/Type\s*\/Page\b/g) || [];

      return Math.max(1, Math.min(100, pageMatches.length));
    } catch (error) {
      return 1;
    }
  }

  function displayPageBreakdown(results) {
    pageBreakdown.innerHTML = results
      .map((result, index) => {
        return `
          <article class="analysis-row">
            <div>
              <strong>Page ${index + 1}</strong>
              <small>${escapeHTML(result.name)}</small>
            </div>

            <div class="coverage-bar">
              <i style="width: ${result.coverage.toFixed(1)}%"></i>
            </div>

            <strong>${result.coverage.toFixed(1)}%</strong>

            <b>${formatMoney(result.estimatedPrice)}</b>

            <small>${result.note}</small>
          </article>
        `;
      })
      .join("");
  }
}

/* Helpers */

function formatMoney(value) {
  const number = Number(value);

  if (Number.isInteger(number)) {
    return `MVR ${number}`;
  }

  return `MVR ${number.toFixed(2)}`;
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showMessage(text, type = "success") {
  let message = document.getElementById("siteMessage");

  if (!message) {
    message = document.createElement("div");
    message.id = "siteMessage";
    document.body.appendChild(message);
  }

  message.textContent = text;
  message.className = `site-message ${type}`;

  window.setTimeout(() => {
    message.className = "site-message";
  }, 3500);
}
