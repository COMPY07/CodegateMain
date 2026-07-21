#include "adapters/driven/fs/InMemoryFileSource.hpp"

#include "adapters/driven/fs/PathFilter.hpp"

namespace redteam {

InMemoryFileSource::InMemoryFileSource(std::map<std::string, std::string> files,
                                      ProjectSpec project)
    : files_(std::move(files)), project_(std::move(project)) {}

std::vector<LoadedFile> InMemoryFileSource::load() {
  std::vector<LoadedFile> out;
  for (const auto& [path, content] : files_) {  // std::map => sorted by path
    if (!path_selected(path, project_.include, project_.exclude)) continue;
    if (content.size() > project_.max_file_bytes) continue;
    if (looks_binary(content)) continue;
    out.push_back(LoadedFile{path, content});
  }
  return out;
}

std::optional<std::string> InMemoryFileSource::read(const std::string& relpath) {
  if (!path_selected(relpath, project_.include, project_.exclude))
    return std::nullopt;
  auto it = files_.find(relpath);
  if (it == files_.end()) return std::nullopt;
  if (it->second.size() > project_.max_file_bytes) return std::nullopt;
  if (looks_binary(it->second)) return std::nullopt;
  return it->second;
}

}  // namespace redteam
