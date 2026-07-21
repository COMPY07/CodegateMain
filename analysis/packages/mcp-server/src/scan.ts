// Config scanner.
// Rule findings.

import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { glob } from "node:fs/promises";
import type { ScanFinding, SecurityScanOutput } from "@vibegate/contracts";
import { confineRoot } from "./sandbox.js";

// Engine version.
const ENGINE_VERSION = "0.1.0";

// One scan rule.
interface Rule {
  readonly id: string;
  readonly owasp: string;
  readonly severity: ScanFinding["severity"];
  readonly pattern: RegExp;
  readonly message: string;
}

// Rule catalogue.
const RULES: readonly Rule[] = [
  {
    id: "hardcoded-secret",
    owasp: "A02",
    severity: "HIGH",
    pattern: /(api[_-]?key|secret|password|token)\s*[:=]\s*["'][^"']{12,}["']/i,
    message: "Hardcoded credential literal",
  },
  {
    id: "aws-access-key",
    owasp: "A02",
    severity: "HIGH",
    pattern: /AKIA[0-9A-Z]{16}/,
    message: "AWS access key",
  },
  {
    id: "weak-hash",
    owasp: "A04",
    severity: "MEDIUM",
    pattern: /createHash\(\s*["'](md5|sha1)["']\s*\)/i,
    message: "Weak hash algorithm",
  },
  {
    id: "insecure-cookie",
    owasp: "A02",
    severity: "MEDIUM",
    pattern: /httpOnly\s*:\s*false|secure\s*:\s*false/i,
    message: "Insecure cookie flag",
  },
  {
    id: "eval-use",
    owasp: "A05",
    severity: "HIGH",
    pattern: /\beval\s*\(/,
    message: "Dynamic eval call",
  },
  {
    id: "disabled-tls",
    owasp: "A02",
    severity: "HIGH",
    pattern: /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED/,
    message: "TLS verification disabled",
  },
  {
    id: "install-script-shell",
    owasp: "A03",
    severity: "HIGH",
    pattern: /"(post|pre)?install"\s*:\s*"[^"]*(curl|wget)[^"]*\|\s*(sh|bash)/i,
    message: "Install script pipes shell",
  },
  {
    id: "git-url-dependency",
    owasp: "A03",
    severity: "MEDIUM",
    pattern: /"[^"]+"\s*:\s*"(git\+|https?:\/\/|github:)[^"]*"/,
    message: "Non-registry dependency source",
  },
  {
    id: "logged-secret",
    owasp: "A09",
    severity: "MEDIUM",
    pattern: /console\.\w+\([^)]*(password|secret|token|apiKey|api_key)/i,
    message: "Secret written to log",
  },
];

// Collect scannable files.
async function scanFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  for await (const entry of glob("**/*.{ts,tsx,js,json,env}", { cwd: root })) {
    if (/node_modules|\.d\.ts$|(^|\/)package-lock\.json$/.test(entry)) continue;
    out.push(entry);
  }
  return out;
}

// Scan repository.
export async function scan(
  requestedRoot: string,
): Promise<SecurityScanOutput> {
  const root = confineRoot(requestedRoot);
  const files = await scanFiles(root);
  const findings: ScanFinding[] = [];

  for (const rel of files) {
    const abs = confineRoot(rel === "" ? root : `${root}/${rel}`);
    let text: string;
    try {
      text = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      for (const rule of RULES) {
        if (rule.pattern.test(line)) {
          findings.push({
            rule: rule.id,
            owasp: rule.owasp,
            severity: rule.severity,
            file: relative(root, abs),
            line: i + 1,
            message: rule.message,
          });
        }
      }
    });
  }

  return {
    findings,
    filesScanned: files.length,
    engine: { name: "vibegate", version: ENGINE_VERSION },
  };
}
