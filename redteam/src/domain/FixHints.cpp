#include "domain/FixHints.hpp"

namespace redteam {

std::vector<std::string> cwe_for(Category c) {
  switch (c) {
    case Category::CommandInjection: return {"CWE-78"};
    case Category::PathTraversal: return {"CWE-22"};
    case Category::SqlInjection: return {"CWE-89"};
    case Category::Deserialization: return {"CWE-502"};
    case Category::Ssrf: return {"CWE-918"};
    case Category::CodeInjection: return {"CWE-94"};
    case Category::MemorySafety: return {"CWE-120", "CWE-787"};
    case Category::AuthWeakness: return {"CWE-287"};
    case Category::CryptoWeakness: return {"CWE-327"};
    case Category::SecretExposure: return {"CWE-798"};
    case Category::Redos: return {"CWE-1333"};
    case Category::Csrf: return {"CWE-352"};
    case Category::Xss: return {"CWE-79"};
    case Category::Other: return {};
  }
  return {};
}

std::string title_for(Category c) {
  switch (c) {
    case Category::CommandInjection: return "Possible command injection";
    case Category::PathTraversal: return "Possible path traversal";
    case Category::SqlInjection: return "Possible SQL injection";
    case Category::Deserialization: return "Unsafe deserialization";
    case Category::Ssrf: return "Possible server-side request forgery";
    case Category::CodeInjection: return "Dynamic code evaluation";
    case Category::MemorySafety: return "Memory-safety hazard";
    case Category::AuthWeakness: return "Authentication weakness";
    case Category::CryptoWeakness: return "Weak cryptography";
    case Category::SecretExposure: return "Hardcoded secret";
    case Category::Redos: return "Regular-expression denial of service";
    case Category::Csrf: return "Missing CSRF protection";
    case Category::Xss: return "Possible cross-site scripting";
    case Category::Other: return "Security concern";
  }
  return "Security concern";
}

std::string fix_for(Category c) {
  switch (c) {
    case Category::CommandInjection:
      return "Avoid invoking a shell; pass a fixed argv (execve/subprocess with "
             "shell=False) and allowlist any interpolated value.";
    case Category::PathTraversal:
      return "Resolve the path against a fixed base directory and reject any "
             "component containing '..' or absolute paths.";
    case Category::SqlInjection:
      return "Use parameterized queries / prepared statements; never build SQL "
             "by string concatenation.";
    case Category::Deserialization:
      return "Do not deserialize untrusted data with pickle/yaml.load/readObject; "
             "use a safe format (JSON) and validate the schema.";
    case Category::Ssrf:
      return "Validate and allowlist the destination host; block internal/"
             "link-local addresses before making the request.";
    case Category::CodeInjection:
      return "Remove eval/dynamic code construction; use an explicit dispatch "
             "table or a safe parser.";
    case Category::MemorySafety:
      return "Use bounded operations (snprintf, strncpy_s, std::string/"
             "std::span) and check lengths before copying.";
    case Category::AuthWeakness:
      return "Enforce signature verification (reject alg=none), use constant-"
             "time comparison, and rotate/expire sessions.";
    case Category::CryptoWeakness:
      return "Use a modern algorithm (SHA-256+, AES-GCM) and a CSPRNG; never "
             "disable TLS verification.";
    case Category::SecretExposure:
      return "Remove the hardcoded secret; load it from an environment variable "
             "or secret manager and rotate the exposed value.";
    case Category::Redos:
      return "Bound the input length and avoid catastrophic backtracking; prefer "
             "a linear-time matcher (RE2).";
    case Category::Csrf:
      return "Require an anti-CSRF token on state-changing requests.";
    case Category::Xss:
      return "Escape/encode output for its context; avoid raw HTML injection "
             "(innerHTML/dangerouslySetInnerHTML).";
    case Category::Other:
      return "Review this code path for untrusted-input handling.";
  }
  return "Review this code path.";
}

}  // namespace redteam
