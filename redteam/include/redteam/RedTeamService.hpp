#pragma once
#include "redteam/Signals.hpp"
#include "redteam/Types.hpp"

// Inbound port: the entry point the main agent (or CLI) calls.
namespace redteam {

class RedTeamService {
 public:
  virtual ~RedTeamService() = default;

  // Read the project, rough-filter hot regions, red-team them, return a report.
  virtual Report run(const Request& request) = 0;
};

}  // namespace redteam
