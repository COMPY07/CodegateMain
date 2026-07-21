#pragma once
#include <map>
#include <string>

#include "redteam/Signals.hpp"

// Signal 3: taint reachability over the coding_flow the summarization stage
// provides. Answers "does an unsanitized source reach a sink in this function?"
// — cross-function edges included. Absent coding_flow => empty graph and the
// caller falls back to intra-region source/sink co-occurrence.
namespace redteam {

class FlowGraph {
 public:
  explicit FlowGraph(const CodingFlow& flow);
  FlowGraph() = default;

  struct Reach {
    bool reachable = false;    // a source reaches some sink
    bool unsanitized = false;  // via a path with no sanitizing edge
    std::string source_kind;
    std::string sink_kind;
    int sink_line = 0;
  };

  bool has_function(const std::string& file, const std::string& function) const;
  Reach query(const std::string& file, const std::string& function) const;

 private:
  std::map<std::string, CodingFlowFunction> fns_;  // key: file + "::" + name
};

}  // namespace redteam
