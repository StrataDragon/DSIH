export function evaluateOfflineEligibility(schemeId: string, profile: any, rule: any) {
  const result = {
    status: "eligible",
    explanation: "Based on local offline evaluation, you meet all primary criteria.",
    failed: [] as string[],
    missing: [] as string[],
  };

  if (!rule || Object.keys(rule).length === 0) {
    result.status = "not_eligible";
    result.explanation = "Rule definition missing in offline cache.";
    result.failed.push("Cannot evaluate offline without downloaded rules.");
    return result;
  }

  // Age Check
  if (rule.age) {
    if (!profile.age) {
      result.missing.push("Age");
    } else {
      if (rule.age.min !== null && profile.age < rule.age.min) result.failed.push(`Age must be at least ${rule.age.min}`);
      if (rule.age.max !== null && profile.age > rule.age.max) result.failed.push(`Age must be at most ${rule.age.max}`);
    }
  }

  // Gender Check
  if (rule.gender && rule.gender !== "Any") {
    if (!profile.gender) {
      result.missing.push("Gender");
    } else if (profile.gender.toLowerCase() !== rule.gender.toLowerCase()) {
      result.failed.push(`Scheme is restricted to ${rule.gender} applicants`);
    }
  }

  // Income Check
  if (rule.income && rule.income.max_annual !== null) {
    if (!profile.income) {
      result.missing.push("Annual Income");
    } else if (profile.income > rule.income.max_annual) {
      result.failed.push(`Income exceeds maximum allowed (₹${rule.income.max_annual})`);
    }
  }

  // State Check
  if (rule.state_scope && rule.state_scope.length > 0 && !rule.state_scope.includes("All")) {
    if (!profile.state) {
      result.missing.push("State of Residence");
    } else if (!rule.state_scope.includes(profile.state)) {
      result.failed.push(`Scheme is only applicable in: ${rule.state_scope.join(", ")}`);
    }
  }

  // Occupation Check
  if (rule.occupation_required && rule.occupation_required.length > 0) {
    if (!profile.occupation) {
      result.missing.push("Occupation");
    } else {
      const match = rule.occupation_required.some((occ: string) => profile.occupation.toLowerCase().includes(occ.toLowerCase()));
      if (!match) {
        result.failed.push(`Requires occupation to be one of: ${rule.occupation_required.join(", ")}`);
      }
    }
  }

  if (result.failed.length > 0) {
    result.status = "not_eligible";
    result.explanation = "You do not meet the core eligibility criteria based on offline checks.";
  } else if (result.missing.length > 0) {
    result.status = "needs_info";
    result.explanation = "We need more information to complete the offline evaluation.";
  }

  return result;
}
