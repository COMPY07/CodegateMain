#include "adapters/driven/fs/FilesystemFileSource.hpp"

#include <algorithm>
#include <filesystem>
#include <fstream>
#include <system_error>

#include "adapters/driven/fs/PathFilter.hpp"

namespace redteam {
namespace fs = std::filesystem;
namespace {

std::string read_whole(const fs::path& p) {
  std::ifstream in(p, std::ios::binary);
  if (!in) return {};
  std::string content((std::istreambuf_iterator<char>(in)),
                      std::istreambuf_iterator<char>());
  return content;
}

}  // namespace

FilesystemFileSource::FilesystemFileSource(ProjectSpec project)
    : project_(std::move(project)) {}

std::vector<LoadedFile> FilesystemFileSource::load() {
  std::vector<LoadedFile> out;
  std::error_code ec;
  const fs::path root(project_.root);
  if (!fs::is_directory(root, ec)) return out;

  fs::recursive_directory_iterator it(
      root, fs::directory_options::skip_permission_denied, ec);
  const fs::recursive_directory_iterator end;
  for (; it != end; it.increment(ec)) {
    if (ec) {
      ec.clear();
      continue;
    }
    if (!it->is_regular_file(ec)) continue;

    const fs::path& abs = it->path();
    const std::string rel = fs::relative(abs, root, ec).generic_string();
    if (rel.empty() || !path_selected(rel, project_.include, project_.exclude))
      continue;

    const auto sz = fs::file_size(abs, ec);
    if (ec || sz > project_.max_file_bytes) {
      ec.clear();
      continue;
    }
    std::string content = read_whole(abs);
    if (looks_binary(content)) continue;
    out.push_back(LoadedFile{rel, std::move(content)});
  }

  std::sort(out.begin(), out.end(),
            [](const LoadedFile& a, const LoadedFile& b) { return a.path < b.path; });
  return out;
}

std::optional<std::string> FilesystemFileSource::read(const std::string& relpath) {
  if (!path_selected(relpath, project_.include, project_.exclude))
    return std::nullopt;
  std::error_code ec;
  const fs::path abs = fs::path(project_.root) / relpath;
  if (!fs::is_regular_file(abs, ec)) return std::nullopt;
  const auto sz = fs::file_size(abs, ec);
  if (ec || sz > project_.max_file_bytes) return std::nullopt;
  std::string content = read_whole(abs);
  if (looks_binary(content)) return std::nullopt;
  return content;
}

FileSourceFactory default_file_source_factory() {
  return [](const ProjectSpec& p) -> std::unique_ptr<FileSource> {
    return std::make_unique<FilesystemFileSource>(p);
  };
}

}  // namespace redteam
