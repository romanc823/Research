/**
 * IRS form text for the internal desk. A box is kept only when the label
 * and one explicit amount are both present. Blank stays blank. An
 * unrecognized worksheet does not become zero.
 */

const MONEY_AFTER = /^\s*\$?\s*((?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2})/;
const TRAD_401K = new Set(["D", "E", "AA", "BB"]);

function uniqueNumbers(values) {
  return [...new Set(values)];
}

function collect(text, labelRe, allowBareZero = false) {
  const hits = [];
  let blanks = 0;
  for (const match of text.matchAll(labelRe)) {
    const rest = text.slice(match.index + match[0].length, match.index + match[0].length + 120).replace(/^\s*\([^)]{0,80}\)\s*/, "");
    const money = rest.match(MONEY_AFTER);
    if (money) {
      hits.push(Number(money[1].replace(/,/g, "")));
      continue;
    }
    if (allowBareZero && /^\s*0\b/.test(rest)) {
      hits.push(0);
      continue;
    }
    blanks += 1;
  }
  return { hits, blanks };
}

function yearsIn(text, pattern) {
  const years = [];
  for (const match of text.matchAll(pattern)) years.push(Number(match[1]));
  return years;
}

/**
 * @param {string} text
 * @param {{ confidence?: number }} [options]
 */
export function parseFormLayout(text, options = {}) {
  const confidence = options.confidence ?? 0.96;
  const source = typeof text === "string" ? text : "";
  const accepted = [];
  const dropped = [];
  const fields = {};
  const forms = [];

  function keep(field, value, evidence) {
    accepted.push({ field, value, confidence, evidence });
  }

  function omit(evidence, reason) {
    dropped.push({ evidence, reason });
  }

  const wages = collect(source, /1\s+Wages,\s+tips,\s+other compensation/gi);
  if (wages.blanks) {
    omit("1 Wages, tips, other compensation", "Blank W-2 box 1 omitted. It was not stored as zero.");
  }
  if (wages.hits.length) {
    const amounts = uniqueNumbers(wages.hits);
    const total = amounts.reduce((sum, value) => sum + value, 0);
    fields.earned_income = total;
    keep("earned_income", total, `1 Wages, tips, other compensation ${amounts.join(" + ")}`);
    if (!forms.includes("Form W-2")) forms.push("Form W-2");
  }

  const boxPairs = [
    [/2\s+Federal income tax withheld/gi, "w2_box2_withheld", "2 Federal income tax withheld"],
    [/3\s+Social security wages/gi, "w2_box3_ss_wages", "3 Social security wages"],
    [/4\s+Social security tax withheld/gi, "w2_box4_ss_tax", "4 Social security tax withheld"],
    [/5\s+Medicare wages and tips/gi, "w2_box5_medicare_wages", "5 Medicare wages and tips"],
    [/6\s+Medicare tax withheld/gi, "w2_box6_medicare_tax", "6 Medicare tax withheld"],
  ];
  for (const [pattern, field, label] of boxPairs) {
    const found = collect(source, pattern);
    if (found.blanks) omit(label, `Blank ${label} omitted. It was not stored as zero.`);
    if (found.hits.length) {
      const amounts = uniqueNumbers(found.hits);
      keep(field, amounts, `${label} ${amounts.join(" + ")}`);
      if (!forms.includes("Form W-2")) forms.push("Form W-2");
    }
  }

  const box12 = [...source.matchAll(/12([a-d])\s+(?:See instructions for box 12\s+)?([A-Z]{1,2})\s+\$?\s*((?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2})/gi)];
  const deferrals = [];
  for (const match of box12) {
    const code = match[2].toUpperCase();
    const amount = Number(match[3].replace(/,/g, ""));
    keep(`w2_box12_${code.toLowerCase()}`, amount, `12${match[1].toLowerCase()} ${code} ${match[3]}`);
    if (TRAD_401K.has(code)) deferrals.push(amount);
    if (!forms.includes("Form W-2")) forms.push("Form W-2");
  }
  if (deferrals.length) fields.trad_ira_or_401k = true;

  const ssa = collect(source, /Box\s+5\.\s+Net Benefits for\s+20\d{2}\s*(?:\([^)]*\))?/gi);
  if (ssa.blanks) {
    omit("Box 5 Net Benefits", "Blank Social Security net benefits omitted. They were not stored as zero.");
  }
  if (ssa.hits.length) {
    const amounts = uniqueNumbers(ssa.hits);
    keep("ssa_net_benefits", amounts, `Box 5 Net Benefits ${amounts.join(" + ")}`);
    const ssaForm = /SSA-1042S/i.test(source) ? "Form SSA-1042S" : "Form SSA-1099";
    if (!forms.includes(ssaForm)) forms.push(ssaForm);
  }

  const gross = collect(source, /1\s+Gross distribution/gi);
  if (gross.blanks) {
    omit("1 Gross distribution", "Blank Form 1099-R gross distribution omitted. It was not stored as zero.");
  }
  if (gross.hits.length) {
    const amounts = uniqueNumbers(gross.hits);
    keep("1099r_gross", amounts, `1 Gross distribution ${amounts.join(" + ")}`);
    fields.ira_or_1099r = true;
    if (!forms.includes("Form 1099-R")) forms.push("Form 1099-R");
  }

  const interest = collect(source, /1\s+Interest income/gi);
  if (interest.blanks) {
    omit("1 Interest income", "Blank Form 1099-INT box 1 omitted. It was not stored as zero.");
  }
  if (interest.hits.length) {
    const amounts = uniqueNumbers(interest.hits);
    keep("1099int_interest", amounts, `1 Interest income ${amounts.join(" + ")}`);
    if (!forms.includes("Form 1099-INT")) forms.push("Form 1099-INT");
  }

  const dividends = collect(source, /(?<![0-9])1a\s*[.\-:]?\s*Total ordinary dividends/gi);
  if (dividends.blanks) {
    omit("1a Total ordinary dividends", "Blank Form 1099-DIV box 1a omitted. It was not stored as zero.");
  }
  if (dividends.hits.length) {
    const amounts = uniqueNumbers(dividends.hits);
    keep("1099div_ordinary", amounts, `1a Total ordinary dividends ${amounts.join(" + ")}`);
    if (!forms.includes("Form 1099-DIV")) forms.push("Form 1099-DIV");
  }

  const se = collect(source, /Net earnings from self-employment/gi);
  if (se.blanks) {
    omit("Net earnings from self-employment", "Blank Schedule SE net earnings omitted. They were not stored as zero.");
  }
  if (uniqueNumbers(se.hits).length > 1) {
    omit("Net earnings from self-employment", "More than one Schedule SE net-earnings amount was explicit, so none was stored.");
  } else if (se.hits.length === 1 || uniqueNumbers(se.hits).length === 1) {
    const amount = uniqueNumbers(se.hits)[0];
    fields.se_income = amount;
    keep("se_income", amount, `Net earnings from self-employment ${amount}`);
    if (!forms.includes("Schedule SE")) forms.push("Schedule SE");
  }

  const sep = collect(source, /Self-employed SEP, SIMPLE, and qualified plans/gi, true);
  if (sep.blanks) {
    omit("Self-employed SEP, SIMPLE, and qualified plans", "Blank retirement deduction omitted. It was not stored as zero.");
  }
  if (uniqueNumbers(sep.hits).length > 1) {
    omit("Self-employed SEP, SIMPLE, and qualified plans", "Retirement lines disagreed, so none was stored as zero.");
  } else if (sep.hits.length) {
    const amount = uniqueNumbers(sep.hits)[0];
    fields.retirement_deduction = amount;
    keep("retirement_deduction", amount, `Self-employed SEP, SIMPLE, and qualified plans ${amount}`);
    if (!forms.includes("Schedule 1")) forms.push("Schedule 1");
  }

  const profit = collect(source, /Net profit or \(loss\)/gi);
  if (profit.hits.length === 1 || (profit.hits.length > 1 && uniqueNumbers(profit.hits).length === 1)) {
    fields.schedule_c = true;
    keep("schedule_c", true, "Schedule C net profit or (loss) was an explicit amount");
    if (!forms.includes("Schedule C")) forms.push("Schedule C");
  } else if (profit.blanks && !profit.hits.length && /Schedule C \(Form 1040\)/i.test(source)) {
    omit("Net profit or (loss)", "Schedule C net profit was not an explicit amount, so Schedule C was not set.");
  }

  const years = uniqueNumbers([
    ...yearsIn(source, /Wage and Tax Statement\s+(20\d{2})/gi),
    ...yearsIn(source, /BENEFIT STATEMENT\s+(20\d{2})/gi),
    ...yearsIn(source, /(20\d{2})\s+Form 1099-R/gi),
  ]);
  const taxYear = years.length === 1 ? years[0] : null;
  if (years.length > 1) {
    omit("tax year", "Form years disagreed, so the tax year was omitted.");
  }

  return { fields, forms, accepted, dropped, taxYear };
}
