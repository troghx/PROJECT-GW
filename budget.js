(function () {
  const DEFAULT_BUDGET = {
    budgetItems: {
      housing: {
        housingType: '',
        housingPayment: 0,
        homeOwnersInsurance: 0,
        secondaryHousePayment: 0
      },
      transportation: {
        autoPayments: 0,
        autoInsurance: 0,
        repairsMaintenance: 0,
        gasoline: 0,
        parking: 0,
        commuting: 0
      },
      food: {
        groceries: 0,
        eatingOut: 0
      },
      utilities: {
        averageEnergy: 0,
        averagePhone: 0,
        averageWater: 0,
        averageInternet: 0
      },
      otherExpenses: 0
    },
    income: {
      applicant: {
        netMonthlyIncome: 0,
        socialSecurity: 0,
        alimony: 0,
        retirement: 0,
        totalHouseholdIncome: 0,
        fixedIncome: 0,
        unemployment: 0,
        childSupport: 0,
        other: 0
      },
      coapp: {
        netMonthlyIncome: 0,
        socialSecurity: 0,
        alimony: 0,
        retirement: 0,
        totalHouseholdIncome: 0,
        fixedIncome: 0,
        unemployment: 0,
        childSupport: 0,
        other: 0
      }
    },
    hardship: {
      hardshipReason: '',
      detailedReasonEs: '',
      detailedReasonEn: ''
    }
  };

  const MONEY_FIELD_MAP = [
    { id: 'budgetHousingPayment', path: ['budgetItems', 'housing', 'housingPayment'] },
    { id: 'budgetHomeInsurance', path: ['budgetItems', 'housing', 'homeOwnersInsurance'] },
    { id: 'budgetSecondaryHousingPayment', path: ['budgetItems', 'housing', 'secondaryHousePayment'] },
    { id: 'budgetAutoPayments', path: ['budgetItems', 'transportation', 'autoPayments'] },
    { id: 'budgetAutoInsurance', path: ['budgetItems', 'transportation', 'autoInsurance'] },
    { id: 'budgetRepairsMaintenance', path: ['budgetItems', 'transportation', 'repairsMaintenance'] },
    { id: 'budgetGasoline', path: ['budgetItems', 'transportation', 'gasoline'] },
    { id: 'budgetParking', path: ['budgetItems', 'transportation', 'parking'] },
    { id: 'budgetCommuting', path: ['budgetItems', 'transportation', 'commuting'] },
    { id: 'budgetGroceries', path: ['budgetItems', 'food', 'groceries'] },
    { id: 'budgetEatingOut', path: ['budgetItems', 'food', 'eatingOut'] },
    { id: 'budgetUtilityEnergy', path: ['budgetItems', 'utilities', 'averageEnergy'] },
    { id: 'budgetUtilityPhone', path: ['budgetItems', 'utilities', 'averagePhone'] },
    { id: 'budgetUtilityWater', path: ['budgetItems', 'utilities', 'averageWater'] },
    { id: 'budgetUtilityInternet', path: ['budgetItems', 'utilities', 'averageInternet'] },
    { id: 'budgetOtherExpenses', path: ['budgetItems', 'otherExpenses'] },

    { id: 'budgetIncomeApplicantNetMonthly', path: ['income', 'applicant', 'netMonthlyIncome'] },
    { id: 'budgetIncomeApplicantSocialSecurity', path: ['income', 'applicant', 'socialSecurity'] },
    { id: 'budgetIncomeApplicantAlimony', path: ['income', 'applicant', 'alimony'] },
    { id: 'budgetIncomeApplicantRetirement', path: ['income', 'applicant', 'retirement'] },
    { id: 'budgetIncomeApplicantHouseholdTotal', path: ['income', 'applicant', 'totalHouseholdIncome'] },
    { id: 'budgetIncomeApplicantFixedIncome', path: ['income', 'applicant', 'fixedIncome'] },
    { id: 'budgetIncomeApplicantUnemployment', path: ['income', 'applicant', 'unemployment'] },
    { id: 'budgetIncomeApplicantChildSupport', path: ['income', 'applicant', 'childSupport'] },
    { id: 'budgetIncomeApplicantOther', path: ['income', 'applicant', 'other'] },

    { id: 'budgetIncomeCoappNetMonthly', path: ['income', 'coapp', 'netMonthlyIncome'] },
    { id: 'budgetIncomeCoappSocialSecurity', path: ['income', 'coapp', 'socialSecurity'] },
    { id: 'budgetIncomeCoappAlimony', path: ['income', 'coapp', 'alimony'] },
    { id: 'budgetIncomeCoappRetirement', path: ['income', 'coapp', 'retirement'] },
    { id: 'budgetIncomeCoappHouseholdTotal', path: ['income', 'coapp', 'totalHouseholdIncome'] },
    { id: 'budgetIncomeCoappFixedIncome', path: ['income', 'coapp', 'fixedIncome'] },
    { id: 'budgetIncomeCoappUnemployment', path: ['income', 'coapp', 'unemployment'] },
    { id: 'budgetIncomeCoappChildSupport', path: ['income', 'coapp', 'childSupport'] },
    { id: 'budgetIncomeCoappOther', path: ['income', 'coapp', 'other'] }
  ];

  const SELECT_FIELD_MAP = [
    { id: 'budgetHousingType', path: ['budgetItems', 'housing', 'housingType'] },
    { id: 'budgetHardshipReason', path: ['hardship', 'hardshipReason'] }
  ];

  const TEXT_FIELD_MAP = [
    { id: 'budgetHardshipDetailEs', path: ['hardship', 'detailedReasonEs'], max: 5000 },
    { id: 'budgetHardshipDetailEn', path: ['hardship', 'detailedReasonEn'], max: 5000 }
  ];

  let budgetSectionInitialized = false;
  let budgetBindingsReady = false;
  let budgetLeadIdLoaded = null;
  let budgetSaveTimer = null;
  let budgetSaving = false;

  function cloneDefaultBudget() {
    return JSON.parse(JSON.stringify(DEFAULT_BUDGET));
  }

  function setByPath(target, path, value) {
    if (!target || !Array.isArray(path) || path.length === 0) return;
    let cursor = target;
    for (let i = 0; i < path.length - 1; i += 1) {
      const key = path[i];
      if (!cursor[key] || typeof cursor[key] !== 'object') {
        cursor[key] = {};
      }
      cursor = cursor[key];
    }
    cursor[path[path.length - 1]] = value;
  }

  function getByPath(source, path, fallback = undefined) {
    if (!source || !Array.isArray(path)) return fallback;
    let cursor = source;
    for (const key of path) {
      if (!cursor || typeof cursor !== 'object' || !(key in cursor)) return fallback;
      cursor = cursor[key];
    }
    return cursor;
  }

  function parseMoney(value) {
    const normalized = Number(String(value || '').replace(/[^0-9.-]/g, ''));
    if (!Number.isFinite(normalized) || normalized <= 0) return 0;
    return Number(normalized.toFixed(2));
  }

  function formatMoney(value) {
    const amount = Number(value || 0);
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  }

  function formatPercent(value) {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount)) return '0.00%';
    return `${amount.toFixed(2)}%`;
  }

  function getLeadId() {
    const raw = Number(window.currentLeadId || 0);
    return Number.isInteger(raw) && raw > 0 ? raw : null;
  }

  function isBudgetSectionVisible() {
    const section = document.getElementById('budgetSection');
    return Boolean(section) && !section.classList.contains('hidden');
  }

  function normalizeBudgetPayload(raw) {
    const base = cloneDefaultBudget();
    MONEY_FIELD_MAP.forEach(({ path }) => {
      const value = getByPath(raw, path, 0);
      setByPath(base, path, parseMoney(value));
    });

    SELECT_FIELD_MAP.forEach(({ path }) => {
      const value = String(getByPath(raw, path, '') || '').trim();
      setByPath(base, path, value.slice(0, 40));
    });

    TEXT_FIELD_MAP.forEach(({ path, max }) => {
      const value = String(getByPath(raw, path, '') || '').trim();
      setByPath(base, path, value.slice(0, max));
    });

    const housingType = getByPath(base, ['budgetItems', 'housing', 'housingType'], '');
    if (!['', 'rent', 'own'].includes(housingType)) {
      setByPath(base, ['budgetItems', 'housing', 'housingType'], '');
    }

    return base;
  }

  function readBudgetFromUI() {
    const data = cloneDefaultBudget();

    MONEY_FIELD_MAP.forEach(({ id, path }) => {
      const el = document.getElementById(id);
      setByPath(data, path, parseMoney(el ? el.value : 0));
    });

    SELECT_FIELD_MAP.forEach(({ id, path }) => {
      const el = document.getElementById(id);
      setByPath(data, path, String(el ? el.value : '').trim());
    });

    TEXT_FIELD_MAP.forEach(({ id, path, max }) => {
      const el = document.getElementById(id);
      setByPath(data, path, String(el ? el.value : '').trim().slice(0, max));
    });

    return normalizeBudgetPayload(data);
  }

  function applyBudgetToUI(payload) {
    const data = normalizeBudgetPayload(payload);

    MONEY_FIELD_MAP.forEach(({ id, path }) => {
      const el = document.getElementById(id);
      if (!el) return;
      const value = Number(getByPath(data, path, 0));
      el.value = value > 0 ? value.toFixed(2).replace(/\.00$/, '') : '';
    });

    SELECT_FIELD_MAP.forEach(({ id, path }) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = String(getByPath(data, path, '') || '');
    });

    TEXT_FIELD_MAP.forEach(({ id, path }) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = String(getByPath(data, path, '') || '');
    });
  }

  function getProgramMonthlyCost() {
    const fromUI = parseMoney(document.getElementById('resultMonthlyPayment')?.textContent || '');
    if (fromUI > 0) return fromUI;

    const lead = window.currentLeadData || {};
    const totalDebt = parseMoney(lead.calc_total_debt);
    const settlementPercent = parseMoney(lead.calc_settlement_percent) || 55;
    const programFeePercent = parseMoney(lead.calc_program_fee_percent) || 25;
    const bankFee = parseMoney(lead.calc_bank_fee) || 9.95;
    const months = Math.max(6, parseInt(lead.calc_months, 10) || 48);
    const legalEnabled = Boolean(lead.calc_legal_plan_enabled);

    const estimatedSettlement = totalDebt * (settlementPercent / 100);
    const programFees = totalDebt * (programFeePercent / 100);
    const totalLegalFees = (legalEnabled ? 24.99 : 0) * months;
    const totalBankFees = (bankFee * months) + bankFee;
    const totalProgram = estimatedSettlement + programFees + totalLegalFees + totalBankFees;

    if (!Number.isFinite(totalProgram) || totalProgram <= 0) return 0;
    return Number((totalProgram / months).toFixed(2));
  }

  function sumMoney(values) {
    return values.reduce((acc, value) => acc + parseMoney(value), 0);
  }

  function computeBudgetMetrics(data) {
    const payload = normalizeBudgetPayload(data || readBudgetFromUI());

    const applicant = payload.income.applicant;
    const coapp = payload.income.coapp;

    const applicantIncome = sumMoney([
      applicant.netMonthlyIncome,
      applicant.socialSecurity,
      applicant.alimony,
      applicant.retirement,
      applicant.fixedIncome,
      applicant.unemployment,
      applicant.childSupport,
      applicant.other
    ]);

    const coappIncome = sumMoney([
      coapp.netMonthlyIncome,
      coapp.socialSecurity,
      coapp.alimony,
      coapp.retirement,
      coapp.fixedIncome,
      coapp.unemployment,
      coapp.childSupport,
      coapp.other
    ]);

    const manualHouseholdIncome = Math.max(
      parseMoney(applicant.totalHouseholdIncome),
      parseMoney(coapp.totalHouseholdIncome)
    );

    const totalMonthlyIncome = manualHouseholdIncome > 0
      ? manualHouseholdIncome
      : Number((applicantIncome + coappIncome).toFixed(2));

    const budgetItems = payload.budgetItems;
    const totalHouseholdExpenses = sumMoney([
      budgetItems.housing.housingPayment,
      budgetItems.housing.homeOwnersInsurance,
      budgetItems.housing.secondaryHousePayment,
      budgetItems.transportation.autoPayments,
      budgetItems.transportation.autoInsurance,
      budgetItems.transportation.repairsMaintenance,
      budgetItems.transportation.gasoline,
      budgetItems.transportation.parking,
      budgetItems.transportation.commuting,
      budgetItems.food.groceries,
      budgetItems.food.eatingOut,
      budgetItems.utilities.averageEnergy,
      budgetItems.utilities.averagePhone,
      budgetItems.utilities.averageWater,
      budgetItems.utilities.averageInternet,
      budgetItems.otherExpenses
    ]);

    const monthlyProgramCost = getProgramMonthlyCost();
    const totalMonthlyExpenses = Number((totalHouseholdExpenses + monthlyProgramCost).toFixed(2));

    const monthlyDebtToIncome = totalMonthlyIncome > 0
      ? Number(((totalHouseholdExpenses / totalMonthlyIncome) * 100).toFixed(2))
      : 0;

    const monthlyDebtToIncomeWithProgram = totalMonthlyIncome > 0
      ? Number(((totalMonthlyExpenses / totalMonthlyIncome) * 100).toFixed(2))
      : 0;

    const fundsAvailable = Number((totalMonthlyIncome - totalMonthlyExpenses).toFixed(2));

    return {
      totalMonthlyIncome,
      totalHouseholdExpenses,
      monthlyDebtToIncome,
      monthlyProgramCost,
      totalMonthlyExpenses,
      monthlyDebtToIncomeWithProgram,
      fundsAvailable
    };
  }

  function renderBudgetMetrics(metrics) {
    const m = metrics || computeBudgetMetrics();

    const map = [
      ['budgetDetailTotalIncome', formatMoney(m.totalMonthlyIncome)],
      ['budgetDetailTotalExpenses', formatMoney(m.totalHouseholdExpenses)],
      ['budgetDetailDti', formatPercent(m.monthlyDebtToIncome)],
      ['budgetDetailProgramCost', formatMoney(m.monthlyProgramCost)],
      ['budgetDetailTotalMonthlyExpenses', formatMoney(m.totalMonthlyExpenses)],
      ['budgetDetailDtiWithProgram', formatPercent(m.monthlyDebtToIncomeWithProgram)],
      ['budgetDetailFundsAvailable', formatMoney(m.fundsAvailable)]
    ];

    map.forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    });
  }

  function setBudgetStatus(message, tone = '') {
    const statusEl = document.getElementById('budgetSaveStatus');
    if (!statusEl) return;
    statusEl.textContent = String(message || '');
    statusEl.className = `budget-save-status${tone ? ` ${tone}` : ''}`;
  }

  async function saveBudgetNow({ silentSuccess = false } = {}) {
    if (budgetSaving) return;

    const leadId = getLeadId();
    if (!leadId) return;

    budgetSaving = true;
    setBudgetStatus('Guardando...', '');

    try {
      const payload = readBudgetFromUI();
      const response = await fetch(`/api/leads/${leadId}/budget`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || 'No se pudo guardar Budget.');
      }

      if (!silentSuccess) {
        setBudgetStatus('Guardado', 'success');
      } else {
        setBudgetStatus('Sin cambios', '');
      }
    } catch (error) {
      setBudgetStatus(error.message || 'Error guardando Budget.', 'error');
    } finally {
      budgetSaving = false;
    }
  }

  function queueBudgetSave() {
    renderBudgetMetrics(computeBudgetMetrics());
    setBudgetStatus('Pendiente de guardar...', '');

    if (budgetSaveTimer) clearTimeout(budgetSaveTimer);
    budgetSaveTimer = setTimeout(() => {
      saveBudgetNow({ silentSuccess: true });
    }, 700);
  }

  function activateBudgetSubtab(tabName) {
    const normalized = String(tabName || 'items').trim().toLowerCase();
    document.querySelectorAll('.budget-subtab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.budgetTab === normalized);
    });
    document.querySelectorAll('.budget-panel').forEach((panel) => {
      panel.classList.toggle('active', panel.dataset.budgetPanel === normalized);
    });
    const section = document.getElementById('budgetSection');
    if (section) {
      section.classList.toggle('budget-hardship-active', normalized === 'hardship');
    }
  }

  function activateBudgetInnerTab(groupName, tabName) {
    const group = String(groupName || '').trim().toLowerCase();
    const tab = String(tabName || '').trim().toLowerCase();
    if (!group || !tab) return;

    document
      .querySelectorAll(`.budget-inner-tab[data-budget-inner-group="${group}"]`)
      .forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.budgetInnerTab === tab);
      });

    document
      .querySelectorAll(`.budget-inner-panel[data-budget-inner-group="${group}"]`)
      .forEach((panel) => {
        panel.classList.toggle('active', panel.dataset.budgetInnerPanel === tab);
      });
  }

  function bindBudgetUiEvents() {
    if (budgetBindingsReady) return;
    budgetBindingsReady = true;

    document.querySelectorAll('.budget-subtab').forEach((btn) => {
      btn.addEventListener('click', () => activateBudgetSubtab(btn.dataset.budgetTab));
    });

    document.querySelectorAll('.budget-inner-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        activateBudgetInnerTab(btn.dataset.budgetInnerGroup, btn.dataset.budgetInnerTab);
      });
    });

    const allFieldIds = [
      ...MONEY_FIELD_MAP.map((item) => item.id),
      ...SELECT_FIELD_MAP.map((item) => item.id),
      ...TEXT_FIELD_MAP.map((item) => item.id)
    ];

    allFieldIds.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', queueBudgetSave);
      el.addEventListener('change', queueBudgetSave);
      if (el.tagName === 'INPUT') {
        el.addEventListener('blur', () => {
          const current = parseMoney(el.value);
          el.value = current > 0 ? current.toFixed(2).replace(/\.00$/, '') : '';
          renderBudgetMetrics(computeBudgetMetrics());
        });
      }
    });

    const saveBtn = document.getElementById('budgetSaveBtn');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        await saveBudgetNow();
      });
    }
  }

  async function loadBudgetData() {
    const leadId = getLeadId();
    if (!leadId) return;

    try {
      setBudgetStatus('Cargando Budget...', '');
      const response = await fetch(`/api/leads/${leadId}/budget`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || 'No se pudo cargar Budget.');
      }

      applyBudgetToUI(data.budget || cloneDefaultBudget());
      renderBudgetMetrics(computeBudgetMetrics());
      budgetLeadIdLoaded = String(leadId);
      setBudgetStatus('Sin cambios', '');
    } catch (error) {
      applyBudgetToUI(cloneDefaultBudget());
      renderBudgetMetrics(computeBudgetMetrics());
      setBudgetStatus(error.message || 'No se pudo cargar Budget.', 'error');
    }
  }

  async function initBudgetSection() {
    const section = document.getElementById('budgetSection');
    if (!section) return;

    if (!budgetSectionInitialized) {
      budgetSectionInitialized = true;
      bindBudgetUiEvents();
      activateBudgetSubtab('items');
      activateBudgetInnerTab('items', 'housing');
      activateBudgetInnerTab('income', 'applicant');
    }

    const leadId = getLeadId();
    if (!leadId) {
      renderBudgetMetrics(computeBudgetMetrics(cloneDefaultBudget()));
      return;
    }

    if (budgetLeadIdLoaded !== String(leadId)) {
      await loadBudgetData();
      return;
    }

    renderBudgetMetrics(computeBudgetMetrics());
  }

  window.initBudgetSection = initBudgetSection;
  window.refreshBudgetDetailsFromCalculator = function refreshBudgetDetailsFromCalculator() {
    if (!document.getElementById('budgetSection')) return;
    renderBudgetMetrics(computeBudgetMetrics());
  };
  window.onLeadLoadedForBudget = function onLeadLoadedForBudget() {
    const leadId = getLeadId();
    if (!leadId) {
      budgetLeadIdLoaded = null;
      return;
    }
    if (isBudgetSectionVisible()) {
      initBudgetSection();
    } else {
      budgetLeadIdLoaded = null;
      setBudgetStatus('Sin cambios', '');
    }
  };
})();
