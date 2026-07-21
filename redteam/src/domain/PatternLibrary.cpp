#include "domain/PatternLibrary.hpp"

namespace redteam {
namespace {

constexpr std::size_t kLangCount = 12;  // keep in sync with enum Language

struct Spec {
  PatternKind kind;
  Language lang;  // Language::Unknown means "applies to every language"
  Category category;
  const char* regex;
  const char* tag;
  double weight;
  const char* rationale;
};

// Curated, extensible detection table. Regexes are ECMAScript; keep them simple
// and anchored to identifiers so they stay bounded on hostile input.
constexpr Spec kSpecs[] = {
    // ---- taint sources ------------------------------------------------------
    {PatternKind::Source, Language::Unknown, Category::Other,
     R"(\bargv\b)", "source:argv", 0.5, "process arguments are attacker-controllable"},
    {PatternKind::Source, Language::Unknown, Category::Other,
     R"(\bgetenv\s*\()", "source:getenv", 0.4, "environment input"},
    {PatternKind::Source, Language::Python, Category::Other,
     R"(\binput\s*\()", "source:input", 0.5, "reads untrusted stdin"},
    {PatternKind::Source, Language::Python, Category::Other,
     R"(\brequest\.(args|form|json|values|data|files|cookies|headers|GET|POST))",
     "source:http-request", 0.75, "web request data is untrusted"},
    {PatternKind::Source, Language::Python, Category::Other,
     R"(\bos\.environ\b)", "source:os-environ", 0.4, "environment input"},
    {PatternKind::Source, Language::JavaScript, Category::Other,
     R"(\breq\.(body|query|params|headers|cookies))", "source:http-request", 0.75,
     "express request data is untrusted"},
    {PatternKind::Source, Language::JavaScript, Category::Other,
     R"(\bprocess\.argv\b)", "source:argv", 0.5, "process arguments"},
    {PatternKind::Source, Language::C, Category::Other,
     R"(\bscanf\s*\()", "source:scanf", 0.5, "reads untrusted input"},
    {PatternKind::Source, Language::C, Category::Other,
     R"(\bfgets\s*\()", "source:fgets", 0.4, "reads untrusted input"},
    {PatternKind::Source, Language::Php, Category::Other,
     R"(\$_(GET|POST|REQUEST|COOKIE|SERVER))", "source:superglobal", 0.8,
     "PHP superglobals are untrusted"},

    // ---- command injection --------------------------------------------------
    {PatternKind::Sink, Language::Unknown, Category::CommandInjection,
     R"(\bsystem\s*\()", "sink:system", 0.9, "shell command execution"},
    {PatternKind::Sink, Language::Unknown, Category::CommandInjection,
     R"(\bpopen\s*\()", "sink:popen", 0.85, "shell command execution"},
    {PatternKind::Sink, Language::Python, Category::CommandInjection,
     R"(\bos\.system\s*\()", "sink:os_system", 0.9, "shell command execution"},
    {PatternKind::Sink, Language::Python, Category::CommandInjection,
     R"(subprocess\.[A-Za-z_]+\([^)]*shell\s*=\s*True)", "sink:subprocess-shell",
     0.9, "subprocess with shell=True"},
    {PatternKind::Sink, Language::Python, Category::CommandInjection,
     R"(\bsubprocess\.(call|run|Popen|check_output)\s*\()", "sink:subprocess", 0.5,
     "subprocess invocation"},
    {PatternKind::Sink, Language::JavaScript, Category::CommandInjection,
     R"(child_process\.(exec|execSync)\s*\()", "sink:child_process-exec", 0.9,
     "shell command execution"},
    // `import { exec } from 'child_process'` / `const { exec } = require(...)` is the
    // dominant style in modern JS, and the member-access pattern above never sees it.
    // The leading guard keeps `regex.exec(` — an unrelated, very common call — out.
    {PatternKind::Sink, Language::JavaScript, Category::CommandInjection,
     R"((^|[^.\w])exec(Sync)?\s*\()", "sink:exec-destructured", 0.75,
     "shell command execution"},
    // Importing the module is itself a strong hint the region touches a shell.
    {PatternKind::Source, Language::JavaScript, Category::CommandInjection,
     R"((require\s*\(\s*['"]child_process['"]|from\s+['"]child_process['"]))",
     "src:child_process-import", 0.5, "child_process is a shell surface"},
    {PatternKind::Sink, Language::C, Category::CommandInjection,
     R"(\bexecl?[pe]{0,2}\s*\()", "sink:exec", 0.7, "process execution"},

    // ---- code injection -----------------------------------------------------
    {PatternKind::Sink, Language::Unknown, Category::CodeInjection,
     R"(\beval\s*\()", "sink:eval", 0.85, "dynamic code evaluation"},
    {PatternKind::Sink, Language::JavaScript, Category::CodeInjection,
     R"(new\s+Function\s*\()", "sink:new-function", 0.8, "dynamic code construction"},

    // ---- deserialization ----------------------------------------------------
    {PatternKind::Sink, Language::Python, Category::Deserialization,
     R"(\b(cP|_p|p)?pickle\.loads?\s*\()", "sink:pickle-load", 0.9,
     "untrusted deserialization"},
    {PatternKind::Sink, Language::Python, Category::Deserialization,
     R"(\byaml\.load\s*\((?![^)]*Safe))", "sink:yaml-load", 0.8,
     "unsafe YAML load"},
    {PatternKind::Sink, Language::Java, Category::Deserialization,
     R"(\breadObject\s*\()", "sink:readObject", 0.8, "untrusted deserialization"},
    {PatternKind::Sink, Language::Php, Category::Deserialization,
     R"(\bunserialize\s*\()", "sink:unserialize", 0.8, "untrusted deserialization"},

    // ---- sql injection ------------------------------------------------------
    {PatternKind::Sink, Language::Unknown, Category::SqlInjection,
     R"((SELECT|INSERT|UPDATE|DELETE|DROP)\b[^;\n]*(\+|%|\bformat\b|f["']))",
     "sink:sql-concat", 0.75, "SQL built by string concatenation/interpolation"},
    {PatternKind::Sink, Language::Unknown, Category::SqlInjection,
     R"(\b(execute|executemany|query)\s*\()", "sink:sql-exec", 0.35,
     "SQL execution point"},

    // ---- path traversal -----------------------------------------------------
    {PatternKind::Sink, Language::Python, Category::PathTraversal,
     R"(\bopen\s*\()", "sink:file-open", 0.4, "file open with possibly dynamic path"},
    {PatternKind::Sink, Language::C, Category::PathTraversal,
     R"(\bfopen\s*\()", "sink:fopen", 0.4, "file open with possibly dynamic path"},
    {PatternKind::Sink, Language::JavaScript, Category::PathTraversal,
     R"(\bfs\.(readFile|readFileSync|createReadStream|writeFile|writeFileSync)\s*\()",
     "sink:fs-path", 0.4, "filesystem access with possibly dynamic path"},

    // ---- ssrf ---------------------------------------------------------------
    {PatternKind::Sink, Language::Python, Category::Ssrf,
     R"(\brequests\.(get|post|put|delete|head|request)\s*\()", "sink:http-client",
     0.5, "outbound HTTP request"},
    {PatternKind::Sink, Language::Python, Category::Ssrf,
     R"(urllib\.request\.urlopen\s*\()", "sink:urlopen", 0.5, "outbound HTTP request"},
    {PatternKind::Sink, Language::JavaScript, Category::Ssrf,
     R"(\b(fetch|axios)\s*\()", "sink:http-client", 0.4, "outbound HTTP request"},

    // ---- memory safety (C/C++) ---------------------------------------------
    {PatternKind::Sink, Language::C, Category::MemorySafety,
     R"(\bgets\s*\()", "sink:gets", 0.95, "gets() has no bounds check"},
    {PatternKind::Sink, Language::C, Category::MemorySafety,
     R"(\bstrcpy\s*\()", "sink:strcpy", 0.8, "unbounded copy"},
    {PatternKind::Sink, Language::C, Category::MemorySafety,
     R"(\bstrcat\s*\()", "sink:strcat", 0.8, "unbounded concat"},
    {PatternKind::Sink, Language::C, Category::MemorySafety,
     R"(\bsprintf\s*\()", "sink:sprintf", 0.7, "unbounded formatted write"},
    {PatternKind::Sink, Language::C, Category::MemorySafety,
     R"(\b(memcpy|alloca)\s*\()", "sink:mem", 0.5, "manual memory op; check bounds"},

    // ---- xss ----------------------------------------------------------------
    {PatternKind::Sink, Language::JavaScript, Category::Xss,
     R"(dangerouslySetInnerHTML)", "sink:dangerous-html", 0.7, "raw HTML injection"},
    {PatternKind::Sink, Language::JavaScript, Category::Xss,
     R"(\.innerHTML\s*=)", "sink:innerHTML", 0.6, "raw HTML assignment"},
    {PatternKind::Sink, Language::Python, Category::Xss,
     R"(render_template_string\s*\()", "sink:render-template-string", 0.6,
     "server-side template injection surface"},

    // ---- crypto weakness ----------------------------------------------------
    {PatternKind::Sink, Language::Unknown, Category::CryptoWeakness,
     R"(\b(MD5|SHA1|md5|sha1)\b)", "sink:weak-hash", 0.45, "weak hash algorithm"},
    {PatternKind::Sink, Language::Unknown, Category::CryptoWeakness,
     R"(\bECB\b)", "sink:ecb-mode", 0.6, "ECB mode leaks structure"},
    {PatternKind::Sink, Language::Python, Category::CryptoWeakness,
     R"(verify\s*=\s*False)", "sink:tls-verify-off", 0.6, "TLS verification disabled"},
    {PatternKind::Sink, Language::JavaScript, Category::CryptoWeakness,
     R"(Math\.random\s*\()", "sink:weak-random", 0.4, "non-cryptographic RNG"},
    {PatternKind::Sink, Language::C, Category::CryptoWeakness,
     R"(\brand\s*\(\s*\))", "sink:weak-random", 0.4, "non-cryptographic RNG"},

    // ---- auth weakness ------------------------------------------------------
    {PatternKind::Sink, Language::Unknown, Category::AuthWeakness,
     R"((alg|algorithm)\s*[:=]\s*["']?none["']?)", "sink:jwt-alg-none", 0.8,
     "JWT alg=none disables signature verification"},

    // ---- sanitizers ---------------------------------------------------------
    {PatternKind::Sanitizer, Language::Python, Category::CommandInjection,
     R"(\bshlex\.quote\s*\()", "san:shlex-quote", 0.0, ""},
    {PatternKind::Sanitizer, Language::Python, Category::Other,
     R"(\b(re\.escape|html\.escape|markupsafe\.escape)\s*\()", "san:escape", 0.0, ""},
    {PatternKind::Sanitizer, Language::JavaScript, Category::Xss,
     R"(\bencodeURIComponent\s*\()", "san:encode-uri", 0.0, ""},
    {PatternKind::Sanitizer, Language::Unknown, Category::SqlInjection,
     R"(\b(bindParam|bind_param|parameterize|prepare)\s*\()", "san:parameterized",
     0.0, ""},
    {PatternKind::Sanitizer, Language::Unknown, Category::Other,
     R"(\b(allowlist|whitelist|sanitize|validate)\b)", "san:validate", 0.0, ""},
};

CompiledPattern compile(const Spec& s) {
  CompiledPattern c;
  c.category = s.category;
  c.tag = s.tag;
  c.weight = s.weight;
  c.rationale = s.rationale;
  c.re = std::regex(s.regex, std::regex::ECMAScript | std::regex::optimize);
  return c;
}

}  // namespace

PatternLibrary::PatternLibrary()
    : sources_(kLangCount), sinks_(kLangCount), sanitizers_(kLangCount) {
  for (const auto& spec : kSpecs) {
    auto& buckets = spec.kind == PatternKind::Source     ? sources_
                    : spec.kind == PatternKind::Sink     ? sinks_
                                                         : sanitizers_;
    for (std::size_t lang = 0; lang < kLangCount; ++lang) {
      const bool applies =
          spec.lang == Language::Unknown ||
          static_cast<std::size_t>(spec.lang) == lang;
      if (applies) buckets[lang].push_back(compile(spec));
    }
  }
}

const PatternLibrary& PatternLibrary::instance() {
  static const PatternLibrary kInstance;
  return kInstance;
}

const std::vector<CompiledPattern>& PatternLibrary::sources(Language lang) const {
  return sources_[static_cast<std::size_t>(lang)];
}
const std::vector<CompiledPattern>& PatternLibrary::sinks(Language lang) const {
  return sinks_[static_cast<std::size_t>(lang)];
}
const std::vector<CompiledPattern>& PatternLibrary::sanitizers(Language lang) const {
  return sanitizers_[static_cast<std::size_t>(lang)];
}

}  // namespace redteam
