// script.js — light-theme layout + auto recalculation + crisp chart configuration

const $ = id => document.getElementById(id);
const formatINR = v => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(v || 0);

let chartInstance = null;
let autoCalcDebounce = null;
const DEBOUNCE_MS = 240;

function debounceCalc() {
  if (autoCalcDebounce) clearTimeout(autoCalcDebounce);
  autoCalcDebounce = setTimeout(() => { onCalculate(); autoCalcDebounce = null; }, DEBOUNCE_MS);
}

function attachAutoCalcTo(selector) {
  document.querySelectorAll(selector).forEach(el => {
    el.addEventListener('input', debounceCalc);
    el.addEventListener('change', debounceCalc);
  });
}

// Basic helpers
const numeric = v => Number(v) || 0;

// INPUTS
function getInputs(){
  const mode = document.querySelector('input[name="mode"]:checked').value;
  if (mode === 'sip') {
    return {
      mode,
      sipAmount: numeric($('sipAmount').value),
      stepUp: numeric($('stepUp').value),
      tenure: numeric($('tenure').value),
      returnRate: numeric($('returnRate').value),
      inflation: numeric($('inflation').value),
      showInflationAdjusted: $('showInflationAdjusted').checked,
      applyDefaultLTCG: $('applyDefaultLTCG').checked,
      customExemption: numeric($('customExemption').value),
      customRate: numeric($('customRate').value),
      applyCess: $('applyCess').checked
    };
  } else {
    return {
      mode,
      lumpsumAmount: numeric($('lumpsumAmount').value),
      tenure: numeric($('lumpTenure').value),
      returnRate: numeric($('lumpReturnRate').value),
      inflation: numeric($('lumpInflation').value),
      showInflationAdjusted: $('showLumpInflationAdjusted').checked,
      compFreq: numeric($('lumpCompFreq').value),
      applyDefaultLTCG: $('applyDefaultLTCG').checked,
      customExemption: numeric($('customExemption').value),
      customRate: numeric($('customRate').value),
      applyCess: $('applyCess').checked
    };
  }
}

// SIMULATIONS (SIP & Lumpsum)
function simulateSIP(inputs){
  const months = inputs.tenure * 12;
  const monthlyRate = inputs.returnRate / 100 / 12;
  const stepUpFactor = 1 + inputs.stepUp / 100;
  let currentSip = inputs.sipAmount;
  let fv = 0, invested = 0;
  const yearEndNominal = [], yearEndReal = [], principalThisYear = [], interestThisYear = [];
  let annualPrincipal = 0, annualInterest = 0;
  for (let m=1; m<=months; m++){
    const interestThisMonth = fv * monthlyRate;
    fv = fv * (1 + monthlyRate) + currentSip;
    invested += currentSip;
    annualInterest += interestThisMonth;
    annualPrincipal += currentSip;
    if (m % 12 === 0){
      const y = m/12;
      yearEndNominal.push(fv);
      yearEndReal.push(fv / Math.pow(1 + inputs.inflation/100, y));
      principalThisYear.push(annualPrincipal);
      interestThisYear.push(annualInterest);
      annualPrincipal = 0; annualInterest = 0;
      currentSip *= stepUpFactor;
    }
  }
  return { yearEndNominal, yearEndReal, principalThisYear, interestThisYear, totalInvested: invested, finalFV: fv };
}

function simulateLumpsum(inputs){
  const months = inputs.tenure * 12;
  const monthlyRate = inputs.returnRate / 100 / 12;
  let fv = inputs.lumpsumAmount;
  const yearEndNominal = [], yearEndReal = [], principalThisYear = [], interestThisYear = [];
  let annualInterest = 0;
  for (let m=1; m<=months; m++){
    const interestThisMonth = fv * monthlyRate;
    fv = fv * (1 + monthlyRate);
    annualInterest += interestThisMonth;
    if (m % 12 === 0){
      const y = m/12;
      yearEndNominal.push(fv);
      yearEndReal.push(fv / Math.pow(1 + inputs.inflation/100, y));
      principalThisYear.push(y === 1 ? inputs.lumpsumAmount : 0);
      interestThisYear.push(annualInterest);
      annualInterest = 0;
    }
  }
  return { yearEndNominal, yearEndReal, principalThisYear, interestThisYear, totalInvested: inputs.lumpsumAmount, finalFV: fv };
}

function simulateYearly(inputs){
  return inputs.mode === 'sip' ? simulateSIP(inputs) : simulateLumpsum(inputs);
}

// TAX
function computeTax(finalFV, totalInvested, inputs){
  const gain = Math.max(0, finalFV - totalInvested);
  const exemption = inputs.applyDefaultLTCG ? 125000 : inputs.customExemption;
  const rate = inputs.applyDefaultLTCG ? 12.5 : inputs.customRate;
  const cessRate = inputs.applyCess ? 4 : 0;
  const taxableGain = Math.max(0, gain - exemption);
  let tax = taxableGain * (rate/100);
  tax += tax * (cessRate/100);
  const postTaxFV = finalFV - tax;
  return { gain, exemption, rate, cessRate, taxableGain, tax, postTaxFV };
}

// UI update and chart rendering (crisp chart)
function updateUI(result, taxResult, inputs){
  $('futureValue').textContent = formatINR(result.finalFV);
  $('inflationAdjusted').textContent = formatINR(result.finalFV / Math.pow(1 + inputs.inflation/100, inputs.tenure));
  $('totalInvested').textContent = formatINR(result.totalInvested);
  $('totalGain').textContent = `Total Gain: ${formatINR(taxResult.gain)}`;
  const effCAGR = result.totalInvested>0 ? (Math.pow(result.finalFV / result.totalInvested, 1/inputs.tenure)-1)*100 : 0;
  $('effectiveCAGR').textContent = `Effective CAGR: ${effCAGR.toFixed(2)}%`;
  $('taxInfo').textContent = `LTCG: taxable ₹${Math.round(taxResult.taxableGain).toLocaleString('en-IN')}, tax ₹${Math.round(taxResult.tax).toLocaleString('en-IN')}, post-tax ${formatINR(taxResult.postTaxFV)}`;

  $('summaryTenure').textContent = inputs.mode === 'sip'
    ? `SIP · ${inputs.tenure} yrs · ${inputs.returnRate}% p.a. · Infl ${inputs.inflation}%`
    : `Lumpsum · ${inputs.tenure} yrs · ${inputs.returnRate}% p.a. · Infl ${inputs.inflation}%`;

  // populate table
  const tbody = $('breakdownTable').querySelector('tbody');
  tbody.innerHTML = '';
  const nYears = result.yearEndNominal.length;
  for (let y=0; y<nYears; y++){
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${y+1}</td>
      <td>${formatINR(result.yearEndNominal[y])}</td>
      <td>${formatINR(result.principalThisYear[y])}</td>
      <td>${formatINR(result.interestThisYear[y])}</td>
      <td>${formatINR(result.yearEndReal[y])}</td>`;
    tbody.appendChild(tr);
  }

  // Chart: crisp & clear
  const labels = Array.from({length: nYears}, (_,i) => (i+1).toString());
  const nominal = result.yearEndNominal.map(v => Math.round(v));
  const real = result.yearEndReal.map(v => Math.round(v));
  renderChart(labels, nominal, real);
  $('summary').style.display = 'block';
}

function renderChart(labels, nominal, real){
  const ctx = $('growthChart').getContext('2d');

  // create subtle gradient fills for readability
  const gradNom = ctx.createLinearGradient(0,0,0,400);
  gradNom.addColorStop(0, 'rgba(37,99,235,0.16)');
  gradNom.addColorStop(1, 'rgba(37,99,235,0.02)');

  const gradReal = ctx.createLinearGradient(0,0,0,400);
  gradReal.addColorStop(0, 'rgba(16,185,129,0.14)');
  gradReal.addColorStop(1, 'rgba(16,185,129,0.02)');

  if (chartInstance){
    chartInstance.data.labels = labels;
    chartInstance.data.datasets[0].data = nominal;
    chartInstance.data.datasets[1].data = real;
    chartInstance.update();
    return;
  }

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Nominal (no inflation)',
          data: nominal,
          borderColor: 'rgba(37,99,235,1)',
          backgroundColor: gradNom,
          fill: true,
          tension: 0.28,
          pointRadius: 3,
          pointHoverRadius: 6,
          borderWidth: 3,
        },
        {
          label: 'Real (inflation adjusted)',
          data: real,
          borderColor: 'rgba(16,185,129,1)',
          backgroundColor: gradReal,
          fill: true,
          tension: 0.28,
          pointRadius: 3,
          pointHoverRadius: 6,
          borderWidth: 3,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { usePointStyle: true, boxWidth: 10 } },
        tooltip: {
          enabled: true,
          padding: 10,
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${formatINR(ctx.parsed.y)}`
          }
        },
        decimation: { enabled: false }
      },
      scales: {
        x: {
          title: { display: true, text: 'Years', color: '#374151', font: {weight:700} },
          ticks: { color: '#374151' },
          grid: { display: false }
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: '#374151',
            callback: value => {
              // Format large numbers with compact representation but keep INR label
              if (value >= 1e7) return '₹' + (value/1e7).toFixed(1) + ' Cr';
              if (value >= 1e5) return '₹' + (value/1e5).toFixed(1) + ' L';
              return '₹' + Number(value).toLocaleString('en-IN');
            }
          },
          grid: {
            color: 'rgba(14,58,112,0.06)',
            drawBorder: false,
            tickLength: 0
          }
        }
      },
      elements: { line: { capBezierPoints: true } }
    }
  });
}

// VALIDATION
function validateInputs(inputs){
  if (inputs.mode === 'sip'){
    if (inputs.sipAmount < 0 || inputs.sipAmount > 500000) return 'Monthly SIP must be between ₹0 and ₹5,00,000.';
  } else {
    if (inputs.lumpsumAmount < 0 || inputs.lumpsumAmount > 1000000000) return 'Lumpsum must be between ₹0 and ₹10,00,00,000.';
  }
  if (inputs.tenure < 1 || inputs.tenure > 35) return 'Tenure must be between 1 and 35 years.';
  if (inputs.returnRate < 0 || inputs.returnRate > 20) return 'Return must be between 0% and 20% p.a.';
  if (inputs.inflation < 0 || inputs.inflation > 10) return 'Inflation must be between 0% and 10% p.a.';
  return '';
}

// MAIN
function onCalculate(){
  const inputs = getInputs();
  const err = validateInputs(inputs);
  $('error').textContent = err;
  if (err){ $('summary').style.display='none'; return; }
  const sim = simulateYearly(inputs);
  const taxRes = computeTax(sim.finalFV, sim.totalInvested, inputs);
  updateUI(sim, taxRes, inputs);
}

// UI hooks: mode toggle and auto-bind
function bindModeToggle(){
  const radios = document.querySelectorAll('input[name="mode"]');
  radios.forEach(r => {
    r.addEventListener('change', () => {
      const mode = document.querySelector('input[name="mode"]:checked').value;
      if (mode === 'sip'){ $('sipInputs').style.display=''; $('lumpsumInputs').style.display='none'; }
      else { $('sipInputs').style.display='none'; $('lumpsumInputs').style.display=''; }
      // active label class
      document.querySelectorAll('.mode-label').forEach(lbl => lbl.classList.remove('active'));
      const chosen = Array.from(document.querySelectorAll('.mode-label')).find(lbl => lbl.querySelector(`input[name="mode"]:checked`));
      // fallback: iterate and add based on inner input
      document.querySelectorAll('.mode-label').forEach(lbl=>{
        const inp = lbl.querySelector('input[name="mode"]');
        if (inp && inp.checked) lbl.classList.add('active');
      });
      debounceCalc();
    });
  });
}

// attach listeners to all inputs we care about
function bindAutoCalc(){
  attachAutoCalcTo('input[type="number"], input[type="text"], select, input[type="checkbox"], input[type="radio"]');
  $('calcBtn').addEventListener('click', onCalculate);
}

// initialize
document.addEventListener('DOMContentLoaded', () => {
  bindModeToggle();
  bindAutoCalc();
  onCalculate();
});
