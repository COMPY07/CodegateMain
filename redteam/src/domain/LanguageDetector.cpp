#include "domain/LanguageDetector.hpp"

#include <algorithm>
#include <cctype>
#include <cstddef>
#include <string>

namespace redteam {
namespace {

std::string to_lower(std::string_view s) {
  std::string out(s);
  std::transform(out.begin(), out.end(), out.begin(),
                 [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
  return out;
}

std::string_view extension(std::string_view path) {
  const std::size_t slash = path.find_last_of('/');
  const std::string_view name =
      slash == std::string_view::npos ? path : path.substr(slash + 1);
  const std::size_t dot = name.find_last_of('.');
  if (dot == std::string_view::npos || dot + 1 >= name.size()) return {};
  return name.substr(dot + 1);
}

Language from_extension(std::string_view ext_lower) {
  struct E {
    std::string_view ext;
    Language lang;
  };
  static constexpr E kMap[] = {
      {"c", Language::C},         {"h", Language::C},
      {"cc", Language::Cpp},      {"cpp", Language::Cpp},
      {"cxx", Language::Cpp},     {"hpp", Language::Cpp},
      {"hh", Language::Cpp},      {"hxx", Language::Cpp},
      {"py", Language::Python},   {"pyw", Language::Python},
      {"js", Language::JavaScript}, {"jsx", Language::JavaScript},
      {"mjs", Language::JavaScript}, {"cjs", Language::JavaScript},
      {"ts", Language::TypeScript}, {"tsx", Language::TypeScript},
      {"go", Language::Go},       {"java", Language::Java},
      {"rb", Language::Ruby},     {"php", Language::Php},
      {"cs", Language::CSharp},   {"rs", Language::Rust},
  };
  for (const auto& e : kMap)
    if (e.ext == ext_lower) return e.lang;
  return Language::Unknown;
}

Language from_shebang(std::string_view content) {
  if (content.size() < 2 || content[0] != '#' || content[1] != '!')
    return Language::Unknown;
  const std::size_t nl = content.find('\n');
  const std::string line =
      to_lower(content.substr(0, nl == std::string_view::npos ? content.size() : nl));
  if (line.find("python") != std::string::npos) return Language::Python;
  if (line.find("node") != std::string::npos) return Language::JavaScript;
  if (line.find("ruby") != std::string::npos) return Language::Ruby;
  if (line.find("php") != std::string::npos) return Language::Php;
  return Language::Unknown;
}

}  // namespace

Language detect_language(std::string_view path, std::string_view content) {
  if (const Language byExt = from_extension(to_lower(extension(path)));
      byExt != Language::Unknown)
    return byExt;
  if (const Language byShebang = from_shebang(content);
      byShebang != Language::Unknown)
    return byShebang;
  return Language::Unknown;
}

}  // namespace redteam
