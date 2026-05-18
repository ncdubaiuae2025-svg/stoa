// stoa/src/validate.ts — LLM output validation layer
//
// Validates that Claude's outputs conform to expected schemas
// before any state changes or transactions are committed.

import { createLogger } from "./logger.js";

const log = createLogger("validate");

export interface ValidationRule {
  name: string;
  check: (output: string) => ValidationResult;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/** Validate that output doesn't contain hallucinated data patterns */
function checkNoFabrication(output: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for suspiciously round numbers in price data
  const priceMatches = output.match(/\$[\d,]+\.00\b/g);
  if (priceMatches && priceMatches.length > 3) {
    warnings.push(`Suspicious: ${priceMatches.length} perfectly round prices detected`);
  }

  // Check for placeholder/fake addresses
  const fakeAddressPatterns = [
    /0x[0]+/g,
    /1111111111/g,
    /AAAA+/g,
    /your[_-]?address/gi,
    /example[_-]?address/gi,
  ];
  for (const pattern of fakeAddressPatterns) {
    if (pattern.test(output)) {
      errors.push(`Detected placeholder/fake address pattern: ${pattern.source}`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/** Validate that mesh messages follow the correct schema */
function checkMeshMessageSchema(output: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Look for JSON blocks that look like mesh messages
  const jsonBlocks = output.match(/\{[^{}]*"from"[^{}]*"to"[^{}]*\}/g) || [];

  for (const block of jsonBlocks) {
    try {
      const msg = JSON.parse(block);
      if (!msg.from || !msg.to || !msg.type) {
        errors.push("Mesh message missing required fields (from, to, type)");
      }
      if (typeof msg.data !== "object") {
        warnings.push("Mesh message data should be an object");
      }
    } catch {
      // Not valid JSON, skip
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/** Validate trade execution outputs */
function checkTradeOutput(output: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for unsafe transaction patterns
  if (/transfer.*all|drain|sweep.*entire/i.test(output)) {
    errors.push("Detected dangerous transfer-all pattern");
  }

  // Check for unreasonable amounts
  const amountMatches = output.match(/amount["\s:]+(\d+)/gi) || [];
  for (const match of amountMatches) {
    const numMatch = match.match(/(\d+)/);
    if (numMatch) {
      const amount = parseInt(numMatch[1]);
      if (amount > 1_000_000_000) {
        warnings.push(`Unusually large amount detected: ${amount}`);
      }
    }
  }

  // Verify transaction signatures look valid (base58, 87-88 chars)
  const sigPattern = /[1-9A-HJ-NP-Za-km-z]{87,88}/g;
  const sigs = output.match(sigPattern) || [];
  if (output.includes("tx_signature") && sigs.length === 0) {
    warnings.push("Claims transaction but no valid signature found");
  }

  return { valid: errors.length === 0, errors, warnings };
}

/** Validate that no secrets are leaked in output */
function checkNoSecretLeak(output: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const secretPatterns = [
    { pattern: /[1-9A-HJ-NP-Za-km-z]{64,}/g, name: "private key" },
    { pattern: /sk-[a-zA-Z0-9]{20,}/g, name: "API key (sk-)" },
    { pattern: /ghp_[a-zA-Z0-9]{36}/g, name: "GitHub token" },
    { pattern: /xox[bprs]-[a-zA-Z0-9-]+/g, name: "Slack token" },
  ];

  for (const { pattern, name } of secretPatterns) {
    if (pattern.test(output)) {
      errors.push(`Potential ${name} leak detected in output`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// All validation rules
const RULES: ValidationRule[] = [
  { name: "no-fabrication", check: checkNoFabrication },
  { name: "mesh-schema", check: checkMeshMessageSchema },
  { name: "trade-safety", check: checkTradeOutput },
  { name: "no-secret-leak", check: checkNoSecretLeak },
];

export function validateOutput(output: string, context?: { agent?: string; skill?: string }): ValidationResult {
  const allErrors: string[] = [];
  const allWarnings: string[] = [];

  for (const rule of RULES) {
    const result = rule.check(output);
    allErrors.push(...result.errors);
    allWarnings.push(...result.warnings);
  }

  if (allErrors.length > 0) {
    log.error("Output validation failed", {
      agent: context?.agent,
      skill: context?.skill,
      errors: allErrors,
    });
  }
  if (allWarnings.length > 0) {
    log.warn("Output validation warnings", {
      agent: context?.agent,
      skill: context?.skill,
      warnings: allWarnings,
    });
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
}
