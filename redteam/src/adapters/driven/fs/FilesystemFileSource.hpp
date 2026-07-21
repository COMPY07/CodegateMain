#pragma once
#include "redteam/Factories.hpp"
#include "redteam/Signals.hpp"
#include "redteam/ports/FileSource.hpp"

namespace redteam {

// Reads the project from disk, applying include/exclude globs, a per-file size
// cap, and binary-file skipping. Paths are reported project-root-relative.
class FilesystemFileSource : public FileSource {
 public:
  explicit FilesystemFileSource(ProjectSpec project);

  std::vector<LoadedFile> load() override;
  std::optional<std::string> read(const std::string& relpath) override;

 private:
  ProjectSpec project_;
};

// Default production factory: builds a FilesystemFileSource per request.
FileSourceFactory default_file_source_factory();

}  // namespace redteam
