#include "domain/FlowGraph.hpp"

#include <deque>
#include <set>

namespace redteam {
namespace {

std::string key_of(const std::string& file, const std::string& name) {
  return file + "::" + name;
}

}  // namespace

FlowGraph::FlowGraph(const CodingFlow& flow) {
  for (const auto& fn : flow.functions) fns_[key_of(fn.file, fn.name)] = fn;
}

bool FlowGraph::has_function(const std::string& file,
                            const std::string& function) const {
  return fns_.count(key_of(file, function)) > 0;
}

FlowGraph::Reach FlowGraph::query(const std::string& file,
                                 const std::string& function) const {
  Reach best;
  const auto it = fns_.find(key_of(file, function));
  if (it == fns_.end()) return best;
  const CodingFlowFunction& fn = it->second;
  if (fn.sources.empty() || fn.sinks.empty()) return best;

  std::set<int> sink_lines;
  for (const auto& s : fn.sinks) sink_lines.insert(s.line);

  // If the summarizer gave no edges but flagged both a source and a sink,
  // treat them as connected (recall-biased): the region needs a hard look.
  if (fn.edges.empty()) {
    best.reachable = true;
    best.unsanitized = true;
    best.source_kind = fn.sources.front().kind;
    best.sink_kind = fn.sinks.front().kind;
    best.sink_line = fn.sinks.front().line;
    return best;
  }

  // Adjacency with a per-edge sanitized flag.
  std::multimap<int, std::pair<int, bool>> adj;
  for (const auto& e : fn.edges)
    adj.emplace(e.from_line, std::make_pair(e.to_line, e.sanitized));

  for (const auto& src : fn.sources) {
    // BFS over (line, saw_sanitized_edge_on_path).
    std::deque<std::pair<int, bool>> q;
    std::set<std::pair<int, bool>> seen;
    q.emplace_back(src.line, false);
    seen.insert({src.line, false});
    while (!q.empty()) {
      auto [line, tainted_by_sanitizer] = q.front();
      q.pop_front();
      if (sink_lines.count(line)) {
        if (!best.reachable) {
          best.reachable = true;
          best.source_kind = src.kind;
          best.sink_line = line;
          for (const auto& s : fn.sinks)
            if (s.line == line) best.sink_kind = s.kind;
        }
        if (!tainted_by_sanitizer) {
          best.unsanitized = true;
          best.source_kind = src.kind;
          best.sink_line = line;
          for (const auto& s : fn.sinks)
            if (s.line == line) best.sink_kind = s.kind;
          return best;  // strongest possible result
        }
      }
      auto range = adj.equal_range(line);
      for (auto e = range.first; e != range.second; ++e) {
        const int to = e->second.first;
        const bool san = tainted_by_sanitizer || e->second.second;
        if (seen.insert({to, san}).second) q.emplace_back(to, san);
      }
    }
  }
  return best;
}

}  // namespace redteam
