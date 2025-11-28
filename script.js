// script.js — improved binding: auto-recalc on any input change (debounced) + UI tweaks

const $ = id => document.getElementById(id);
const formatINR = v => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(v || 0);

let chartInstance = null;
let autoCalcDebounce = null;
const DEBOUNCE_MS = 300;

// ---------- Helpers ----------
function debounceCalc() {
  if (autoCalcDebounce) clearTimeout(autoCalcDebounce);
  autoCalcDebounce = setTimeout(() => {
    onCalculate();
    autoCalcDebounce = null;
  }, DEBOUNCE_MS);
}

function attachAutoCalcTo(selector, event='input') {
  document.querySelectorAll(selector).forEach(el => {
    el.addEventListener(event, debounceCalc);
    // also trigger on change for selects/checkboxes/radios
    el.addEventListener('change', debounceCalc);
  });
}

function numeric(v){ return Number(v) || 0; }

// ---------- Input collection ----------
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

// ---------- Simulations (unchanged logic but compact) ----------
function simulateYearly(inputs) {
  return inputs.mode === 'sip' ? simulateSIP(inputs) : simulateLumpsum(inputs);
}

function simulateSIP(inputs){
  const months = inputs.tenure * 12;
  const monthlyRate = inputs.returnRate / 100 / 12;
  const stepUpFactor = 1 + inputs.stepUp/100;
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
      principalThisYear.push(y===1 ? inputs.lumpsumAmount : 0);
      interestThisYear.push(annualInterest);
      annualInterest = 0;
    }
  }
  return { yearEndNominal, yearEndReal, principalThisYear, interestThisYear, totalInvested: inputs.lumpsumAmount, finalFV: fv };
}

// ---------- Tax ----------
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

// ---------- UI update + Chart ----------
function updateUI(result, taxResult, inputs){
  $('futureValue').textContent = formatINR(result.finalFV);
  $('inflationAdjusted').textContent = formatINR(result.finalFV / Math.pow(1 + inputs.inflation/100, inputs.tenure));
  $('totalInvested').textContent = formatINR(result.totalInvested);
  $('totalGain').textContent = `Total Gain: ${formatINR(taxResult.gain)}`;
  const effCAGR = result.totalInvested>0 ? (Math.pow(result.finalFV / result.totalInvested, 1/inputs.tenure)-1)*100 : 0;
  $('effectiveCAGR').textContent = `Effective CAGR: ${effCAGR.toFixed(2)}%`;
  $('taxInfo').textContent = `LTCG: taxable ₹${Math.round(taxResult.taxableGain).toLocaleString('en-IN')}, tax ₹${Math.round(taxResult.tax).toLocaleString('en-IN')}, post-tax ${formatINR(taxResult.postTaxFV)}`;

  if (inputs.mode === 'sip'){
    $('summaryTenure').textContent = `SIP · ${inputs.tenure} yrs · ${inputs.returnRate}% p.a. · Infl ${inputs.inflation}%`;
  } else {
    $('summaryTenure').textContent = `Lumpsum · ${inputs.tenure} yrs · ${inputs.returnRate}% p.a. · Infl ${inputs.inflation}%`;
  }

  // Table
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

  // Chart
  const labels = Array.from({length: nYears}, (_,i) => (i+1).toString());
  const nominal = result.yearEndNominal.map(v => Math.round(v));
  const real = result.yearEndReal.map(v => Math.round(v));
  renderChart(labels, nominal, real);
  $('summary').style.display = 'block';
}

function renderChart(labels, nominal, real){
  const ctx = $('growthChart').getContext('2d');
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
      datasets:[
        { label: 'Nominal (no inflation)', data: nominal, borderWidth: 2, tension: 0.28, fill:false, borderColor: 'rgba(37,99,235,1)', pointRadius: 3, pointHoverRadius:5 },
        { label: 'Real (inflation adjusted)', data: real, borderWidth: 2, tension: 0.28, fill:false, borderColor: 'rgba(16,185,129,1)', pointRadius: 3, pointHoverRadius:5 }
      ]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      interaction:{mode:'index',intersect:false},
      plugins:{legend:{labels:{usePointStyle:true}} },
      scales:{
        y: {
          ticks: { callback: v => '₹' + v.toLocaleString('en-IN') }
        },
        x: { title: { display: true, text: 'Years' } }
      },
      elements:{point:{radius:3}}
    }
  });
}

// ---------- Validation ----------
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

// ---------- Main handler ----------
function onCalculate(){
  const inputs = getInputs();
  const err = validateInputs(inputs);
  $('error').textContent = err;
  if (err){ $('summary').style.display='none'; return; }
  const sim = simulateYearly(inputs);
  const taxRes = computeTax(sim.finalFV, sim.totalInvested, inputs);
  updateUI(sim, taxRes, inputs);
}

// ---------- Mode toggle UI nicety ----------
function bindModeToggle(){
  const radios = document.querySelectorAll('input[name="mode"]');
  radios.forEach(r => {
    r.addEventListener('change', () => {
      const mode = document.querySelector('input[name="mode"]:checked').value;
      if (mode === 'sip'){ $('sipInputs').style.display=''; $('lumpsumInputs').style.display='none'; }
      else { $('sipInputs').style.display='none'; $('lumpsumInputs').style.display=''; }
      // mark active label
      document.querySelectorAll('.mode-toggle label').forEach(lbl => lbl.classList.remove('active'));
      const parentLabel = r.closest('label') || document.querySelector(`label[for="${r.id}"]`);
      if (parentLabel) parentLabel.classList.add('active');
      debounceCalc();
    });
  });
}

// ---------- Auto-bind inputs for live update ----------
function bindAutoCalc(){
  // numeric inputs, selects, checkboxes
  attachAutoCalcTo('input[type="number"], input[type="text"], select, input[type="checkbox"], input[type="radio"]', 'input');
  // also ensure 'change' triggers immediately for selects and checkboxes
  attachAutoCalcTo('select, input[type="checkbox"], input[type="radio"]', 'change');
}

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', () => {
  bindModeToggle();
  bindAutoCalc();
  // manual calc button still available
  $('calcBtn').addEventListener('click', onCalculate);
  // initial run
  onCalculate();
});
