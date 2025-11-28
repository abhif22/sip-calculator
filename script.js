function formatINR(value) {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0
    }).format(value);
  } catch (e) {
    // Fallback if Intl isn't available
    return "₹" + Math.round(value).toLocaleString("en-IN");
  }
}

function calculateSIP() {
  const sipAmount = Number(document.getElementById("sipAmount").value);
  const stepUp = Number(document.getElementById("stepUp").value);
  const tenureYears = Number(document.getElementById("tenure").value);
  const returnRate = Number(document.getElementById("returnRate").value);
  const inflationRate = Number(document.getElementById("inflation").value);

  const errorEl = document.getElementById("error");
  errorEl.textContent = "";

  if (sipAmount < 0 || sipAmount > 500000) {
    errorEl.textContent = "Monthly SIP must be between ₹0 and ₹5,00,000.";
    document.getElementById("results").style.display = "none";
    return;
  }
  if (tenureYears < 1 || tenureYears > 35) {
    errorEl.textContent = "Tenure must be between 1 and 35 years.";
    document.getElementById("results").style.display = "none";
    return;
  }
  if (returnRate < 0 || returnRate > 20) {
    errorEl.textContent = "Expected return must be between 0% and 20% p.a.";
    document.getElementById("results").style.display = "none";
    return;
  }
  if (inflationRate < 0 || inflationRate > 10) {
    errorEl.textContent = "Inflation must be between 0% and 10% p.a.";
    document.getElementById("results").style.display = "none";
    return;
  }

  const months = tenureYears * 12;
  const monthlyRate = returnRate / 100 / 12;
  const stepUpFactor = 1 + stepUp / 100;

  let currentSip = sipAmount;
  let totalInvested = 0;
  let futureValue = 0;

  for (let m = 1; m <= months; m++) {
    futureValue = futureValue * (1 + monthlyRate) + currentSip;
    totalInvested += currentSip;

    if (m % 12 === 0) {
      currentSip = currentSip * stepUpFactor;
    }
  }

  const realFactor = Math.pow(1 + inflationRate / 100, tenureYears);
  const inflationAdjusted = futureValue / realFactor;

  const totalGain = futureValue - totalInvested;
  const effectiveCAGR =
    tenureYears > 0 && totalInvested > 0
      ? (Math.pow(futureValue / totalInvested, 1 / tenureYears) - 1) * 100
      : 0;

  document.getElementById("futureValue").textContent = formatINR(futureValue);
  document.getElementById("inflationAdjusted").textContent = formatINR(inflationAdjusted);
  document.getElementById("totalInvested").textContent = formatINR(totalInvested);

  document.getElementById("totalGain").textContent =
    "Total Gain: " + formatINR(totalGain);
  document.getElementById("effectiveCAGR").textContent =
    "Effective CAGR vs Invested: " + effectiveCAGR.toFixed(2) + "%";
  document.getElementById("stepUpInfo").textContent =
    "Annual step-up: " + stepUp.toFixed(1) + "%";

  document.getElementById("summaryTenure").textContent =
    `${tenureYears} years · ${returnRate.toFixed(1)}% p.a. · Inflation ${inflationRate.toFixed(1)}%`;

  document.getElementById("results").style.display = "block";
}

// Run once with defaults after DOM is ready
document.addEventListener("DOMContentLoaded", calculateSIP);
