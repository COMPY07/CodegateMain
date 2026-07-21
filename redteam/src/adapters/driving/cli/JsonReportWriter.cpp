#include "adapters/driving/cli/JsonReportWriter.hpp"

#include "adapters/common/JsonConvert.hpp"

namespace redteam {

std::string write_report_json(const Report& report, bool pretty) {
  const js::json j = jsonconv::to_json(report);
  return j.dump(pretty ? 2 : -1);
}

}  // namespace redteam
