#pragma once
#include <optional>
#include <string>
#include <vector>

// Outbound port: reads the currently-written project files. Implementations
// apply include/exclude globs and size caps. An in-memory variant lets the
// whole pipeline run in tests without touching disk.
namespace redteam {

struct LoadedFile {
  std::string path;  // project-root-relative
  std::string content;
};

class FileSource {
 public:
  virtual ~FileSource() = default;

  // All files matching the configured include/exclude globs and size cap.
  virtual std::vector<LoadedFile> load() = 0;

  // Single file by root-relative path; nullopt if absent or filtered out.
  virtual std::optional<std::string> read(const std::string& relpath) = 0;
};

}  // namespace redteam
