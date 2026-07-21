#pragma once
#include <map>
#include <string>
#include <vector>

#include "redteam/Signals.hpp"
#include "redteam/ports/FileSource.hpp"

namespace redteam {

// A FileSource backed by an in-memory path->content map. Applies the same
// include/exclude/binary filtering as the filesystem source, so the whole
// pipeline runs in tests without disk.
class InMemoryFileSource : public FileSource {
 public:
  InMemoryFileSource(std::map<std::string, std::string> files, ProjectSpec project);

  std::vector<LoadedFile> load() override;
  std::optional<std::string> read(const std::string& relpath) override;

 private:
  std::map<std::string, std::string> files_;
  ProjectSpec project_;
};

}  // namespace redteam
