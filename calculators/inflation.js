/* ==========================================================
   INFLATION LAYER (PRISM LAYER) CALCULATOR
   Standard flat-plate turbulent boundary-layer engineering
   correlations, as used in ANSYS Fluent Meshing's "Y+ Estimation"
   utility and general OpenFOAM/snappyHexMesh inflation practice.

   References (see Formula Reference page for full citations):
   - Schlichting & Gersten, "Boundary-Layer Theory", 9th ed.
     Turbulent flat-plate skin friction:  Cf = 0.058 * Re_x^-0.2
     Turbulent flat-plate BL thickness:   delta = 0.37 * x / Re_x^0.2
   - ANSYS Fluent Meshing User's Guide, "Determining Y+ / Y* for
     the First Cell Height" — u_tau / y1 relation from Cf.
   - Standard geometric inflation series used by Fluent Meshing
     and OpenFOAM snappyHexMesh addLayers: total thickness of N
     layers with first height y1 and growth rate r is a finite
     geometric sum.
   ========================================================== */

const Inflation = (() => {

  /**
   * Turbulent flat-plate skin friction coefficient (Schlichting power-law fit).
   * Valid roughly for 5e5 < Re_x < 1e7.
   */
  function skinFrictionCf(Re_x) {
    return 0.058 * Re_x ** -0.2;
  }

  /**
   * Turbulent flat-plate boundary layer thickness (99% velocity thickness).
   */
  function boundaryLayerThickness(x, Re_x) {
    return 0.37 * x / (Re_x ** 0.2);
  }

  /**
   * Sum of a finite geometric series of N layers, first term y1, ratio r.
   * total = y1 * (r^N - 1) / (r - 1)   [r != 1]
   * total = y1 * N                     [r == 1]
   */
  function totalThickness(y1, r, N) {
    if (Math.abs(r - 1) < 1e-12) return y1 * N;
    return y1 * (r ** N - 1) / (r - 1);
  }

  /**
   * Solve N (layer count) required to reach a target total thickness,
   * given first layer height y1 and growth rate r.
   * total = y1*(r^N - 1)/(r-1)  =>  N = ln(1 + total*(r-1)/y1) / ln(r)
   */
  function solveNForThickness(y1, r, total) {
    if (Math.abs(r - 1) < 1e-12) return total / y1;
    const term = 1 + (total * (r - 1)) / y1;
    if (term <= 0) throw new Error('Target thickness unreachable with this growth rate / first layer height.');
    return Math.log(term) / Math.log(r);
  }

  /**
   * Full solve.
   * inputs: { rho, mu, U, x, y_plus, growthRate, layerMode, layerValue, firstLayerMode, firstLayerValue }
   *  - firstLayerMode: 'auto' (derive y1 from target y+) | 'manual' (user supplies y1)
   *  - layerMode: 'count' (user supplies N, solve total thickness) |
   *               'coverage' (user supplies target %% of BL thickness, solve N)
   */
  function run(inputs) {
    const { rho, mu, U, x, y_plus, growthRate, firstLayerMode, firstLayerValue,
            layerMode, layerValue } = inputs;

    const Re_x = (rho * U * x) / mu;
    const Cf = skinFrictionCf(Re_x);
    const tau_w = 0.5 * rho * (U ** 2) * Cf;
    const u_tau = Math.sqrt(tau_w / rho);
    const delta_BL = boundaryLayerThickness(x, Re_x);

    let y1;
    if (firstLayerMode === 'manual') {
      y1 = firstLayerValue;
    } else {
      y1 = (y_plus * mu) / (rho * u_tau); // same u_tau relation as the bias calculator
    }

    const achieved_yplus = (y1 * rho * u_tau) / mu;

    let N, total;
    if (layerMode === 'count') {
      N = Math.trunc(layerValue);
      total = totalThickness(y1, growthRate, N);
    } else {
      // coverage: layerValue = target % of BL thickness
      total = delta_BL * (layerValue / 100);
      const N_exact = solveNForThickness(y1, growthRate, total);
      N = Math.ceil(N_exact);
      total = totalThickness(y1, growthRate, N); // recompute with integer N
    }

    const lastLayer = y1 * (growthRate ** (N - 1));
    const coveragePct = (total / delta_BL) * 100;

    return {
      Re_x, Cf, tau_w, u_tau, delta_BL, y1, achieved_yplus,
      N, total, lastLayer, coveragePct, growthRate
    };
  }

  return { skinFrictionCf, boundaryLayerThickness, totalThickness, solveNForThickness, run };
})();

/* ---------------------------------------------------------
   UI WIRING
--------------------------------------------------------- */
function initInflationCalc() {
  const ids = ['i-rho', 'i-mu', 'i-U', 'i-x', 'i-yplus', 'i-growth', 'i-firstval', 'i-layerval'];

  function updateFirstLayerVisibility() {
    const mode = segValue('i-firstlayer-seg');
    document.getElementById('i-field-firstval').style.display = mode === 'manual' ? '' : 'none';
    document.getElementById('i-field-yplus').style.display = mode === 'auto' ? '' : 'none';
  }
  function updateLayerModeLabel() {
    const mode = segValue('i-layermode-seg');
    document.getElementById('i-layerval-label').textContent = mode === 'count' ? 'Number of layers (N)' : 'Target coverage of BL thickness';
    document.getElementById('i-layerval-suffix').textContent = mode === 'count' ? 'layers' : '%';
  }
  bindSeg('i-firstlayer-seg', updateFirstLayerVisibility);
  bindSeg('i-layermode-seg', updateLayerModeLabel);
  updateFirstLayerVisibility();
  updateLayerModeLabel();

  function compute() {
    const rho = readNumber('i-rho');
    const mu = readNumber('i-mu');
    const U = readNumber('i-U');
    const x = readNumber('i-x');
    const growthRate = readNumber('i-growth');
    const layerValue = readNumber('i-layerval');
    const firstLayerMode = segValue('i-firstlayer-seg');
    const layerMode = segValue('i-layermode-seg');

    let y_plus = null, firstLayerValue = null;
    if (firstLayerMode === 'auto') y_plus = readNumber('i-yplus');
    else firstLayerValue = readNumber('i-firstval');

    const required = [rho, mu, U, x, growthRate, layerValue];
    if (firstLayerMode === 'auto') required.push(y_plus); else required.push(firstLayerValue);

    if (required.some(v => v === null)) {
      renderEmpty('i-output', 'Fill in every field to compute the inflation layers.');
      return;
    }

    try {
      const res = Inflation.run({ rho, mu, U, x, y_plus, growthRate, firstLayerMode, firstLayerValue, layerMode, layerValue });
      renderInflationResults(res, layerMode);
    } catch (e) {
      renderEmpty('i-output', e.message, true);
    }
  }

  function renderInflationResults(r, layerMode) {
    const panel = document.getElementById('i-output');
    const coverageNote = r.coveragePct >= 80
      ? 'Inflation region reaches a healthy fraction of the estimated boundary-layer thickness.'
      : 'Inflation region covers a modest fraction of the boundary layer — consider more layers or a lower growth rate if resolving the full BL matters.';
    panel.innerHTML = `
      <div class="result-group">
        <div class="result-group-title">Flat-plate boundary layer estimate</div>
        <div class="result-row"><span class="rk">Reynolds number (Re_x)</span><span class="rv">${Fmt.g(r.Re_x)}</span></div>
        <div class="result-row"><span class="rk">Skin friction coeff. (C_f)</span><span class="rv">${Fmt.fixed(r.Cf, 6)}</span></div>
        <div class="result-row"><span class="rk">Wall shear stress (τ_w)</span><span class="rv">${Fmt.fixed(r.tau_w, 6)} Pa</span></div>
        <div class="result-row"><span class="rk">Friction velocity (U_τ)</span><span class="rv">${Fmt.fixed(r.u_tau, 4)} m/s</span></div>
        <div class="result-row hero"><span class="rk">Boundary layer thickness (δ)</span><span class="rv">${Fmt.g(r.delta_BL * 1000)} mm</span></div>
      </div>
      <div class="result-group">
        <div class="result-group-title">Inflation layers</div>
        <div class="result-row hero"><span class="rk">First layer height (y₁)</span><span class="rv">${Fmt.g(r.y1 * 1000)} mm</span></div>
        <div class="result-row"><span class="rk">Achieved Y+ at y₁</span><span class="rv">${Fmt.fixed(r.achieved_yplus, 3)}</span></div>
        <div class="result-row"><span class="rk">Growth rate (r)</span><span class="rv">${Fmt.g(r.growthRate)}</span></div>
        <div class="result-row"><span class="rk">Number of layers (N)</span><span class="rv">${r.N}</span></div>
        <div class="result-row"><span class="rk">Last layer thickness</span><span class="rv">${Fmt.g(r.lastLayer * 1000)} mm</span></div>
        <div class="result-row hero"><span class="rk">Total inflation thickness</span><span class="rv">${Fmt.g(r.total * 1000)} mm</span></div>
        <div class="result-row"><span class="rk">Coverage of BL thickness</span><span class="rv">${Fmt.fixed(r.coveragePct, 1)}%</span></div>
      </div>
      <div class="note info">${infoIcon()}<span>${coverageNote}</span></div>
    `;
  }

  document.getElementById('i-calc-btn').addEventListener('click', compute);
  bindReset('i-reset-btn', ids, () => { updateFirstLayerVisibility(); updateLayerModeLabel(); renderEmpty('i-output', 'Enter parameters and calculate to size the inflation layers.'); });
  bindCopy('i-copy-btn', 'i-output');
  renderEmpty('i-output', 'Enter parameters and calculate to size the inflation layers.');
}

window.initInflationCalc = initInflationCalc;
