// script.js — includes year-wise breakdown, chart, and LTCG tax calculations.

const $ = id => document.getElementById(id);
const formatINR = v => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(v || 0);

let chartInstance = null;

function getInputs(){
  return {
    sipAmount: Number($('sipAmount').value),
    stepUp: Number($('stepUp').value),
    tenure: Number($('tenure').value),
    returnRate: Number($('returnRate').value),
    inflation: Number($('inflation').value),
    showInflationAdjusted: $('showInflationAdjusted').checked,
    applyDefaultLTCG: $('applyDefaultLTCG').checked,
    customExemption: Number($('customExemption').value),
    customRate: Number($('customRate').value),
    applyCess: $('applyCess').checked
  };
}

function simulateYearly(inputs) {
  // Returns arrays yearEndNominal[], yearEndReal[], principalThisYear[], interestThisYear[], cumulativeInvested
  const months = inputs.tenure * 12;
  const monthlyRate = inputs.returnRate / 100 / 12;
  const stepUpFactor = 1 + inputs.stepUp / 100;
  let currentSip = inputs.sipAmount;

  let fv = 0;
  let invested = 0;

  const yearEndNominal = [];
  const yearEndReal = [];
  const principalThisYear = [];
  const interestThisYear = [];

  let annualPrincipal = 0;
  let annualInterest = 0;
  let prevFv = 0;

  for (let m=1; m<=months; m++){
    const interestThisMonth = fv * monthlyRate;     // interest accrued this month
    fv = fv * (1 + monthlyRate) + currentSip;
    invested += currentSip;

    annualInterest += interestThisMonth;
    annualPrincipal += currentSip;

    if (m % 12 === 0){
      // end of year snapshot
      const y = m / 12;
      yearEndNominal.push(fv);
      // real value = nominal / (1+inflation)^years
      const realFactor = Math.pow(1 + inputs.inflation/100, y);
      yearEndReal.push(fv / realFactor);
      principalThisYear.push(annualPrincipal);
      interestThisYear.push(annualInterest);

      // reset year accumulators
      annualPrincipal = 0;
      annualInterest = 0;

      // apply step-up for next year
      currentSip = currentSip * stepUpFactor;
      prevFv = fv;
    }
  }

  return {
    yearEndNominal,
    yearEndReal,
    principalThisYear,
    interestThisYear,
    totalInvested: invested,
    finalFV: fv
  };
}

function computeTax(finalFV, totalInvested, inputs) {
  // Calculate gain and LTCG tax as per chosen options.
  const gain = Math.max(0, finalFV - totalInvested);

  // Default equity LTCG defaults (current scenario): 12.5% on gains above ₹1,25,000 + 4% cess
  // (This default is editable by the user via customExemption/customRate.)
  const exemption = inputs.applyDefaultLTCG ? 125000 : inputs.customExemption;
  const rate = inputs.applyDefaultLTCG ? 12.5 : inputs.customRate;
  const cessRate = inputs.applyCess ? 4 : 0;

  const taxableGain = Math.max(0, gain - exemption);
  let tax = taxableGain * (rate/100);
  tax = tax + tax * (cessRate/100);
  const postTaxFV = finalFV - tax;

  return {gain, exemption, rate, cessRate, taxableGain, tax, postTaxFV};
}

function updateUI(result, taxResult, inputs) {
  $('futureValue').textContent = formatINR(result.finalFV);
  $('inflationAdjusted').textContent = formatINR(result.finalFV / Math.pow(1 + inputs.inflation/100, inputs.tenure));
  $('totalInvested').textContent = formatINR(result.totalInvested);

  $('totalGain').textContent = `Total Gain: ${formatINR(taxResult.gain)}`;
  // simple effective CAGR vs invested
  const effCAGR = result.totalInvested>0 ? (Math.pow(result.finalFV / result.totalInvested, 1/inputs.tenure)-1)*100 : 0;
  $('effectiveCAGR').textContent = `Effective CAGR: ${effCAGR.toFixed(2)}%`;

  $('taxInfo').textContent = `LTCG: taxable ₹${Math.round(taxResult.taxableGain).toLocaleString('en-IN')}, tax ₹${Math.round(taxResult.tax).toLocaleString('en-IN')}, post-tax FV ${formatINR(taxResult.postTaxFV)}`;

  $('summaryTenure').textContent = `${inputs.tenure} yrs · ${inputs.returnRate}% p.a. · Inflation ${inputs.inflation}%`;

  // Build year-wise table
  const tbody = $('breakdownTable').querySelector('tbody');
  tbody.innerHTML = '';
  const nYears = result.yearEndNominal.length;
  for (let y=0; y<nYears; y++){
    const tr = document.createElement('tr');
    const yr = y+1;
    const nominal = result.yearEndNominal[y];
    const real = result.yearEndReal[y];
    const principal = result.principalThisYear[y];
    const interest = result.interestThisYear[y];

    tr.innerHTML = `<td>${yr}</td>
      <td>${formatINR(nominal)}</td>
      <td>${formatINR(principal)}</td>
      <td>${formatINR(interest)}</td>
      <td>${formatINR(real)}</td>`;
    tbody.appendChild(tr);
  }

  // Chart: nominal vs real across years
  const labels = Array.from({length: result.yearEndNominal.length}, (_,i) => (i+1).toString());
  const dataNominal = result.yearEndNominal.map(v => Math.round(v));
  const dataReal = result.yearEndReal.map(v => Math.round(v));

  renderChart(labels, dataNominal, dataReal);

  $('summary').style.display = 'block';
}

function renderChart(labels, nominal, real){
  const ctx = $('growthChart').getContext('2d');
  if (chartInstance) {
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
          borderWidth: 2,
          tension: 0.25,
          fill: false,
          borderColor: 'rgba(37,99,235,1)',
          pointRadius: 2
        },
        {
          label: 'Real (inflation adjusted)',
          data: real,
          borderWidth: 2,
          tension: 0.25,
          fill: false,
          borderColor: 'rgba(16,185,129,1)',
          pointRadius: 2
        }
      ]
    },
    options: {
      responsive: true,
      scales: {
        y: {
          ticks: {
            callback: function(value){ return '₹' + value.toLocaleString('en-IN'); }
          }
        },
        x: { title: { display: true, text: 'Years' } }
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: context => '₹' + Number(context.parsed.y).toLocaleString('en-IN')
          }
        }
      }
    }
  });
}

function validateInputs(inputs){
  if (inputs.sipAmount < 0 || inputs.sipAmount > 500000) return 'Monthly SIP must be between ₹0 and ₹5,00,000.';
  if (inputs.tenure < 1 || inputs.tenure > 35) return 'Tenure must be between 1 and 35 years.';
  if (inputs.returnRate < 0 || inputs.returnRate > 20) return 'Return must be between 0% and 20% p.a.';
  if (inputs.inflation < 0 || inputs.inflation > 10) return 'Inflation must be between 0% and 10% p.a.';
  return '';
}

function onCalculate(){
  const inputs = getInputs();
  const err = validateInputs(inputs);
  $('error').textContent = err;
  if (err) { $('summary').style.display='none'; return; }

  const sim = simulateYearly(inputs);
  // Tax calculation: by default use equity LTCG values (12.5% above 1.25L) unless user overrides
  const taxRes = computeTax(sim.finalFV, sim.totalInvested, inputs);

  updateUI(sim, taxRes, inputs);
}

// bind
document.addEventListener('DOMContentLoaded', () => {
  $('calcBtn').addEventListener('click', onCalculate);
  // initial
  onCalculate();
});
