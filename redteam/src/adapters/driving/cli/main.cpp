#include <iostream>
#include <iterator>
#include <string>
#include <string_view>

#include "adapters/driven/fs/FilesystemFileSource.hpp"
#include "adapters/driven/llm/BackendFactory.hpp"
#include "adapters/driven/llm/ProbeResponseParser.hpp"
#include "adapters/driving/cli/JsonReportWriter.hpp"
#include "adapters/driving/cli/JsonRequestParser.hpp"
#include "app/RedTeamServiceImpl.hpp"

namespace {

constexpr std::string_view kUsage =
    "sa-redteam — red-teaming stage for secure_agent\n"
    "\n"
    "Usage:\n"
    "  sa-redteam run [options] < request.json > report.json\n"
    "\n"
    "Options:\n"
    "  --backend <fake|direct>   Override request.backend.kind\n"
    "  --compact                 Emit single-line JSON (default: pretty)\n"
    "  -h, --help                Show this help\n"
    "\n"
    "Exit codes: 0 on success (findings are data, not failure);\n"
    "            2 usage error; 3 invalid request JSON.\n";

std::string read_all(std::istream& in) {
  return std::string((std::istreambuf_iterator<char>(in)),
                     std::istreambuf_iterator<char>());
}

}  // namespace

int main(int argc, char** argv) {
  using namespace redteam;

  std::string backend_override;
  bool pretty = true;

  if (argc < 2) {
    std::cerr << kUsage;
    return 2;
  }
  const std::string_view cmd = argv[1];
  if (cmd == "-h" || cmd == "--help") {
    std::cout << kUsage;
    return 0;
  }
  if (cmd != "run") {
    std::cerr << "error: unknown command '" << cmd << "'\n\n" << kUsage;
    return 2;
  }

  for (int i = 2; i < argc; ++i) {
    const std::string_view a = argv[i];
    if (a == "--backend" && i + 1 < argc) {
      backend_override = argv[++i];
    } else if (a == "--compact") {
      pretty = false;
    } else if (a == "-h" || a == "--help") {
      std::cout << kUsage;
      return 0;
    } else {
      std::cerr << "error: unexpected argument '" << a << "'\n\n" << kUsage;
      return 2;
    }
  }

  const std::string raw = read_all(std::cin);
  ParsedRequest parsed = parse_request_json(raw);
  if (!parsed.ok) {
    std::cerr << "error: invalid request JSON: " << parsed.error << "\n";
    return 3;
  }

  Request request = std::move(parsed.request);
  if (!backend_override.empty()) request.backend.kind = backend_override;

  RedTeamServiceImpl service(default_file_source_factory(),
                             default_backend_factory(), default_probe_parser());
  const Report report = service.run(request);

  std::cout << write_report_json(report, pretty) << "\n";
  return 0;
}
